import fs from 'fs/promises';
import path from 'path';
import { writeAnalysis, getProjectState, setProjectState } from '../state.js';
import { analyzeMedia } from './media.js';
import { buildProject } from './build.js';
import { runAutonomousAgent } from './autonomousAgent.js';
import { mapToProject } from './outputSchema.js';
import { emitLog, type LimitType } from '../progress.js';
import { detectProject } from './detector.js';
import { applyPatches } from './patch.js';
import { ARCHETYPES, type ArchetypeId } from './archetypes.js';
import { existsSync } from 'fs';

// ─── Limit error classifier ───────────────────────────────────────────

interface LimitWarning {
  type: LimitType;
  title: string;
  message: string;
}

function classifyAnalysisError(err: unknown): LimitWarning {
  const e = err as any;
  const msg: string = e?.message ?? String(err);
  const status: number | undefined = e?.status;

  if (status === 429 || msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('rate_limit')) {
    return {
      type: 'rate_limit',
      title: 'API rate limit hit',
      message: 'The Anthropic API rate limit was reached mid-analysis. Dashboard data may be incomplete. Wait a minute and re-upload to get full AI analysis.',
    };
  }
  if (status === 529 || msg.toLowerCase().includes('overloaded')) {
    return {
      type: 'overloaded',
      title: 'Anthropic API overloaded',
      message: 'Anthropic\'s servers were overloaded during analysis. The dashboard fell back to heuristic mode. Try re-uploading in a few minutes.',
    };
  }
  if (status === 401) {
    return {
      type: 'auth',
      title: 'Invalid API key',
      message: 'The ANTHROPIC_API_KEY is invalid or expired. AI analysis was skipped — dashboard shows heuristic data only.',
    };
  }
  if (status === 403) {
    return {
      type: 'auth',
      title: 'API access denied',
      message: 'Access denied by Anthropic (403). Your API key may be on a tier that doesn\'t have access to Claude Sonnet. Check your plan.',
    };
  }
  if (msg.toLowerCase().includes('context') || msg.includes('context_length') || msg.includes('context window')) {
    return {
      type: 'context_window',
      title: 'Context window exceeded',
      message: 'The project is too large for the AI\'s context window. Analysis was cut short. Consider zipping only the core src/ folder.',
    };
  }
  if (msg.includes('tool call budget') || msg.includes('50')) {
    return {
      type: 'budget',
      title: 'AI tool-call budget exhausted',
      message: 'The AI used all 50 allowed tool calls before finishing. CMS content extraction and some pages may be missing. Re-upload a smaller or more focused project.',
    };
  }
  if (msg.toLowerCase().includes('timeout') || msg.includes('10 minutes')) {
    return {
      type: 'timeout',
      title: 'Analysis timed out',
      message: 'AI analysis exceeded the 10-minute limit. The project may be too large. Try zipping only the src/ folder and re-uploading.',
    };
  }
  if (msg.includes('write_analysis')) {
    return {
      type: 'budget',
      title: 'AI analysis incomplete',
      message: 'The AI agent finished early without writing the full analysis. Some pages or CMS collections may be missing.',
    };
  }
  return {
    type: 'unknown',
    title: 'AI analysis failed',
    message: `Analysis fell back to heuristic mode. Reason: ${msg.slice(0, 200)}`,
  };
}

