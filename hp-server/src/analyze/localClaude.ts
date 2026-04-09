/**
 * Local Claude Bridge
 *
 * Runs prompts through the Claude Code CLI binary instead of the Anthropic cloud API.
 * The CLI uses OAuth/keychain authentication (Claude subscription) — no API credits consumed.
 *
 * How it works:
 *   1. Spawns `claude --print` as a subprocess
 *   2. Strips ANTHROPIC_API_KEY from the subprocess environment
 *      → forces Claude CLI to use macOS Keychain OAuth (subscription auth)
 *   3. Returns the text response
 *
 * Enable via: USE_LOCAL_CLAUDE=true in .env
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

// Read lazily at call-time — NOT at module load time.
// Module-level constants are evaluated before dotenv.config() runs in ESM/tsx,
// so process.env.USE_LOCAL_CLAUDE would always be undefined at import time.
export function isLocalMode(): boolean {
  return process.env.USE_LOCAL_CLAUDE === 'true';
}

// Keep backwards-compat export (but reads env at call time now)
export const USE_LOCAL = false; // do not use — use isLocalMode() instead

// Binary path read lazily too (same reason)
function getClaudeBin(): string {
  return process.env.CLAUDE_BIN
    ?? '/Users/nirxrubin/Library/Application Support/Claude/claude-code/2.1.87/claude.app/Contents/MacOS/claude';
}

// ─── Core subprocess runner ───────────────────────────────────────────

export async function askLocalClaude(
  prompt: string,
  options: {
    systemPrompt?: string;
    model?: string;        // 'haiku' | 'sonnet' | 'opus' | full model name
    maxTokens?: number;    // informational — claude CLI manages this itself
    timeoutMs?: number;
  } = {},
): Promise<string> {
  const {
    systemPrompt,
    model = 'haiku',
    timeoutMs = 120_000,
  } = options;

  const args: string[] = [
    '--print',
    '--output-format', 'text',
    '--model', model,
    '--no-session-persistence',
  ];

  if (systemPrompt) {
    args.push('--system-prompt', systemPrompt);
  }

  // Disable all file tools — we pass content inline in the prompt
  args.push('--tools', '');

  // DO NOT pass prompt as positional arg — large/multi-line strings cause
  // "args[N] must be a string without null bytes" on Node spawn.
  // Instead: pipe via stdin using --input-format text (default for --print).

  // Strip ANTHROPIC_API_KEY so the CLI uses OAuth/subscription auth (Claude Pro).
  // Keeping a zero-credit API key would cause the CLI to attempt API auth and fail.
  // With only HOME + full env (no API key), the CLI finds the macOS Keychain OAuth
  // token from the running Claude desktop app.
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;

  const claudeBin = getClaudeBin();

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const child = spawn(claudeBin, args, {
      env,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'], // stdin/stdout/stderr all piped
    });

    // Write prompt to stdin, then close it
    child.stdin.write(prompt, 'utf-8');
    child.stdin.end();

    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Local Claude timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        // The Claude CLI sends auth errors ("Not logged in") to stdout, not stderr.
        // Include both so the real error is always visible in server logs.
        const detail = [stderr.slice(0, 300), stdout.slice(0, 300)].filter(Boolean).join(' | stdout: ');
        reject(new Error(`Local Claude exited with code ${code}. stderr: ${detail}`));
        return;
      }
      resolve(stdout.trim());
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn Local Claude: ${err.message}`));
    });
  });
}

// ─── Project file collector ───────────────────────────────────────────
// Reads key source files for single-shot analysis (replaces multi-turn tool use)

const FILE_PRIORITY_PATTERNS = [
  'package.json',
  'next.config.*',
  'vite.config.*',
  'astro.config.*',
  'src/App.*',
  'src/main.*',
  'app/page.*',
  'app/layout.*',
  'src/router.*',
  'src/routes.*',
  'src/pages/**/*.*',
  'pages/**/*.*',
  'app/**/*.tsx',
  'app/**/*.ts',
  'src/**/*.tsx',
  'src/lib/**/*.ts',
  'src/data/**/*.ts',
];

const MAX_FILES = 40;
const MAX_FILE_CHARS = 4000; // truncate large files
const MAX_TOTAL_CHARS = 80_000; // ~20k tokens

