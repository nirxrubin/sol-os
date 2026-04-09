import type { Tool } from '@anthropic-ai/sdk/resources/messages.js';

// ─── What the AI returns when it calls write_analysis() ──────────────

export interface AIAnalysisOutput {
  projectName: string;
  projectType: 'hash-spa' | 'history-spa' | 'nextjs' | 'astro' | 'multi-page-html' | 'other';
  framework: string;       // "vanilla-js" | "react" | "vue" | "nextjs" | "astro" | etc.
  entryPoint: string;
  routerFile?: string;
  navigationMechanism: string;
  buildCommand: string;    // "npm run build" | "yarn build" | "npx vite build" etc.
  outputDir: string;       // "dist" | "out" | "build" | "public" etc.
  devCommand?: string;     // "npm run dev" | "yarn dev" etc.
  spaFallback: boolean;    // true = serve index.html for all unknown routes (React Router, Vue Router history)

  businessSummary?: string;
  businessType?: string;
  targetAudience?: string;

  envVars: string[];       // ["VITE_STRIPE_KEY", "VITE_SUPABASE_URL"] — all process.env.* and import.meta.env.* found

  pages: AIPage[];
  contentCollections: AIContentCollection[];
  techStack: AITechItem[];
  readiness: AIReadiness;
}

export interface AIPage {
  name: string;
  path: string;
  navigateTo: string;   // MUST start with "#" or "/"
  sourceFile: string;
  seoTitle?: string;
  seoDescription?: string;
  seoStatus: 'complete' | 'partial' | 'missing';
  sections: AISection[];
}

export interface AISection {
  id: string;
  type: string;
  label: string;
}

export interface AIContentCollection {
  name: string;
  file: string;
  varName: string;
  type: string;
  itemCount: number;
  fields: { name: string; type: string }[];
  items: Record<string, unknown>[];  // actual data extracted from source — every item in the array
  // Source mapping — used by dual-write CMS to patch original data files
  sourceType?: 'ts-array' | 'json' | 'mdx' | 'html';
  sourcePath?: string;  // template for item access, e.g. 'teamMembers[{i}].{field}'
}

export interface AITechItem {
  category: string;
  name: string;
  detected: boolean;
  confidence?: 'certain' | 'likely' | 'inferred';
}

export interface AIReadiness {
  score: number;
  items: { label: string; status: 'complete' | 'missing' | 'partial' }[];
}

// ─── JSON schema for the write_analysis tool ─────────────────────────

