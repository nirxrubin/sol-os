import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';
import { isLocalMode, askLocalClaude } from './localClaude.js';

export interface AIInsights {
  businessSummary: string;
  businessType: string;
  targetAudience: string;
  launchRecommendations: {
    id: string;
    label: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    sector: string;
  }[];
  contentGaps: {
    name: string;
    reason: string;
  }[];
  pageGaps: {
    name: string;
    path: string;
    reason: string;
  }[];
  seoInsights: string[];
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

interface HeuristicInput {
  name: string;
  pages: { name: string; path: string; seoStatus: string; sections: { name: string; type: string }[] }[];
  contentTypes: { name: string; items: unknown[] }[];
  sectors: { name: string; status: string }[];
  readinessScore: number;
  readinessItems: { label: string; status: string; sector: string }[];
}

export async function understandProject(
  projectRoot: string,
  fileTree: string[],
  heuristics: HeuristicInput,
): Promise<AIInsights | null> {
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
  if (!hasApiKey && !isLocalMode()) {
    console.log('[understand] No API key and USE_LOCAL_CLAUDE=false — skipping AI layer');
    return null;
  }

  console.log('[understand] Building project digest...');
  const digest = await buildDigest(projectRoot, fileTree, heuristics);

  const prompt = `You are analyzing a web project that was exported from an AI builder (Lovable, Base44, Webflow, Cursor, etc.) and is being prepared for production launch.

Project digest:
${digest}

Return a JSON object with this exact shape (no markdown, just JSON):
{
  "businessSummary": "one sentence describing what this product/business does",
  "businessType": "one of: SaaS | Agency | Portfolio | E-commerce | Blog | Non-profit | Community | Media | Other",
  "targetAudience": "who this is for, in 5-10 words",
  "launchRecommendations": [
    {
      "id": "rec-1",
      "label": "short action label",
      "description": "why this matters for launch, specific to this project",
      "priority": "high | medium | low",
      "sector": "seo | analytics | legal | performance | content | ux | hosting"
    }
  ],
  "contentGaps": [
    {
      "name": "content collection name",
      "reason": "why this collection is implied by the project but missing"
    }
  ],
  "pageGaps": [
    {
      "name": "page name",
      "path": "/suggested-path",
      "reason": "why this page is typical for this business type and missing"
    }
  ],
  "seoInsights": ["specific SEO observation 1", "specific SEO observation 2"]
}

Rules:
- launchRecommendations: max 6, ranked by priority. Only include things that are genuinely missing or broken — not generic advice.
- contentGaps: only collections that make sense for THIS specific project. Max 3.
- pageGaps: only pages that are clearly missing for THIS business type. Max 3.
- seoInsights: max 3, specific to what you see in the actual content (not generic tips).
- Be specific about what you found in the project — reference actual page names, content, or tech.`;

  try {
    let text: string;

    if (isLocalMode()) {
      console.log('[understand] Calling local Claude CLI (subscription auth, no API credits)...');
      text = await askLocalClaude(prompt, { model: 'haiku', timeoutMs: 90_000 });
    } else {
      console.log('[understand] Calling Anthropic cloud API...');
      const response = await getClient().messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });
      text = response.content[0].type === 'text' ? response.content[0].text : '';
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const insights: AIInsights = JSON.parse(jsonMatch[0]);
    console.log(`[understand] AI analysis complete: ${insights.businessType} — ${insights.businessSummary.slice(0, 60)}...`);
    return insights;
  } catch (err) {
    console.warn('[understand] AI analysis failed (non-fatal):', err);
    return null;
  }
}

async function buildDigest(
  projectRoot: string,
  fileTree: string[],
  heuristics: HeuristicInput,
): Promise<string> {
  const lines: string[] = [];

  lines.push(`PROJECT: ${heuristics.name}`);
  lines.push(`READINESS SCORE: ${heuristics.readinessScore}%`);

  // Tech stack
  const techNames = heuristics.sectors.map(s => s.name).join(', ');
  lines.push(`TECH STACK: ${techNames}`);

  // Pages
  lines.push(`\nPAGES (${heuristics.pages.length}):`);
  for (const page of heuristics.pages) {
    const sectionNames = page.sections.map(s => s.name).join(', ');
    lines.push(`  ${page.name} [${page.path}] — sections: ${sectionNames || 'none'} — SEO: ${page.seoStatus}`);
  }

  // Content types
  lines.push(`\nCONTENT TYPES (${heuristics.contentTypes.length}):`);
  for (const ct of heuristics.contentTypes) {
    lines.push(`  ${ct.name}: ${ct.items.length} items`);
  }

  // What's missing from readiness
  const missing = heuristics.readinessItems
    .filter(i => i.status === 'not-started')
    .map(i => i.label);
  if (missing.length > 0) {
    lines.push(`\nMISSING: ${missing.join(', ')}`);
  }

  // Extract key text from HTML pages (titles, h1s, nav, meta desc, hero copy)
  lines.push('\nKEY COPY FROM PAGES:');
  const htmlFiles = fileTree.filter(f => f.endsWith('.html')).slice(0, 4);
  for (const htmlFile of htmlFiles) {
    try {
      const html = await fs.readFile(path.join(projectRoot, htmlFile), 'utf-8');
      const $ = cheerio.load(html);

      const title = $('title').text().trim();
      const metaDesc = $('meta[name="description"]').attr('content') ?? '';
      const h1 = $('h1').first().text().trim().slice(0, 120);
      const navItems = $('nav a, header a').map((_, el) => $(el).text().trim()).get()
        .filter(t => t.length > 1 && t.length < 30)
        .slice(0, 8)
        .join(', ');
      const heroP = $('h1').first().next('p').text().trim().slice(0, 200)
        || $('[class*="hero"] p, [class*="banner"] p').first().text().trim().slice(0, 200);

      lines.push(`  [${htmlFile}]`);
      if (title) lines.push(`    title: ${title}`);
      if (metaDesc) lines.push(`    meta-desc: ${metaDesc}`);
      if (h1) lines.push(`    h1: ${h1}`);
      if (heroP && heroP !== h1) lines.push(`    hero-copy: ${heroP}`);
      if (navItems) lines.push(`    nav: ${navItems}`);
    } catch { /* skip */ }
  }

  return lines.join('\n');
}
