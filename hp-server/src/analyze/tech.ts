import fs from 'fs/promises';
import path from 'path';

interface TechSector {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: 'connected' | 'needs-setup' | 'not-started' | 'ready';
  automation: 'automated' | 'guided' | 'manual';
  tasks: { id: string; label: string; description: string; completed: boolean; automation: 'auto' | 'manual' }[];
  providers: { id: string; name: string; description: string; price: string; recommended?: boolean; tier: 'budget' | 'balanced' | 'scale' }[];
}

interface TechDetection {
  framework: string | null;
  bundler: string | null;
  css: string[];
  cms: string | null;
  database: string | null;
  typescript: boolean;
  hasPackageJson: boolean;
  dependencies: Record<string, string>;
}

export async function analyzeTech(projectRoot: string, fileTree: string[]): Promise<TechSector[]> {
  const detection = await detectTech(projectRoot, fileTree);
  return buildSectors(detection, fileTree);
}

async function detectTech(projectRoot: string, fileTree: string[]): Promise<TechDetection> {
  const result: TechDetection = {
    framework: null, bundler: null, css: [], cms: null, database: null,
    typescript: false, hasPackageJson: false, dependencies: {},
  };

  // Check package.json
  const pkgPath = path.join(projectRoot, 'package.json');
  try {
    const raw = await fs.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw);
    result.hasPackageJson = true;
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    result.dependencies = allDeps;

    // Framework detection
    if (allDeps['next']) result.framework = 'Next.js';
    else if (allDeps['nuxt'] || allDeps['nuxt3']) result.framework = 'Nuxt';
    else if (allDeps['@sveltejs/kit']) result.framework = 'SvelteKit';
    else if (allDeps['astro']) result.framework = 'Astro';
    else if (allDeps['gatsby']) result.framework = 'Gatsby';
    else if (allDeps['react']) result.framework = 'React';
    else if (allDeps['vue']) result.framework = 'Vue';
    else if (allDeps['svelte']) result.framework = 'Svelte';
    else if (allDeps['@angular/core']) result.framework = 'Angular';

    // Bundler detection
    if (allDeps['vite']) result.bundler = 'Vite';
    else if (allDeps['webpack']) result.bundler = 'Webpack';
    else if (allDeps['esbuild']) result.bundler = 'esbuild';
    else if (allDeps['parcel']) result.bundler = 'Parcel';
    else if (allDeps['rollup']) result.bundler = 'Rollup';

    // CSS detection
    if (allDeps['tailwindcss']) result.css.push('Tailwind CSS');
    if (allDeps['styled-components']) result.css.push('styled-components');
    if (allDeps['@emotion/react'] || allDeps['@emotion/styled']) result.css.push('Emotion');
    if (allDeps['sass'] || allDeps['node-sass']) result.css.push('Sass');
    if (allDeps['less']) result.css.push('Less');

    // CMS detection
    if (allDeps['sanity'] || allDeps['@sanity/client']) result.cms = 'Sanity';
    else if (allDeps['contentful']) result.cms = 'Contentful';
    else if (allDeps['@strapi/strapi']) result.cms = 'Strapi';
    else if (allDeps['@prismic/client']) result.cms = 'Prismic';

    // Database detection
    if (allDeps['@supabase/supabase-js']) result.database = 'Supabase';
    else if (allDeps['@prisma/client'] || allDeps['prisma']) result.database = 'Prisma';
    else if (allDeps['drizzle-orm']) result.database = 'Drizzle';
    else if (allDeps['mongoose']) result.database = 'MongoDB';
    else if (allDeps['pg'] || allDeps['postgres']) result.database = 'PostgreSQL';

    // TypeScript
    result.typescript = !!allDeps['typescript'];
  } catch {
    // No package.json — static site
  }

  // Config file scanning
  if (fileTree.some((f) => f.match(/tsconfig\.json$/))) result.typescript = true;
  if (!result.css.length && fileTree.some((f) => f.match(/tailwind\.config/))) result.css.push('Tailwind CSS');
  if (!result.framework && fileTree.some((f) => f.match(/next\.config/))) result.framework = 'Next.js';
  if (!result.framework && fileTree.some((f) => f.match(/vite\.config/))) result.bundler = 'Vite';
  if (!result.framework && fileTree.some((f) => f.match(/astro\.config/))) result.framework = 'Astro';

  // Pure HTML detection
  if (!result.framework && !result.hasPackageJson) {
    const htmlFiles = fileTree.filter((f) => f.endsWith('.html'));
    if (htmlFiles.length > 0) result.framework = 'Static HTML';
  }

  return result;
}