export const WRITE_ANALYSIS_TOOL: Tool = {
  name: 'write_analysis',
  description: 'Call this when you fully understand the project. This ends the analysis session and writes the result. Do not call it before you have read the router file and at least one page component.',
  input_schema: {
    type: 'object',
    required: ['projectName', 'projectType', 'framework', 'navigationMechanism', 'buildCommand', 'outputDir', 'spaFallback', 'envVars', 'pages', 'contentCollections', 'techStack', 'readiness'],
    properties: {
      projectName: { type: 'string' },
      projectType: {
        type: 'string',
        enum: ['hash-spa', 'history-spa', 'nextjs', 'astro', 'multi-page-html', 'other'],
      },
      framework: { type: 'string', description: 'vanilla-js | react | vue | nextjs | astro | svelte | etc.' },
      entryPoint: { type: 'string' },
      routerFile: { type: 'string' },
      navigationMechanism: { type: 'string', description: 'Human-readable. e.g. "React Router history mode — routes in src/App.tsx"' },
      buildCommand: { type: 'string', description: 'e.g. "npm run build". Use "none" for static HTML with no build step.' },
      outputDir: { type: 'string', description: 'e.g. "dist", "out", "build". Use "." for static HTML served from root.' },
      devCommand: { type: 'string' },
      spaFallback: { type: 'boolean', description: 'true if the server must serve index.html for all unknown routes (React Router, Vue Router history, etc.)' },
      envVars: {
        type: 'array',
        description: 'All environment variable names referenced in the source code (process.env.* or import.meta.env.*)',
        items: { type: 'string' },
      },
      businessSummary: { type: 'string' },
      businessType: { type: 'string' },
      targetAudience: { type: 'string' },
      pages: {
        type: 'array',
        items: {
          type: 'object',
          required: ['name', 'path', 'navigateTo', 'sourceFile', 'seoStatus'],
          properties: {
            name: { type: 'string' },
            path: { type: 'string', description: 'Normalized path, e.g. / or /blog' },
            navigateTo: {
              type: 'string',
              description: 'Exact URL to load this page in an iframe preview. Hash SPA: "#/routename". History SPA or Next.js: "/routename". HTML file: "/page.html". MUST start with # or /. Never a bare word.',
            },
            sourceFile: { type: 'string', description: 'File to write CMS edits to. For any hash SPA, always "index.html".' },
            seoTitle: { type: 'string' },
            seoDescription: { type: 'string' },
            seoStatus: { type: 'string', enum: ['complete', 'partial', 'missing'] },
            sections: {
              type: 'array',
              items: {
                type: 'object',
                required: ['id', 'type', 'label'],
                properties: {
                  id: { type: 'string' },
                  type: { type: 'string', description: 'hero | nav | features | testimonials | team | blog | cta | footer | stats | faq | generic' },
                  label: { type: 'string' },
                },
              },
            },
          },
        },
      },
      contentCollections: {
        type: 'array',
        items: {
          type: 'object',
          required: ['name', 'file', 'varName', 'type', 'itemCount', 'fields'],
          properties: {
            name: { type: 'string', description: 'Display name, e.g. Blog Posts, Team Members' },
            file: { type: 'string', description: 'Relative path to the file containing the data array' },
            varName: { type: 'string', description: 'Exact JavaScript/TypeScript variable name' },
            type: { type: 'string', description: 'blog | team | testimonials | faq | products | services | portfolio | other' },
            itemCount: { type: 'number' },
            items: {
              type: 'array',
              description: 'ALL actual items extracted from the source array. Include every item — do not truncate.',
              items: { type: 'object' },
            },
            fields: {
              type: 'array',
              items: {
                type: 'object',
                required: ['name', 'type'],
                properties: {
                  name: { type: 'string' },
                  type: { type: 'string', description: 'text | longtext | image | date | url | boolean | number' },
                },
              },
            },
          },
        },
      },
      techStack: {
        type: 'array',
        items: {
          type: 'object',
          required: ['category', 'name', 'detected'],
          properties: {
            category: { type: 'string', description: 'Frontend | Styling | Backend | Database | CMS | Auth | Analytics | Hosting' },
            name: { type: 'string' },
            detected: { type: 'boolean' },
            confidence: { type: 'string', enum: ['certain', 'likely', 'inferred'] },
            sourceType: {
              type: 'string',
              enum: ['ts-array', 'json', 'mdx', 'html'],
              description: 'How the source file stores this data — used for targeted patching when user edits CMS fields.',
            },
            sourcePath: {
              type: 'string',
              description: 'Template for addressing items, e.g. "teamMembers[{i}].{field}". Use the exact variable name from the source.',
            },
          },
        },
      },
      readiness: {
        type: 'object',
        required: ['score', 'items'],
        properties: {
          score: { type: 'number', description: '0–100' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['label', 'status'],
              properties: {
                label: { type: 'string' },
                status: { type: 'string', enum: ['complete', 'missing', 'partial'] },
              },
            },
          },
        },
      },
    },
  },
};

// ─── Map AI output → Project-compatible shape ─────────────────────────

