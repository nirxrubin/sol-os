/**
 * Cloudflare Pages Direct Upload
 *
 * Deploys a local static directory to Cloudflare Pages using the Direct Upload API.
 * Each project is mapped to a Pages project named after the slug, and served at
 * both {slug}.pages.dev and {slug}.hostaposta.app via a proxied CNAME.
 *
 * Flow:
 *   1. Sanitise slug → CF project name (lowercase, hyphens only)
 *   2. Ensure Pages project exists (create if not)
 *   3. Collect all files, compute SHA-256 per file
 *   4. POST multipart: manifest (path→hash map) + raw file bytes keyed by hash
 *   5. Ensure DNS CNAME exists: slug.hostaposta.app → project.pages.dev
 *   6. Ensure custom domain is attached to the Pages project
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// ─── Config (from environment) ─────────────────────────────────────────────

const CF_API = 'https://api.cloudflare.com/client/v4';

function getCFConfig() {
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken  = process.env.CF_API_TOKEN;
  const zoneId    = process.env.CF_ZONE_ID;
  const domain    = process.env.CF_PAGES_DOMAIN ?? 'hostaposta.app';

  if (!accountId || !apiToken || !zoneId) {
    throw new Error(
      'Missing Cloudflare credentials. Ensure CF_ACCOUNT_ID, CF_API_TOKEN, CF_ZONE_ID are set in .env',
    );
  }
  return { accountId, apiToken, zoneId, domain };
}

// ─── Public types ──────────────────────────────────────────────────────────

export interface DeployResult {
  success: boolean;
  deploymentId?: string;
  url?: string;       // e.g. https://calculator-main.hostaposta.app
  pagesUrl?: string;  // e.g. https://calculator-main.pages.dev
  error?: string;
}

// ─── Main export ───────────────────────────────────────────────────────────

/**
 * Deploy a local directory to Cloudflare Pages.
 *
 * @param projectSlug  Human-readable slug (will be sanitised for CF naming rules)
 * @param serveDir     Absolute path to the static directory to deploy
 */
export async function deployToCloudflarePages(
  projectSlug: string,
  serveDir: string,
): Promise<DeployResult> {
  // ── Validate inputs ────────────────────────────────────────────────────
  if (!existsSync(serveDir)) {
    return { success: false, error: `serveDir does not exist: ${serveDir}` };
  }

  let cfg: ReturnType<typeof getCFConfig>;
  try {
    cfg = getCFConfig();
  } catch (err: any) {
    return { success: false, error: err.message };
  }

  const projectName = sanitiseSlug(projectSlug);
  console.log(`[deploy] project=${projectName}  serveDir=${serveDir}`);

  // ── 1. Ensure Pages project exists ────────────────────────────────────
  try {
    await ensurePagesProject(cfg, projectName);
  } catch (err: any) {
    return { success: false, error: `Failed to ensure Pages project: ${err.message}` };
  }

  // ── 2. Upload deployment via manifest ─────────────────────────────────
  let deploymentId: string;
  try {
    deploymentId = await createDeployment(cfg, projectName, serveDir);
    console.log(`[deploy] Deployment created: ${deploymentId}`);
  } catch (err: any) {
    return { success: false, error: `Failed to create deployment: ${err.message}` };
  }

  // ── 4. DNS + custom domain (best-effort — don't fail deploy on these) ──
  const customHost = `${projectName}.${cfg.domain}`;
  const pagesHost  = `${projectName}.pages.dev`;

  try {
    await ensureCnameDns(cfg, projectName, pagesHost);
    console.log(`[deploy] DNS CNAME ensured: ${customHost} → ${pagesHost}`);
  } catch (err: any) {
    console.warn(`[deploy] Warning: DNS setup failed (non-fatal): ${err.message}`);
  }

  try {
    await ensureCustomDomain(cfg, projectName, customHost);
    console.log(`[deploy] Custom domain attached: ${customHost}`);
  } catch (err: any) {
    console.warn(`[deploy] Warning: Custom domain setup failed (non-fatal): ${err.message}`);
  }

  return {
    success: true,
    deploymentId,
    url: `https://${customHost}`,
    pagesUrl: `https://${pagesHost}`,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Sanitise an arbitrary string into a valid Cloudflare Pages project name.
 * Rules: lowercase, alphanumeric + hyphens, max 63 chars, no leading/trailing hyphens.
 */
function sanitiseSlug(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')   // replace invalid chars with hyphens
    .replace(/-{2,}/g, '-')         // collapse consecutive hyphens
    .replace(/^-+|-+$/g, '')        // strip leading/trailing hyphens
    .slice(0, 63)
    || 'project';
}

/**
 * Return auth headers for every CF API request.
 */
function authHeaders(apiToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiToken}`,
  };
}

/**
 * Make a Cloudflare API request and return the parsed body.
 * Throws on HTTP errors or CF-level errors.
 */
async function cfRequest<T = unknown>(
  apiToken: string,
  method: string,
  url: string,
  options: { json?: unknown; form?: FormData } = {},
): Promise<T> {
  const headers: Record<string, string> = authHeaders(apiToken);
  let body: BodyInit | undefined;

  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.json);
  } else if (options.form) {
    // FormData sets its own Content-Type with boundary automatically
    body = options.form as unknown as BodyInit;
  }

  const res = await fetch(url, { method, headers, body });

  // CF returns 200 or 201 on success; anything else is an error
  let json: any;
  try {
    json = await res.json();
  } catch {
    const text = await res.text().catch(() => '');
    throw new Error(`CF API returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok || json.success === false) {
    const msgs = (json.errors ?? []).map((e: any) => `${e.code}: ${e.message}`).join('; ');
    throw new Error(msgs || `HTTP ${res.status}`);
  }

  return json.result as T;
}