export async function collectProjectFiles(
  projectRoot: string,
  fileTree: string[],
): Promise<{ path: string; content: string }[]> {
  // Score files by priority
  const scored = fileTree.map(f => {
    let score = 0;
    const lower = f.toLowerCase();
    if (lower === 'package.json') score += 100;
    if (lower.startsWith('app/') && lower.endsWith('.tsx')) score += 80;
    if (lower.startsWith('app/') && lower.endsWith('.ts')) score += 70;
    if (lower.startsWith('src/') && lower.endsWith('.tsx')) score += 60;
    if (lower.startsWith('src/') && lower.endsWith('.ts')) score += 50;
    if (lower.includes('config')) score += 40;
    if (lower.includes('page')) score += 30;
    if (lower.includes('route') || lower.includes('router')) score += 30;
    if (lower.includes('layout')) score += 25;
    if (lower.includes('data') || lower.includes('lib/')) score += 20;
    if (lower.endsWith('.json') && lower !== 'package.json') score += 5;
    return { path: f, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const selected = scored.slice(0, MAX_FILES);
  const result: { path: string; content: string }[] = [];
  let totalChars = 0;

  for (const { path: filePath } of selected) {
    if (totalChars >= MAX_TOTAL_CHARS) break;
    try {
      const absPath = path.join(projectRoot, filePath);
      let content = await fs.readFile(absPath, 'utf-8');
      if (content.length > MAX_FILE_CHARS) {
        content = content.slice(0, MAX_FILE_CHARS) + '\n... [truncated]';
      }
      totalChars += content.length;
      result.push({ path: filePath, content });
    } catch { /* skip unreadable files */ }
  }

  return result;
}

// ─── Build analysis prompt ────────────────────────────────────────────

export function buildAnalysisPrompt(
  fileTree: string[],
  files: { path: string; content: string }[],
): string {
  const fileTreeStr = fileTree.slice(0, 200).join('\n');
  const filesStr = files.map(f =>
    `=== ${f.path} ===\n${f.content}`
  ).join('\n\n');

  return `You are analyzing a web project. Study the files below and output a single JSON analysis object.

FILE TREE (${fileTree.length} total files, showing first 200):
${fileTreeStr}

KEY SOURCE FILES:
${filesStr}

Output a JSON object with this exact structure (no markdown, no explanation, just raw JSON):
{
  "projectName": "string — inferred from package.json name or directory",
  "projectType": "one of: hash-spa | history-spa | nextjs | astro | multi-page-html | other",
  "framework": "one of: vanilla-js | react | vue | nextjs | astro | svelte | angular | other",
  "entryPoint": "relative path to main entry file (e.g. index.html, src/main.tsx)",
  "routerFile": "relative path to router file if applicable, else omit",
  "navigationMechanism": "description of how navigation works",
  "buildCommand": "npm run build or equivalent",
  "outputDir": "dist | out | build | public — the directory produced by build",
  "devCommand": "npm run dev or equivalent",
  "spaFallback": true or false,
  "businessSummary": "one sentence about what this site/app does",
  "businessType": "SaaS | Agency | Portfolio | E-commerce | Blog | Non-profit | Community | Media | Other",
  "targetAudience": "who this is for in 5-10 words",
  "envVars": ["VITE_XYZ", "NEXT_PUBLIC_ABC"] or [],
  "pages": [
    {
      "name": "human-readable page name",
      "path": "/route-path",
      "navigateTo": "/route-path (must start with / or #)",
      "sourceFile": "relative path to page component/file",
      "seoTitle": "page title if found",
      "seoDescription": "meta description if found",
      "seoStatus": "complete | partial | missing",
      "sections": [
        { "id": "section-1", "type": "hero | nav | features | cta | footer | blog-grid | article | other", "label": "human label" }
      ]
    }
  ],
  "contentCollections": [
    {
      "name": "collection name",
      "file": "relative path to data file",
      "varName": "JavaScript variable name",
      "type": "blog | product | team | service | portfolio | other",
      "itemCount": 0,
      "fields": [{ "name": "fieldName", "type": "string | number | boolean | date | image | url" }],
      "items": []
    }
  ],
  "techStack": [
    { "category": "framework | css | database | auth | payments | analytics | hosting | other", "name": "tech name", "detected": true, "confidence": "certain | likely | inferred" }
  ],
  "readiness": {
    "score": 60,
    "items": [
      { "label": "item label", "status": "complete | missing | partial" }
    ]
  }
}

Rules:
- Include ALL pages found in the project, including sub-pages
- For Next.js with output:export, outputDir = "out"
- For Next.js without output:export, outputDir = ".next"
- Detect ALL content collections (arrays of data objects in TypeScript/JS files)
- The readiness score should reflect actual project completeness (0-100)
- Output ONLY valid JSON. No markdown code fences.`;
}