export async function analyzeProject(projectRoot: string, fileTree: string[]) {
  console.log(`Analyzing project at ${projectRoot} (${fileTree.length} files)...`);

  // ── Stage 1: Heuristics — fast filesystem-only detection (<100ms) ──
  const detection = await detectProject(projectRoot);
  console.log(`  Archetype: ${detection.archetype.id} [${detection.confidence}] | Generator: ${detection.generator.id} | needsBackend: ${detection.needsBackend}`);
  emitLog({ type: 'info', message: `Detected: ${detection.archetype.displayName}${detection.generator.id !== 'UNKNOWN' ? ` · Built with ${detection.generator.displayName}` : ''}` });

  // Persist detection to state immediately so UI can show it
  const detectionState = getProjectState();
  if (detectionState) {
    setProjectState({
      ...detectionState,
      archetypeId: detection.archetype.id,
      detectionConfidence: detection.confidence,
      needsBackend: detection.needsBackend,
      generatorId: detection.generator.id,
      generatorConfidence: detection.generator.confidence,
      generatorNotice: detection.generator.notice,
    });
  }

  // ── Apply automatic patch set before any build attempt ────────────
  emitLog({ type: 'info', message: 'Applying compatibility patches…' });
  await applyPatches(projectRoot);

  // ── Stage 1 fast path: high-confidence archetype → single build attempt ──
  let buildResult = await buildProject(projectRoot, { archetype: detection.archetype });

  // ── Stage 2: Multi-strategy build (low confidence OR first build failed) ──
  if (!buildResult.success && buildResult.needed) {
    buildResult = await multiStrategyBuild(projectRoot, buildResult);
  }

  if (buildResult.needed) {
    console.log(`  Build: ${buildResult.success ? 'SUCCESS' : 'FAILED'}`);
    if (buildResult.buildError) {
      console.log(`  Build error: ${buildResult.buildError.slice(0, 200)}`);
    }
    const state = getProjectState();
    if (state) {
      setProjectState({
        ...state,
        servePath: buildResult.success ? buildResult.servePath : state.projectRoot,
        buildNeeded: true,
        buildSuccess: buildResult.success,
        buildError: buildResult.buildError,
        buildOutput: buildResult.buildOutput,
      });
    }
  }

  // ── Stage 3: User confirmation needed — stop here, wait for API call ──
  if (buildResult.needed && !buildResult.success) {
    emitLog({ type: 'error', message: `Build failed — waiting for your input to continue.` });
    // State already persisted above. The frontend will detect buildSuccess=false
    // and show the FrameworkConfirmView. Analysis continues once they submit.
    return null;
  }

  // ── Step 2: Media analysis (fast heuristic, runs in parallel) ────
  const mediaPromise = analyzeMedia(projectRoot, fileTree);

  // ── Step 3: Autonomous AI agent ───────────────────────────────────
  const name = await deriveProjectName(projectRoot, fileTree);
  let project: ReturnType<typeof mapToProject> | null = null;

  // Read env at call-time (not import-time) to avoid dotenv ordering issues
  const aiEnabled = process.env.MOCK_AI !== 'true'
    && (!!process.env.ANTHROPIC_API_KEY || process.env.USE_LOCAL_CLAUDE === 'true');

  if (aiEnabled) {
    try {
      emitLog({ type: 'info', message: `Starting autonomous analysis of ${name}…` });

      const aiOutput = await runAutonomousAgent(
        projectRoot,
        fileTree,
        (event) => emitLog(event),
        detection,
      );

      const media = await mediaPromise;
      project = mapToProject(aiOutput, media);

      // Persist build/deploy metadata from AI output to project state
      const currentState = getProjectState();
      if (currentState && (aiOutput.buildCommand || aiOutput.outputDir)) {
        setProjectState({
          ...currentState,
          buildCommand: aiOutput.buildCommand !== 'none' ? aiOutput.buildCommand : undefined,
          outputDir: aiOutput.outputDir !== '.' ? aiOutput.outputDir : undefined,
        });
      }

      console.log(`[analyze] Autonomous agent complete — ${project.pages.length} pages, ${project.contentTypes.length} content types`);
    } catch (err) {
      console.warn('[analyze] Autonomous agent failed:', err instanceof Error ? err.message : err);
      const warning = classifyAnalysisError(err);
      emitLog({ type: 'error', message: `⚠ ${warning.title} — ${warning.message}`, limitType: warning.type });
      // Stamp warning onto heuristic project below
      const media = await mediaPromise;
      project = buildHeuristicProject(name, fileTree, media);
      (project as any).limitWarning = warning;
    }
  } else {
    const warning: LimitWarning = {
      type: 'no_api_key',
      title: 'No API key configured',
      message: 'ANTHROPIC_API_KEY is not set. AI analysis was skipped — the dashboard shows heuristic data only. Add an API key to the server\'s .env file for full analysis.',
    };
    emitLog({ type: 'info', message: 'No API key — skipping AI analysis', limitType: 'no_api_key' });
    console.log('[analyze] AI skipped (no API key or MOCK_AI=true)');
    const media = await mediaPromise;
    project = buildHeuristicProject(name, fileTree, media);
    (project as any).limitWarning = warning;
  }

  // ── Step 4: Fallback to heuristic if AI failed or skipped ────────
  if (!project) {
    const media = await mediaPromise;
    project = buildHeuristicProject(name, fileTree, media);
  }

  await writeAnalysis(project);
  console.log('[analyze] Analysis written');
  return project;
}

// ─── Stage 2: Multi-strategy build ───────────────────────────────────

/**
 * Try alternative build strategies when Stage 1 fails.
 *
 * Strategy A: check if dist/build/out already contains index.html (pre-built)
 * Strategy B: try each known framework CLI directly
 * Strategy C: npm run build with a plain npm run build command (already tried in Stage 1, skip)
 */
