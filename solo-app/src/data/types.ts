export type AppView = 'landing' | 'analyzing' | 'dashboard';
export type MainView = 'page-editor' | 'cms-table' | 'tech-detail';
export type ThemeMode = 'dark' | 'light';
export type DashboardTab = 'editor' | 'content' | 'settings' | 'insights';

export interface Page {
  id: string;
  name: string;
  path: string;
  /** Actual URL fragment to load this page in the preview iframe.
   *  Hash SPAs: "#/blog", pushState SPAs: "/blog", file-based: "/blog.html"
   *  If absent, falls back to /preview{path} */
  navigateTo?: string;
  seoStatus: 'complete' | 'partial' | 'missing';
  sections: Section[];
}

export interface Section {
  id: string;
  type: 'hero' | 'header' | 'features' | 'testimonials' | 'cta' | 'footer' | 'stats' | 'logos' | 'generic';
  name: string;
  bindings: ContentBinding[];
}

export interface ContentBinding {
  fieldId: string;
  contentTypeId: string;
  fieldName: string;
}

export type ContentFieldType = 'text' | 'richtext' | 'image' | 'date' | 'url' | 'number' | 'boolean' | 'select' | 'email' | 'slug';

export interface ContentField {
  id: string;
  name: string;
  type: ContentFieldType;
  required: boolean;
}

export interface ContentType {
  id: string;
  name: string;
  varName?: string;  // JS variable name from source (e.g. "products", "blogPosts")
  fields: ContentField[];
  items: ContentItem[];
  linkedPages: string[];
}

export interface ContentItem {
  id: string;
  data: Record<string, unknown>;
  status: 'published' | 'draft';
  createdAt: string;
  updatedAt: string;
}

export interface MediaAsset {
  id: string;
  name: string;
  type: 'image' | 'svg' | 'document' | 'font';
  size: string;
  dimensions?: string;
  optimized: boolean;
  usedIn: string[];
}

export interface TechSector {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: 'connected' | 'needs-setup' | 'not-started' | 'ready';
  automation: 'automated' | 'guided' | 'manual';
  tasks: SectorTask[];
  providers: ProviderOption[];
}

export interface SectorTask {
  id: string;
  label: string;
  description: string;
  completed: boolean;
  automation: 'auto' | 'manual';
}

export interface ProviderOption {
  id: string;
  name: string;
  description: string;
  price: string;
  recommended?: boolean;
  tier: 'budget' | 'balanced' | 'scale';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  actions?: ChatAction[];
}

export interface ChatAction {
  label: string;
  type: 'navigate' | 'configure' | 'create';
  target: string;
}

export interface AnalysisStep {
  id: string;
  label: string;
  description: string;
  status: 'pending' | 'in-progress' | 'complete';
  details?: string[];
}

export interface ReadinessItem {
  id: string;
  label: string;
  description: string;
  status: 'complete' | 'in-progress' | 'blocked' | 'not-started';
  sector: string;
  automation: 'automated' | 'guided' | 'manual';
}

export interface AILaunchRecommendation {
  id: string;
  label: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  sector: string;
}

export interface AIInsights {
  businessSummary: string;
  businessType: string;
  targetAudience: string;
  launchRecommendations: AILaunchRecommendation[];
  contentGaps: { name: string; reason: string }[];
  pageGaps: { name: string; path: string; reason: string }[];
  seoInsights: string[];
}

export type LimitWarningType =
  | 'rate_limit'
  | 'overloaded'
  | 'budget'
  | 'timeout'
  | 'context_window'
  | 'auth'
  | 'no_api_key'
  | 'unknown';

export interface LimitWarning {
  type: LimitWarningType;
  title: string;
  message: string;
}

export interface Project {
  name: string;
  url: string;
  pages: Page[];
  contentTypes: ContentType[];
  media: MediaAsset[];
  sectors: TechSector[];
  readinessItems: ReadinessItem[];
  readinessScore: number;
  aiInsights?: AIInsights;
  /** Set when AI analysis was interrupted or skipped due to a limit/error */
  limitWarning?: LimitWarning;
}

export interface UploadResult {
  fileCount: number;
  fileTree: string[];
  entryFile: string;
}

// ─── Deploy Bundles ──────────────────────────────────────────────
// Sol OS acts as middleman - one Sol account manages all providers.
// Clients pick a bundle (or customize), no individual provider accounts needed.

export type BundleTier = 'starter' | 'pro' | 'scale';

export interface BundleProvider {
  sectorId: string;
  sectorName: string;
  providerName: string;
  description: string;
}

export interface DeployBundle {
  id: BundleTier;
  name: string;
  tagline: string;
  price: string;
  priceNote: string;
  recommended?: boolean;
  providers: BundleProvider[];
  features: string[];
}
