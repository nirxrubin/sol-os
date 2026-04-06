/**
 * Archetype + Generator Registry
 *
 * Pure data — no filesystem access, no side effects.
 * Consumed by detector.ts and passed downstream to build, AI prompt, and edits.
 */

export type ArchetypeId =
  | 'nextjs-app-router'
  | 'nextjs-pages-router'
  | 'vite-react'
  | 'vite-vue'
  | 'astro'
  | 'cra'
  | 'vanilla-html';

export type GeneratorId =
  | 'LOVABLE'
  | 'BASE44'
  | 'CLAUDE_CODE'
  | 'CURSOR'
  | 'UNKNOWN';

export type BasePath =
  | 'vite-flag'          // npm run build -- --base=/preview/
  | 'next-static-export' // patch next.config → output: 'export'
  | 'cra-env'            // PUBLIC_URL=/preview/ npm run build
  | 'vue-router'         // patch createWebHistory('/preview/')
  | 'none';              // no patching needed

export interface ArchetypeDefinition {
  id: ArchetypeId;
  displayName: string;
  build: {
    command: 'npm run build' | 'none';
    outputDir: string;   // 'dist', 'out', 'build', '.'
    basePath: BasePath;
  };
  routing: {
    type: 'react-router' | 'vue-router' | 'file-based' | 'hash' | 'none';
    spaFallback: boolean;
  };
  /** Injected into AI system prompt — describes routing/structure so AI doesn't re-discover it */
  aiContextHint: string;
}

export interface GeneratorDefinition {
  id: GeneratorId;
  displayName: string;
  confidence: 'certain' | 'likely' | 'unknown';
  signals: {
    packageDeps?: string[];     // any match in dependencies
    packageDevDeps?: string[];  // any match in devDependencies
    files?: string[];           // any of these paths exist at project root
    directories?: string[];     // any of these dirs exist at project root
  };
  /** Optional notice shown on the dashboard (e.g. Base44 backend warning) */
  notice?: string;
}

// ─── Archetype Registry ────────────────────────────────────────────────────

export const ARCHETYPES: Record<ArchetypeId, ArchetypeDefinition> = {
  'nextjs-app-router': {
    id: 'nextjs-app-router',
    displayName: 'Next.js (App Router)',
    build: { command: 'npm run build', outputDir: 'out', basePath: 'next-static-export' },
    routing: { type: 'file-based', spaFallback: false },
    aiContextHint: [
      'Next.js 13+ App Router. Pages live in the app/ directory as page.tsx files.',
      'Routing is file-based — each folder segment = a URL segment.',
      'Layout files (layout.tsx) wrap child pages.',
      'There is no React Router — do not look for createBrowserRouter or <Routes>.',
      'To find all pages: list files matching app/**/page.tsx.',
    ].join(' '),
  },

  'nextjs-pages-router': {
    id: 'nextjs-pages-router',
    displayName: 'Next.js (Pages Router)',
    build: { command: 'npm run build', outputDir: 'out', basePath: 'next-static-export' },
    routing: { type: 'file-based', spaFallback: false },
    aiContextHint: [
      'Next.js Pages Router. Pages live in the pages/ directory.',
      'Each .tsx/.jsx file = a route (index.tsx → /, about.tsx → /about).',
      'There is no React Router.',
      'To find all pages: list files in pages/ excluding _app.tsx, _document.tsx, api/.',
    ].join(' '),
  },

  'vite-react': {
    id: 'vite-react',
    displayName: 'Vite + React',
    build: { command: 'npm run build', outputDir: 'dist', basePath: 'vite-flag' },
    routing: { type: 'react-router', spaFallback: true },
    aiContextHint: [
      'Vite + React SPA. Single index.html entry point — the entire app renders into one HTML shell.',
      'Routes are defined in src/ via React Router v6.',
      'Look for createBrowserRouter() or <Routes> in App.tsx, main.tsx, or src/router.tsx.',
      'Pages are React components, not separate HTML files.',
      'navigateTo paths must start with / (e.g. "/", "/about", "/blog").',
    ].join(' '),
  },

  'vite-vue': {
    id: 'vite-vue',
    displayName: 'Vite + Vue',
    build: { command: 'npm run build', outputDir: 'dist', basePath: 'vue-router' },
    routing: { type: 'vue-router', spaFallback: true },
    aiContextHint: [
      'Vite + Vue SPA. Single index.html entry point.',
      'Routes defined via Vue Router — look for createRouter() in src/router/index.ts or src/router.ts.',
      'Pages are .vue components, not separate HTML files.',
    ].join(' '),
  },

  'astro': {
    id: 'astro',
    displayName: 'Astro',
    build: { command: 'npm run build', outputDir: 'dist', basePath: 'none' },
    routing: { type: 'file-based', spaFallback: false },
    aiContextHint: [
      'Astro static site. Pages live in src/pages/ as .astro files.',
      'File-based routing: src/pages/index.astro → /, src/pages/about.astro → /about.',
      'Content collections (blog posts, docs) may live in src/content/ as MDX or Markdown files.',
      'Static by default — no server-side rendering.',
    ].join(' '),
  },

  'cra': {
    id: 'cra',
    displayName: 'Create React App',
    build: { command: 'npm run build', outputDir: 'build', basePath: 'cra-env' },
    routing: { type: 'react-router', spaFallback: true },
    aiContextHint: [
      'Create React App (react-scripts). Single index.html entry point.',
      'Routes via React Router — look for <BrowserRouter> in src/index.tsx or src/App.tsx.',
    ].join(' '),
  },

  'vanilla-html': {
    id: 'vanilla-html',
    displayName: 'Static HTML',
    build: { command: 'none', outputDir: '.', basePath: 'none' },
    routing: { type: 'none', spaFallback: false },
    aiContextHint: [
      'Plain HTML/CSS/JS — no build step, no framework.',
      'Each .html file is a separate page. Navigation via <a href="..."> anchor links.',
      'To find all pages: list *.html files in the project root and subdirectories.',
    ].join(' '),
  },
};

// ─── Generator Registry ────────────────────────────────────────────────────

export const GENERATORS: Record<GeneratorId, GeneratorDefinition> = {
  LOVABLE: {
    id: 'LOVABLE',
    displayName: 'Lovable',
    confidence: 'certain',
    signals: {
      packageDevDeps: ['lovable-tagger'],
    },
  },

  BASE44: {
    id: 'BASE44',
    displayName: 'Base44',
    confidence: 'certain',
    signals: {
      packageDeps: ['@base44/sdk'],
    },
    notice: 'This app was built with Base44\'s managed backend. Live data (database records, auth) requires a Base44 account — the preview shows the UI shell with static content only.',
  },

  CLAUDE_CODE: {
    id: 'CLAUDE_CODE',
    displayName: 'Claude Code',
    confidence: 'likely',
    signals: {
      files: ['CLAUDE.md'],
      directories: ['.claude'],
    },
  },

  CURSOR: {
    id: 'CURSOR',
    displayName: 'Cursor',
    confidence: 'likely',
    signals: {
      files: ['.cursorrules'],
      directories: ['.cursor'],
    },
  },

  UNKNOWN: {
    id: 'UNKNOWN',
    displayName: 'Unknown',
    confidence: 'unknown',
    signals: {},
  },
};