async function multiStrategyBuild(
  projectRoot: string,
  previousResult: import('./build.js').BuildResult,
): Promise<import('./build.js').BuildResult> {
  emitLog({ type: 'info', message: 'Trying alternative build strategies…' });

  // Strategy A: check if a pre-built output already exists
  const outputDirs = ['dist', 'build', 'out', '.next/out', 'public'];
  for (const dir of outputDirs) {
    const dirPath = path.join(projectRoot, dir);
    if (existsSync(path.join(dirPath, 'index.html'))) {
      console.log(`  [stage2] Found pre-built output at ${dir}/`);
      emitLog({ type: 'info', message: `Found existing build output at ${dir}/ — using it.` });
      return { needed: false, success: true, servePath: dirPath };
    }
  }

  // Strategy B: try framework CLIs directly
  const cliStrategies: Array<{ label: string; archetype: ArchetypeId; command: string; outputDir: string }> = [
    { label: 'vite build',  archetype: 'vite-react', command: 'npx vite build', outputDir: 'dist' },
    { label: 'next build',  archetype: 'nextjs-app-router', command: 'npx next build', outputDir: 'out' },
    { label: 'astro build', archetype: 'astro', command: 'npx astro build', outputDir: 'dist' },
  ];

  for (const strategy of cliStrategies) {
    const archetype = ARCHETYPES[strategy.archetype];
    emitLog({ type: 'info', message: `Trying ${strategy.label}…` });
    const result = await buildProject(projectRoot, {
      archetype,
      force: true,
      buildCommand: strategy.command,
    });
    if (result.success) {
      console.log(`  [stage2] ${strategy.label} succeeded`);
      return result;
    }
    console.log(`  [stage2] ${strategy.label} failed: ${result.buildError?.slice(0, 100)}`);
  }

  // All strategies failed — return the original failure for Stage 3 handling
  return previousResult;
}

// ─── Heuristic fallback (no AI) ───────────────────────────────────────

function buildHeuristicProject(
  name: string,
  fileTree: string[],
  media: Awaited<ReturnType<typeof analyzeMedia>>,
) {
  const htmlPages = fileTree.filter(f => f.endsWith('.html') && !f.includes('node_modules'));

  const pages = htmlPages.length > 0
    ? htmlPages.map(f => {
        const pageName = path.basename(f, '.html');
        const isIndex = pageName === 'index';
        return {
          id: `page-${pageName}`,
          name: isIndex ? 'Home' : pageName.charAt(0).toUpperCase() + pageName.slice(1),
          path: isIndex ? '/' : `/${pageName}`,
          navigateTo: isIndex ? '/' : `/${f}`,
          seoStatus: 'missing' as const,
          sections: [],
        };
      })
    : [{
        id: 'page-home',
        name: 'Home',
        path: '/',
        navigateTo: '/',
        seoStatus: 'missing' as const,
        sections: [],
      }];

  return {
    name,
    url: '',
    pages,
    contentTypes: [],
    media,
    sectors: [],
    readinessItems: [],
    readinessScore: 0,
    aiInsights: {
      businessSummary: `${name} — project analysis requires an API key.`,
      businessType: 'Website',
      targetAudience: 'General audience',
      launchRecommendations: [],
      contentGaps: [],
      pageGaps: [],
      seoInsights: [],
    },
  };
}

// ─── Project name derivation ──────────────────────────────────────────

async function deriveProjectName(projectRoot: string, fileTree: string[]): Promise<string> {
  // Try package.json
  if (fileTree.includes('package.json')) {
    try {
      const raw = await fs.readFile(path.join(projectRoot, 'package.json'), 'utf-8');
      const pkg = JSON.parse(raw);
      const generic = ['vite-project', 'my-app', 'app', 'react-app', 'my-project', 'frontend', 'client', 'web'];
      if (pkg.name && !generic.includes(pkg.name.toLowerCase())) {
        const name = pkg.name
          .replace(/^@[^/]+\//, '')
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, (c: string) => c.toUpperCase());
        if (name.length > 0 && name.length < 40) return name;
      }
    } catch { /* ignore */ }
  }

  // Try index.html <title>
  const indexHtmlPath = fileTree.find(f => f === 'index.html' || f.endsWith('/index.html'));
  if (indexHtmlPath) {
    try {
      const html = await fs.readFile(path.join(projectRoot, indexHtmlPath), 'utf-8');
      const match = html.match(/<title>([^<]+)<\/title>/i);
      if (match) {
        const title = match[1].trim().split(/\s*[|–—-]\s*/)[0].trim();
        if (title && title.length > 0 && title.length < 40) return title;
      }
    } catch { /* ignore */ }
  }

  // Fall back to directory name
  const dirName = projectRoot.split('/').filter(Boolean).pop() ?? 'Imported Project';
  return dirName.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
