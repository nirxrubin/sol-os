import path from 'path';
import fs from 'fs/promises';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

const WORKSPACE = path.resolve(process.cwd(), '.workspace');

export function getWorkspacePath(): string {
  return WORKSPACE;
}

// ─── Project State (persisted to disk) ──────────────────────────
interface ProjectState {
  projectRoot: string;   // Source root (original extracted files)
  servePath: string;     // Path to serve for preview (may be dist/ after build)
  fileTree: string[];
  fileCount: number;
  entryFile: string;
  buildNeeded?: boolean;
  buildSuccess?: boolean;
  buildError?: string;
}

const STATE_FILE = path.join(WORKSPACE, '.sol-state.json');
const ANALYSIS_FILE = path.join(WORKSPACE, '.sol-analysis.json');

let projectState: ProjectState | null = null;
let analysisStatus: 'idle' | 'uploading' | 'analyzing' | 'complete' | 'error' = 'idle';

// Restore state from disk on module load
try {
  if (existsSync(STATE_FILE)) {
    const restored = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    // Ensure servePath exists (backward compat with older state files)
    if (!restored.servePath) {
      restored.servePath = restored.projectRoot;
    }
    projectState = restored;
    // If analysis file also exists, mark as complete
    if (existsSync(ANALYSIS_FILE)) {
      analysisStatus = 'complete';
    } else {
      analysisStatus = 'idle';
    }
  }
} catch { /* ignore */ }

export function setProjectState(state: ProjectState) {
  projectState = state;
  // Persist to disk synchronously
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
}

export function getAnalysisStatus() {
  return analysisStatus;
}

// ─── Analysis Results (file-based for MCP interop) ────────────────
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

// ─── Canvas Edits (persisted per page) ──────────────────────────
const EDITS_FILE = path.join(WORKSPACE, '.sol-edits.json');

export interface CanvasEdit {
  selector: string;
  type: 'text' | 'image';
  content: string;  // innerHTML for text, src for image
  alt?: string;     // alt text for images
}

export interface PageEdits {
  [pagePath: string]: CanvasEdit[];
}

export async function writeEdits(edits: PageEdits): Promise<void> {
  await fs.mkdir(WORKSPACE, { recursive: true });
  await fs.writeFile(EDITS_FILE, JSON.stringify(edits, null, 2));
}

export async function readEdits(): Promise<PageEdits> {
  try {
    const raw = await fs.readFile(EDITS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// ─── CMS Data (persisted) ───────────────────────────────────────
const CMS_FILE = path.join(WORKSPACE, '.sol-cms.json');

export async function writeCMS(data: unknown): Promise<void> {
  await fs.mkdir(WORKSPACE, { recursive: true });
  await fs.writeFile(CMS_FILE, JSON.stringify(data, null, 2));
}

export async function readCMS(): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(CMS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