export function mapToProject(
  ai: AIAnalysisOutput,
  media: {
    id: string; name: string; type: 'image' | 'svg' | 'document' | 'font';
    size: string; dimensions?: string; optimized: boolean; usedIn: string[];
  }[],
) {
  const pages = ai.pages.map(p => ({
    id: 'page-' + p.path.replace(/[^a-z0-9]/gi, '-').replace(/^-|-$/g, '') || 'page-home',
    name: p.name,
    path: p.path,
    navigateTo: p.navigateTo,
    seoStatus: p.seoStatus,
    sections: (p.sections ?? []).map(s => ({
      id: s.id,
      type: s.type as 'hero' | 'header' | 'features' | 'testimonials' | 'cta' | 'footer' | 'stats' | 'logos' | 'generic',
      name: s.label,
      bindings: [],
    })),
  }));

  const contentTypes = ai.contentCollections.map(col => ({
    id: col.varName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
    name: col.name,
    varName: col.varName,
    fields: col.fields.map((f, i) => ({
      id: `field-${i}`,
      name: f.name,
      type: f.type as 'text' | 'richtext' | 'image' | 'date' | 'url' | 'number' | 'boolean' | 'select' | 'email',
      required: false,
    })),
    items: (col.items ?? []).map((item, i) => ({
      id: `${col.varName}-${i}`,
      data: item,
      status: 'published' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
    linkedPages: [],
    sourceBindings: {
      file: col.file,
      varName: col.varName,
      sourceType: col.sourceType,
      sourcePath: col.sourcePath,
      items: Object.fromEntries(
        (col.items ?? []).map((_, i) => [`${col.varName}-${i}`, { itemIndex: i }])
      ),
    },
  }));

  // Group tech items into TechSectors
  const sectorMap = new Map<string, typeof ai.techStack>();
  for (const item of ai.techStack) {
    const existing = sectorMap.get(item.category) ?? [];
    existing.push(item);
    sectorMap.set(item.category, existing);
  }

  const sectors = Array.from(sectorMap.entries()).map(([category, items], i) => ({
    id: `sector-${i}`,
    name: category,
    description: items.map(t => t.name).join(', '),
    icon: categoryIcon(category),
    status: items.some(t => t.detected) ? 'needs-setup' as const : 'not-started' as const,
    automation: 'guided' as const,
    tasks: [],
    providers: [],
  }));

  const readinessItems = ai.readiness.items.map((item, i) => ({
    id: `readiness-${i}`,
    label: item.label,
    description: '',
    status: mapReadinessStatus(item.status),
    sector: 'General',
    automation: 'manual' as const,
  }));

  const aiInsights = {
    businessSummary: ai.businessSummary ?? `${ai.projectName} — a ${ai.framework} project.`,
    businessType: ai.businessType ?? 'Website',
    targetAudience: ai.targetAudience ?? 'General audience',
    launchRecommendations: ai.readiness.items
      .filter(i => i.status === 'missing')
      .slice(0, 5)
      .map((item, i) => ({
        id: `rec-${i}`,
        label: item.label,
        description: `Required for a production-ready launch.`,
        priority: (i < 2 ? 'high' : i < 4 ? 'medium' : 'low') as 'high' | 'medium' | 'low',
        sector: 'General',
      })),
    contentGaps: [],
    pageGaps: [],
    seoInsights: ai.readiness.items
      .filter(i => i.label.toLowerCase().includes('seo') || i.label.toLowerCase().includes('meta') || i.label.toLowerCase().includes('sitemap'))
      .map(i => i.label),
  };

  return {
    name: ai.projectName,
    url: '',
    pages,
    contentTypes,
    media,
    sectors,
    readinessItems,
    readinessScore: ai.readiness.score,
    aiInsights,
  };
}

function mapReadinessStatus(s: 'complete' | 'missing' | 'partial') {
  if (s === 'complete') return 'complete' as const;
  if (s === 'partial') return 'in-progress' as const;
  return 'not-started' as const;
}

function categoryIcon(category: string): string {
  const icons: Record<string, string> = {
    Frontend: '⚛️',
    Styling: '🎨',
    Backend: '🖥️',
    Database: '🗄️',
    CMS: '📝',
    Auth: '🔐',
    Analytics: '📊',
    Hosting: '☁️',
  };
  return icons[category] ?? '⚙️';
}