function buildSectors(tech: TechDetection, fileTree: string[]): TechSector[] {
  const sectors: TechSector[] = [];

  // Frontend
  const fwDesc = [tech.framework, tech.bundler, tech.typescript ? 'TypeScript' : null, ...tech.css]
    .filter(Boolean).join(', ') || 'Static HTML/CSS/JS';

  sectors.push({
    id: 'frontend',
    name: 'Frontend',
    description: `Detected: ${fwDesc}`,
    icon: 'code',
    status: 'connected',
    automation: 'automated',
    tasks: [
      { id: 'fe-1', label: 'Framework detected', description: tech.framework || 'Static HTML', completed: true, automation: 'auto' },
      { id: 'fe-2', label: 'Build system configured', description: tech.bundler || 'No bundler', completed: !!tech.bundler, automation: 'auto' },
      { id: 'fe-3', label: 'TypeScript enabled', description: tech.typescript ? 'Yes' : 'No', completed: tech.typescript, automation: 'auto' },
      { id: 'fe-4', label: 'CSS framework detected', description: tech.css.join(', ') || 'Plain CSS', completed: tech.css.length > 0, automation: 'auto' },
    ],
    providers: [
      { id: 'fe-p1', name: 'Vercel', description: 'Optimal for ' + (tech.framework || 'static sites'), price: 'Free', recommended: true, tier: 'balanced' },
      { id: 'fe-p2', name: 'Netlify', description: 'Great for static and JAMstack', price: 'Free', tier: 'budget' },
      { id: 'fe-p3', name: 'AWS Amplify', description: 'Enterprise-grade hosting', price: '$0.01/GB', tier: 'scale' },
    ],
  });

  // CMS
  sectors.push({
    id: 'cms',
    name: 'CMS',
    description: tech.cms ? `Detected: ${tech.cms}` : 'No CMS detected',
    icon: 'database',
    status: tech.cms ? 'connected' : 'not-started',
    automation: 'guided',
    tasks: [
      { id: 'cms-1', label: 'CMS integration', description: tech.cms || 'Not configured', completed: !!tech.cms, automation: tech.cms ? 'auto' : 'manual' },
      { id: 'cms-2', label: 'Content models defined', description: 'Schema for collections', completed: false, automation: 'manual' },
      { id: 'cms-3', label: 'Content migrated', description: 'Import existing content', completed: false, automation: 'manual' },
    ],
    providers: [
      { id: 'cms-p1', name: 'Sanity', description: 'Flexible headless CMS', price: 'Free tier', recommended: true, tier: 'balanced' },
      { id: 'cms-p2', name: 'Markdown', description: 'File-based, zero cost', price: 'Free', tier: 'budget' },
      { id: 'cms-p3', name: 'Contentful', description: 'Enterprise CMS', price: '$300/mo', tier: 'scale' },
    ],
  });

  // Database
  sectors.push({
    id: 'database',
    name: 'Database',
    description: tech.database ? `Detected: ${tech.database}` : 'No database detected',
    icon: 'server',
    status: tech.database ? 'connected' : 'not-started',
    automation: 'guided',
    tasks: [
      { id: 'db-1', label: 'Database provider', description: tech.database || 'Not configured', completed: !!tech.database, automation: tech.database ? 'auto' : 'manual' },
      { id: 'db-2', label: 'Schema migrations', description: 'Database schema setup', completed: false, automation: 'manual' },
    ],
    providers: [
      { id: 'db-p1', name: 'Supabase', description: 'Postgres + Auth + Realtime', price: 'Free tier', recommended: true, tier: 'balanced' },
      { id: 'db-p2', name: 'PlanetScale', description: 'Serverless MySQL', price: 'Free tier', tier: 'budget' },
      { id: 'db-p3', name: 'Turso', description: 'Edge SQLite', price: 'Free tier', tier: 'scale' },
    ],
  });

  // Hosting
  sectors.push({
    id: 'hosting',
    name: 'Hosting',
    description: 'Deployment configuration',
    icon: 'cloud',
    status: 'needs-setup',
    automation: 'guided',
    tasks: [
      { id: 'host-1', label: 'Select hosting provider', description: 'Choose deployment target', completed: false, automation: 'manual' },
      { id: 'host-2', label: 'Configure deployment', description: 'Build commands & settings', completed: false, automation: 'auto' },
      { id: 'host-3', label: 'Set environment variables', description: 'API keys & secrets', completed: false, automation: 'manual' },
    ],
    providers: [
      { id: 'host-p1', name: 'Vercel', description: 'Zero-config deployment', price: 'Free', recommended: true, tier: 'balanced' },
      { id: 'host-p2', name: 'Netlify', description: 'Static & serverless', price: 'Free', tier: 'budget' },
      { id: 'host-p3', name: 'GitHub Pages', description: 'Free static hosting', price: 'Free', tier: 'budget' },
      { id: 'host-p4', name: 'AWS Amplify', description: 'Scalable cloud hosting', price: 'Pay-as-you-go', tier: 'scale' },
    ],
  });

  // Domain & DNS
  sectors.push({
    id: 'domain',
    name: 'Domain & DNS',
    description: 'Domain registration and DNS',
    icon: 'globe',
    status: 'not-started',
    automation: 'guided',
    tasks: [
      { id: 'dns-1', label: 'Domain registered', description: 'Register or connect domain', completed: false, automation: 'manual' },
      { id: 'dns-2', label: 'DNS configured', description: 'Point to hosting provider', completed: false, automation: 'auto' },
    ],
    providers: [
      { id: 'dns-p1', name: 'Cloudflare', description: 'Free DNS + CDN + DDoS', price: 'Free', recommended: true, tier: 'balanced' },
      { id: 'dns-p2', name: 'Namecheap', description: 'Affordable domains', price: '$9/yr', tier: 'budget' },
      { id: 'dns-p3', name: 'Route 53', description: 'AWS DNS service', price: '$0.50/zone', tier: 'scale' },
    ],
  });

  // Security
  const hasHttps = false; // Can't detect from static files
  sectors.push({
    id: 'security',
    name: 'Security',
    description: 'SSL, headers, and vulnerability scanning',
    icon: 'shield',
    status: 'not-started',
    automation: 'automated',
    tasks: [
      { id: 'sec-1', label: 'SSL certificate', description: 'HTTPS encryption', completed: false, automation: 'auto' },
      { id: 'sec-2', label: 'Security headers', description: 'CSP, HSTS, X-Frame-Options', completed: false, automation: 'auto' },
      { id: 'sec-3', label: 'Dependency audit', description: 'Check for known vulnerabilities', completed: false, automation: 'auto' },
    ],
    providers: [
      { id: 'sec-p1', name: "Let's Encrypt", description: 'Free SSL certificates', price: 'Free', recommended: true, tier: 'budget' },
      { id: 'sec-p2', name: 'Cloudflare SSL', description: 'SSL + WAF + DDoS', price: 'Free', tier: 'balanced' },
      { id: 'sec-p3', name: 'DigiCert', description: 'Enterprise SSL', price: '$200/yr', tier: 'scale' },
    ],
  });

  // Assets & Media
  const imageFiles = fileTree.filter((f) => /\.(jpg|jpeg|png|gif|webp|avif|svg)$/i.test(f));
  sectors.push({
    id: 'assets',
    name: 'Assets & Media',
    description: `${imageFiles.length} media files detected`,
    icon: 'image',
    status: imageFiles.length > 0 ? 'needs-setup' : 'not-started',
    automation: 'automated',
    tasks: [
      { id: 'assets-1', label: 'Images cataloged', description: `${imageFiles.length} files found`, completed: imageFiles.length > 0, automation: 'auto' },
      { id: 'assets-2', label: 'Image optimization', description: 'Compress and convert to WebP', completed: false, automation: 'auto' },
      { id: 'assets-3', label: 'CDN configured', description: 'Serve from edge network', completed: false, automation: 'auto' },
    ],
    providers: [
      { id: 'assets-p1', name: 'Cloudinary', description: 'Image/video optimization CDN', price: 'Free tier', recommended: true, tier: 'balanced' },
      { id: 'assets-p2', name: 'imgix', description: 'Real-time image processing', price: '$10/mo', tier: 'scale' },
      { id: 'assets-p3', name: 'Sharp', description: 'Self-hosted optimization', price: 'Free', tier: 'budget' },
    ],
  });

  // Analytics, SEO, AEO, Legal
  sectors.push(
    {
      id: 'analytics', name: 'Analytics', description: 'Visitor tracking', icon: 'bar-chart',
      status: 'not-started', automation: 'automated',
      tasks: [
        { id: 'ana-1', label: 'Analytics provider', description: 'Select tracking solution', completed: false, automation: 'manual' },
        { id: 'ana-2', label: 'Tracking installed', description: 'Add analytics snippet', completed: false, automation: 'auto' },
      ],
      providers: [
        { id: 'ana-p1', name: 'Plausible', description: 'Privacy-first analytics', price: '$9/mo', recommended: true, tier: 'balanced' },
        { id: 'ana-p2', name: 'PostHog', description: 'Product analytics + session replay', price: 'Free tier', tier: 'scale' },
        { id: 'ana-p3', name: 'Google Analytics 4', description: 'Full-featured, free', price: 'Free', tier: 'budget' },
      ],
    },
    {
      id: 'seo', name: 'SEO', description: 'Search engine optimization', icon: 'search',
      status: 'needs-setup', automation: 'guided',
      tasks: [
        { id: 'seo-1', label: 'Meta tags audit', description: 'Title, description, OG tags', completed: false, automation: 'auto' },
        { id: 'seo-2', label: 'Sitemap generated', description: 'XML sitemap for crawlers', completed: false, automation: 'auto' },
        { id: 'seo-3', label: 'Robots.txt configured', description: 'Crawler instructions', completed: false, automation: 'auto' },
        { id: 'seo-4', label: 'Structured data', description: 'JSON-LD schema markup', completed: false, automation: 'manual' },
      ],
      providers: [
        { id: 'seo-p1', name: 'HostaPosta Built-in', description: 'Auto SEO audit & fix', price: 'Included', recommended: true, tier: 'balanced' },
        { id: 'seo-p2', name: 'Yoast', description: 'WordPress SEO plugin', price: '$99/yr', tier: 'budget' },
        { id: 'seo-p3', name: 'Ahrefs', description: 'Enterprise SEO platform', price: '$99/mo', tier: 'scale' },
      ],
    },
    {
      id: 'aeo', name: 'AEO', description: 'AI engine optimization', icon: 'sparkles',
      status: 'not-started', automation: 'guided',
      tasks: [
        { id: 'aeo-1', label: 'AI-friendly content', description: 'Structured for AI crawlers', completed: false, automation: 'manual' },
        { id: 'aeo-2', label: 'Schema markup', description: 'Enhanced structured data', completed: false, automation: 'auto' },
      ],
      providers: [
        { id: 'aeo-p1', name: 'HostaPosta Built-in', description: 'AEO audit & recommendations', price: 'Included', recommended: true, tier: 'balanced' },
        { id: 'aeo-p2', name: 'Schema Pro', description: 'Advanced schema generator', price: '$79/yr', tier: 'budget' },
        { id: 'aeo-p3', name: 'Clearscope', description: 'AI content optimization', price: '$170/mo', tier: 'scale' },
      ],
    },
    {
      id: 'legal', name: 'Legal & Utility', description: 'Privacy, terms, cookies', icon: 'file-text',
      status: 'not-started', automation: 'guided',
      tasks: [
        { id: 'legal-1', label: 'Privacy policy', description: 'GDPR/CCPA compliant', completed: false, automation: 'manual' },
        { id: 'legal-2', label: 'Terms of service', description: 'Legal terms page', completed: false, automation: 'manual' },
        { id: 'legal-3', label: 'Cookie consent', description: 'Cookie banner', completed: false, automation: 'auto' },
      ],
      providers: [
        { id: 'legal-p1', name: 'iubenda', description: 'Auto-generated legal pages', price: '$29/yr', recommended: true, tier: 'balanced' },
        { id: 'legal-p2', name: 'Termly', description: 'Free policy generator', price: 'Free', tier: 'budget' },
        { id: 'legal-p3', name: 'Osano', description: 'Enterprise consent management', price: '$200/mo', tier: 'scale' },
      ],
    },
  );

  return sectors;
}
