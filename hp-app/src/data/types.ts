// ─── App state ────────────────────────────────────────────────────────────────

export type AppView   = 'landing' | 'analyzing' | 'dashboard';
export type ThemeMode = 'dark' | 'light';

// ─── Project (returned by /api/analysis) ─────────────────────────────────────

export interface Page {
  id: string;
  name: string;
  path: string;
  navigateTo?: string;
  seoStatus: 'complete' | 'partial' | 'missing';
  sections: Section[];
}

export interface Section {
  id: string;
  type: 'hero' | 'header' | 'features' | 'testimonials' | 'cta' | 'footer' | 'stats' | 'logos' | 'generic';
  name: string;
}

export interface Project {
  name: string;
  url: string;
  pages: Page[];
}

// ─── Upload response ──────────────────────────────────────────────────────────

export interface UploadResult {
  fileCount: number;
  fileTree: string[];
  entryFile: string;
}
