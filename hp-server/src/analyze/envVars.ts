/**
 * Env Var Gate
 *
 * Before any deploy, this module:
 * 1. Extracts all env vars referenced in source (VITE_*, NEXT_PUBLIC_*, REACT_APP_*)
 * 2. Parses the uploaded .env file (if present) to find already-provided values
 * 3. Returns a structured list: required, provided, missing
 *
 * The deploy is blocked until all required vars have values OR the user
 * explicitly chooses to leave them empty.
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { extractRequiredEnvVars } from './patch.js';

export interface EnvVarStatus {
  required: string[];
  provided: Record<string, string>;  // var name → value (from .env file)
  missing: string[];                  // required vars with no value
  complete: boolean;                  // true when missing.length === 0
}

/**
 * Compute env var status for a project directory.
 * Reads required vars from source code and provided values from .env file.
 */
export async function getEnvVarStatus(projectRoot: string): Promise<EnvVarStatus> {
  const [required, provided] = await Promise.all([
    extractRequiredEnvVars(projectRoot),
    parseEnvFile(projectRoot),
  ]);

  const missing = required.filter(v => !provided[v]);

  return {
    required,
    provided,
    missing,
    complete: missing.length === 0,
  };
}

/**
 * Parse a .env file at projectRoot and return a map of variable names to values.
 * Handles .env, .env.local, .env.production in priority order.
 * Only returns non-empty values.
 */
export async function parseEnvFile(projectRoot: string): Promise<Record<string, string>> {
  const candidates = ['.env', '.env.local', '.env.production'];
  const result: Record<string, string> = {};

  for (const name of candidates) {
    const envPath = path.join(projectRoot, name);
    if (!existsSync(envPath)) continue;
    try {
      const content = await fs.readFile(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (key && value) {
          result[key] = value;
        }
      }
    } catch { /* ignore */ }
  }

  return result;
}

/**
 * Merge user-supplied env var values into the project's .env.local.
 * Used when the user fills in the env var gate form before deploying.
 */
export async function mergeUserEnvVars(
  projectRoot: string,
  userVars: Record<string, string>,
): Promise<void> {
  const envLocalPath = path.join(projectRoot, '.env.local');

  let existing = '';
  try {
    existing = await fs.readFile(envLocalPath, 'utf-8');
  } catch { /* file may not exist */ }

  const lines = existing.split('\n').filter(Boolean);
  const existingKeys = new Map(
    lines.map(l => {
      const idx = l.indexOf('=');
      return idx === -1 ? [l.trim(), ''] : [l.slice(0, idx).trim(), l.slice(idx + 1)];
    }),
  );

  // Override existing, add missing
  for (const [key, value] of Object.entries(userVars)) {
    existingKeys.set(key, value);
  }

  const content = Array.from(existingKeys.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('\n') + '\n';

  await fs.writeFile(envLocalPath, content);
}
