import fs from 'fs/promises';
import path from 'path';
import { writeAnalysis, getProjectState, setProjectState } from '../state.js';
import { analyzeMedia } from './media.js';
import { buildProject } from './build.js';
import { runAutonomousAgent } from './autonomousAgent.js';
import { mapToProject } from './outputSchema.js';
import { injectHPDataBridge } from '../engine/injector.js';
import { emitLog, type LimitType } from '../progress.js';
import { detectProject } from './detector.js';

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

  // ── Step 0: Detect archetype + generator (fast, filesystem-only) ──
  const detection = await detectProject(projectRoot);
  console.log(`  Archetype: ${detection.archetype.id} | Generator: ${detection.generator.id} (${detection.generator.confidence})`);
  emitLog({ type: 'info', message: `Detected: ${detection.archetype.displayName}${detection.generator.id !== 'UNKNOWN' ? ` · Built with ${detection.generator.displayName}` : ''}` });

  // Persist detection to state immediately so UI can show it
  const detectionState = getProjectState();
  if (detectionState) {
    setProjectState({
      ...detectionState,
      archetypeId: detection.archetype.id,
      generatorId: detection.generator.id,
      generatorConfidence: detection.generator.confidence,
      generatorNotice: detection.generator.notice,
    });
  }

  // ── Step 1: Build if needed (archetype-driven) ────────────────────
  const buildResult = await buildProject(projectRoot, { archetype: detection.archetype });

  if (buildResult.needed) {
    console.log(`  Build: ${buildResult.success ? 'SUCCESS' : 'FAILED'}`);
    if (buildResult.buildError) {
      console.log(`  Build error: ${buildResult.buildError.slice(0, 200)}`);
    }
    const state = getProjectState();
    if (state) {
      setProjectState({
        ...state,
        servePath: buildResult.servePath,
        buildNeeded: true,
        buildSuccess: buildResult.success,
        buildError: buildResult.buildError,
      });
    }
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

      // ── Phase 2: Deterministic window.__HP_DATA injector ────────────
      // Now that we know which files contain content arrays, deterministically
      // inject the bridge pattern — no AI, no guessing, minimal targeted patches.
      if (aiOutput.contentCollections && aiOutput.contentCollections.length > 0) {
        emitLog({ type: 'info', message: `Injecting data bridge for ${aiOutput.contentCollections.length} collection(s)…` });
        try {
          const injectionResults = await injectHPDataBridge(projectRoot, aiOutput.contentCollections);
          const injected = injectionResults.filter(r => r.injected);
          const skipped = injectionResults.filter(r => !r.injected);
          if (injected.length > 0) {
            emitLog({ type: 'insight', message: `Bridge injected: ${injected.map(r => r.varName).join(', ')}` });
            console.log(`[analyze] Phase 2 injector: ${injected.length} collections bridged, ${skipped.length} skipped`);
            for (const s of skipped) {
              console.log(`  Skipped ${s.varName}: ${s.reason}`);
            }

            // ── Phase 3: Rebuild so the dist bundle contains __HP_DATA patterns ──
            // The initial build ran before injection so its bundles have raw arrays.
            // We must rebuild now that the source is patched, otherwise the iframe
            // preview will ignore window.__HP_DATA and show the hardcoded data.
            const stateForRebuild = getProjectState();
            if (stateForRebuild?.buildNeeded) {
              emitLog({ type: 'info', message: 'Rebuilding with CMS data bridge…' });
              try {
                const rebuild = await buildProject(projectRoot, { force: true });
                if (rebuild.success && rebuild.servePath) {
                  setProjectState({ ...stateForRebuild, servePath: rebuild.servePath });
                  emitLog({ type: 'insight', message: 'Rebuild complete — CMS bridge baked into preview' });
                  console.log(`[analyze] Phase 3 rebuild complete → ${rebuild.servePath}`);
                } else {
                  console.warn('[analyze] Phase 3 rebuild failed (non-fatal):', rebuild.buildError?.slice(0, 200));
                }
              } catch (rebuildErr) {
                console.warn('[analyze] Phase 3 rebuild threw (non-fatal):', rebuildErr instanceof Error ? rebuildErr.message : rebuildErr);
              }
            }
          }
        } catch (err) {
          console.warn('[analyze] Phase 2 injector failed (non-fatal):', err instanceof Error ? err.message : err);
        }
      }
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
  console.log('Analysis written to .sol-analysis.json');
  return project;
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
