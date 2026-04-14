// ─── App state ────────────────────────────────────────────────────────────────

export type AppView   = 'landing' | 'analyzing' | 'framework-confirm' | 'env-gate' | 'dashboard';
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
  type: string;
  name: string;
}

export interface ContentField {
  id: string;
  name: string;
  type: 'text' | 'richtext' | 'image' | 'date' | 'url' | 'number' | 'boolean' | 'select' | 'email' | string;
  required: boolean;
}

export interface ContentItem {
  id: string;
  data: Record<string, unknown>;
  status: 'published' | 'draft';
  createdAt: string;
  updatedAt: string;
}

export interface ContentType {
  id: string;
  name: string;
  varName: string;
  fields: ContentField[];
  items: ContentItem[];
  linkedPages: string[];
  sourceBindings?: {
    file: string;
    varName: string;
    sourceType?: string;
    sourcePath?: string;
    items: Record<string, { itemIndex: number }>;
  };
}

export interface AIInsights {
  businessSummary: string;
  businessType: string;
  targetAudience: string;
  launchRecommendations: { id: string; label: string; description: string; priority: 'high' | 'medium' | 'low'; sector: string }[];
  contentGaps: string[];
  pageGaps: string[];
  seoInsights: string[];
}

export interface ReadinessItem {
  id: string;
  label: string;
  status: 'complete' | 'in-progress' | 'not-started';
}

export interface Project {
  name: string;
  url: string;
  pages: Page[];
  contentTypes: ContentType[];
  readinessScore: number;
  readinessItems: ReadinessItem[];
  aiInsights: AIInsights;
}

// ─── Upload response ──────────────────────────────────────────────────────────

export interface UploadResult {
  fileCount: number;
  fileTree: string[];
  entryFile: string;
}