/**
 * Ensure a Cloudflare Pages project exists.
 * If it already exists (409), silently continues.
 */
async function ensurePagesProject(
  cfg: ReturnType<typeof getCFConfig>,
  projectName: string,
): Promise<void> {
  const url = `${CF_API}/accounts/${cfg.accountId}/pages/projects`;

  // Check existence first
  try {
    await cfRequest(cfg.apiToken, 'GET', `${url}/${projectName}`);
    console.log(`[deploy] Pages project "${projectName}" already exists`);
    return;
  } catch {
    // Project doesn't exist yet — create it
  }

  await cfRequest(cfg.apiToken, 'POST', url, {
    json: {
      name: projectName,
      production_branch: 'main',
    },
  });
  console.log(`[deploy] Created Pages project "${projectName}"`);
}

/**
 * Recursively collect all files under a directory.
 * Returns a list of { relPath, absPath } — relPath is relative to dirPath, no leading slash.
 */
async function collectFiles(
  dirPath: string,
  base = '',
): Promise<{ relPath: string; absPath: string }[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const results: { relPath: string; absPath: string }[] = [];

  for (const entry of entries) {
    // Skip hidden files/dirs, node_modules, .git
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

    const relPath = base ? `${base}/${entry.name}` : entry.name;
    const absPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      const children = await collectFiles(absPath, relPath);
      results.push(...children);
    } else {
      results.push({ relPath, absPath });
    }
  }
  return results;
}

/**
 * Upload a directory as a new Cloudflare Pages deployment using the Direct Upload API.
 *
 * The CF Pages Direct Upload format:
 *   multipart/form-data with:
 *     - "manifest" field: JSON object { "/path/file.html": "<sha256-hex>", ... }
 *     - One field per unique file, named by its sha256 hex hash, containing the raw bytes
 *
 * CF Pages deduplicates files across deployments using content hashes —
 * unchanged files are not re-uploaded.
 *
 * Returns the deployment ID.
 */
async function createDeployment(
  cfg: ReturnType<typeof getCFConfig>,
  projectName: string,
  serveDir: string,
): Promise<string> {
  const url = `${CF_API}/accounts/${cfg.accountId}/pages/projects/${projectName}/deployments`;

  // 1. Collect all files and compute SHA-256 hashes
  const files = await collectFiles(serveDir);
  console.log(`[deploy] Uploading ${files.length} files`);

  const manifest: Record<string, string> = {};
  const byHash = new Map<string, { content: Buffer; name: string }>();

  for (const { relPath, absPath } of files) {
    const content = await fs.readFile(absPath);
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    manifest['/' + relPath] = hash;
    if (!byHash.has(hash)) {
      byHash.set(hash, { content, name: relPath });
    }
  }

  // 2. Build the multipart form
  const form = new FormData();
  form.append('manifest', JSON.stringify(manifest));

  for (const [hash, { content, name }] of byHash) {
    const blob = new Blob([new Uint8Array(content)]);
    form.append(hash, blob, name);
  }

  const result = await cfRequest<{ id: string }>(cfg.apiToken, 'POST', url, { form });
  return result.id;
}

/**
 * Ensure a proxied CNAME DNS record exists in the hostaposta.app zone.
 * Skips creation if a record with the same name already exists.
 */
async function ensureCnameDns(
  cfg: ReturnType<typeof getCFConfig>,
  subdomain: string,
  target: string,
): Promise<void> {
  const listUrl = `${CF_API}/zones/${cfg.zoneId}/dns_records?type=CNAME&name=${subdomain}.${cfg.domain}`;
  const existing = await cfRequest<{ id: string }[]>(cfg.apiToken, 'GET', listUrl);

  if (existing && existing.length > 0) {
    console.log(`[deploy] DNS CNAME for ${subdomain}.${cfg.domain} already exists`);
    return;
  }

  const createUrl = `${CF_API}/zones/${cfg.zoneId}/dns_records`;
  await cfRequest(cfg.apiToken, 'POST', createUrl, {
    json: {
      type: 'CNAME',
      name: subdomain,
      content: target,
      proxied: true,
      ttl: 1, // 1 = automatic when proxied
    },
  });
}

/**
 * Attach a custom hostname to an existing Cloudflare Pages project.
 * Skips if the domain is already attached (409 / already exists).
 */
async function ensureCustomDomain(
  cfg: ReturnType<typeof getCFConfig>,
  projectName: string,
  customDomain: string,
): Promise<void> {
  const url = `${CF_API}/accounts/${cfg.accountId}/pages/projects/${projectName}/domains`;

  try {
    await cfRequest(cfg.apiToken, 'POST', url, {
      json: { name: customDomain },
    });
  } catch (err: any) {
    // "already exists" errors are fine — ignore them
    if (/already/i.test(err.message) || /8000012/.test(err.message)) {
      console.log(`[deploy] Custom domain ${customDomain} already attached`);
      return;
    }
    throw err;
  }
}
