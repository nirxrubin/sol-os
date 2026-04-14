import path from 'path';
import fs from 'fs/promises';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

const WORKSPACE = path.resolve(process.cwd(), '.workspace');

export function getWorkspacePath(): string {
  return WORKSPACE;
}

// ─── Project State (persisted to disk) ──────────────────────────────

export interface ProjectState {
  projectRoot: string;   // Source root (original extracted files)
  servePath: string;     // Path to serve for preview (may be dist/ after build)
  fileTree: string[];
  fileCount: number;
  entryFile: string;
  buildNeeded?: boolean;
  buildSuccess?: boolean;
  buildError?: string;
  buildOutput?: string;
  buildCommand?: string;
  outputDir?: string;
  // Detection results
  archetypeId?: string;
  detectionConfidence?: 'high' | 'low';
  needsBackend?: boolean;
  generatorId?: string;
  generatorConfidence?: string;
  generatorNotice?: string;
  // Stage 3: user-confirmed framework override (set when user corrects detection)
  userConfirmedArchetype?: string;
  userBuildCommand?: string;
  // Env vars
  requiredEnvVars?: string[];
  providedEnvVars?: Record<string, string>;
  envVarsComplete?: boolean;
  // Deployment state
  projectSlug?: string;
  deploymentId?: string;
  deploymentUrl?: string;
  deploymentPagesUrl?: string;
}

const STATE_FILE    = path.join(WORKSPACE, '.hp-state.json');
const ANALYSIS_FILE = path.join(WORKSPACE, '.hp-analysis.json');

let projectState: ProjectState | null = null;
let analysisStatus: 'idle' | 'uploading' | 'analyzing' | 'complete' | 'error' = 'idle';

// Restore state from disk on module load
try {
  if (existsSync(STATE_FILE)) {
    const restored = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    if (!restored.servePath) restored.servePath = restored.projectRoot;
    projectState = restored;
    analysisStatus = existsSync(ANALYSIS_FILE) ? 'complete' : 'idle';
  }
} catch { /* ignore */ }

export function setProjectState(state: ProjectState) {
  projectState = state;
  try {
    mkdirSync(WORKSPACE, { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error('Failed to write state file:', err);
  }
}

export function getProjectState(): ProjectState | null {
  return projectState;
}

export function setAnalysisStatus(status: typeof analysisStatus) {
  analysisStatus = status;
  if (status === 'idle') projectState = null;
}

export function getAnalysisStatus() {
  return analysisStatus;
}

// ─── Analysis Results ────────────────────────────────────────────────

export async function writeAnalysis(data: unknown) {
  await fs.writeFile(ANALYSIS_FILE, JSON.stringify(data, null, 2));
}

export async function readAnalysis(): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(ANALYSIS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
