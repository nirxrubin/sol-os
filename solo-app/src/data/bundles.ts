import type { DeployBundle } from './types';

/**
 * Sol OS Deploy Bundles
 *
 * Each bundle is a curated stack of providers managed by Sol OS.
 * The client never needs to create accounts or configure anything -
 * Sol OS's single account handles all provider integrations.
 *
 * Bundles are designed for different scales:
 * - Starter: Free/lowest-cost, perfect for MVPs and personal projects
 * - Pro: Production-grade, optimized for growing businesses
 * - Scale: Enterprise-grade, maximum performance and reliability
 */

export const deployBundles: DeployBundle[] = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'Launch fast, zero cost',
    price: '$0',
    priceNote: '/month',
    providers: [
      { sectorId: 'hosting', sectorName: 'Hosting', providerName: 'Netlify', description: 'Static & serverless hosting' },
      { sectorId: 'domain', sectorName: 'Domain & DNS', providerName: 'Cloudflare', description: 'Free DNS + CDN' },
      { sectorId: 'security', sectorName: 'Security', providerName: "Let's Encrypt", description: 'Free SSL certificates' },
      { sectorId: 'cms', sectorName: 'CMS', providerName: 'Sol OS Built-in', description: 'File-based content management' },
      { sectorId: 'analytics', sectorName: 'Analytics', providerName: 'Plausible', description: 'Privacy-first analytics' },
      { sectorId: 'seo', sectorName: 'SEO', providerName: 'Sol OS Built-in', description: 'Auto SEO audit & fix' },
      { sectorId: 'assets', sectorName: 'Assets', providerName: 'Netlify CDN', description: 'Built-in asset serving' },
    ],
    features: [
      'Automatic deployments',
      'Free SSL certificate',
      'Global CDN',
      'Basic analytics',
      '1 GB storage',
      'Community support',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'Production-grade for growing businesses',
    price: '$29',
    priceNote: '/month',
    recommended: true,
    providers: [
      { sectorId: 'hosting', sectorName: 'Hosting', providerName: 'Vercel', description: 'Edge-optimized hosting' },
      { sectorId: 'domain', sectorName: 'Domain & DNS', providerName: 'Cloudflare', description: 'DNS + CDN + DDoS protection' },
      { sectorId: 'database', sectorName: 'Database', providerName: 'Supabase', description: 'Postgres + Auth + Realtime' },
      { sectorId: 'security', sectorName: 'Security', providerName: 'Cloudflare SSL', description: 'SSL + WAF + DDoS' },
      { sectorId: 'cms', sectorName: 'CMS', providerName: 'Sol OS Built-in', description: 'Visual CMS with API' },
      { sectorId: 'analytics', sectorName: 'Analytics', providerName: 'PostHog', description: 'Product analytics + replay' },
      { sectorId: 'seo', sectorName: 'SEO', providerName: 'Sol OS Built-in', description: 'Full SEO optimization suite' },
      { sectorId: 'aeo', sectorName: 'AEO', providerName: 'Sol OS Built-in', description: 'AI engine optimization' },
      { sectorId: 'assets', sectorName: 'Assets', providerName: 'Cloudinary', description: 'Auto image optimization' },
    ],
    features: [
      'Everything in Starter',
      'Edge network (300+ PoPs)',
      'Managed database',
      'Advanced analytics & session replay',
      'Auto image optimization',
      'AI engine optimization (AEO)',
      '100 GB storage',
      'Priority support',
    ],
  },
  {
    id: 'scale',
    name: 'Scale',
    tagline: 'Enterprise-grade infrastructure',
    price: '$99',
    priceNote: '/month',
    providers: [
      { sectorId: 'hosting', sectorName: 'Hosting', providerName: 'AWS Amplify', description: 'Auto-scaling cloud hosting' },
      { sectorId: 'domain', sectorName: 'Domain & DNS', providerName: 'Route 53', description: 'Enterprise DNS + failover' },
      { sectorId: 'database', sectorName: 'Database', providerName: 'Supabase Pro', description: 'Dedicated Postgres + backups' },
      { sectorId: 'security', sectorName: 'Security', providerName: 'Cloudflare Pro', description: 'Enterprise WAF + bot protection' },
      { sectorId: 'cms', sectorName: 'CMS', providerName: 'Sol OS Built-in', description: 'Visual CMS with webhooks' },
      { sectorId: 'analytics', sectorName: 'Analytics', providerName: 'PostHog', description: 'Full product suite + data warehouse' },
      { sectorId: 'seo', sectorName: 'SEO', providerName: 'Sol OS Built-in', description: 'Full SEO + schema markup' },
      { sectorId: 'aeo', sectorName: 'AEO', providerName: 'Sol OS Built-in', description: 'Advanced AI optimization' },
      { sectorId: 'assets', sectorName: 'Assets', providerName: 'Cloudinary', description: 'Enterprise media pipeline' },
      { sectorId: 'legal', sectorName: 'Legal', providerName: 'iubenda', description: 'Auto-generated legal pages' },
    ],
    features: [
      'Everything in Pro',
      'Auto-scaling infrastructure',
      'Dedicated database with backups',
      'Enterprise WAF + bot protection',
      'Legal compliance (GDPR/CCPA)',
      'Unlimited storage',
      'SLA guarantee',
      'Dedicated support',
    ],
  },
];
