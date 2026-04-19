/**
 * Safe ZIP extraction with guards lifted from hp-server/src/upload.ts:
 * - blocks zip-slip (no escape via ../)
 * - drops macOS metadata, .git/, node_modules/, .claude/, .cursor/, .DS_Store
 * - returns the extraction directory + a list of extracted file paths
 */

import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Parse } from "unzipper";

export interface ExtractOptions {
  /** Where to extract into. Created if missing. */
  destDir: string;
  /** Hard cap on extracted size in bytes. Default 500MB. */
  maxBytes?: number;
}

export interface ExtractResult {
  destDir: string;
  /** Absolute path of every extracted file. */
  files: string[];
  /** Bytes written. */
  bytes: number;
  /** True when the archive contained a single root directory we descended into. */
  hadSingleRoot: boolean;
  /** The effective project root (descends into a single wrapper folder if present). */
  projectRoot: string;
}

const SKIP_PATTERNS = [
  /^__MACOSX/,
  /(^|\/)\.git(\/|$)/,
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)\.claude(\/|$)/,
  /(^|\/)\.cursor(\/|$)/,
  /\.DS_Store$/,
];

function shouldSkip(p: string): boolean {
  return SKIP_PATTERNS.some((re) => re.test(p));
}

export async function extractZip(zipPath: string, opts: ExtractOptions): Promise<ExtractResult> {
  const destDir = path.resolve(opts.destDir);
  const maxBytes = opts.maxBytes ?? 500 * 1024 * 1024;

  await fs.mkdir(destDir, { recursive: true });

  const files: string[] = [];
  let bytes = 0;

  await new Promise<void>((resolve, reject) => {
    const writes: Promise<void>[] = [];

    createReadStream(zipPath)
      .pipe(Parse())
      .on("entry", (entry: any) => {
        const entryPath = entry.path as string;
        const entryType = entry.type as "Directory" | "File";

        if (shouldSkip(entryPath)) {
          entry.autodrain();
          return;
        }

        const fullPath = path.resolve(destDir, entryPath);
        // zip-slip guard
        if (!fullPath.startsWith(destDir + path.sep) && fullPath !== destDir) {
          entry.autodrain();
          return;
        }

        if (entryType === "Directory") {
          writes.push(fs.mkdir(fullPath, { recursive: true }).then(() => undefined));
          entry.autodrain();
          return;
        }

        // File entry — write it
        writes.push(
          (async () => {
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            const chunks: Buffer[] = [];
            await new Promise<void>((res, rej) => {
              entry.on("data", (chunk: Buffer) => {
                bytes += chunk.length;
                if (bytes > maxBytes) {
                  rej(new Error(`ZIP exceeds ${maxBytes} bytes`));
                  return;
                }
                chunks.push(chunk);
              });
              entry.on("end", () => res());
              entry.on("error", rej);
            });
            await fs.writeFile(fullPath, Buffer.concat(chunks));
            files.push(fullPath);
          })(),
        );
      })
      .on("close", () => {
        Promise.all(writes).then(() => resolve(), reject);
      })
      .on("error", reject);
  });

  // Detect single-root wrapper folder (common for ZIPs)
  const topEntries = await fs.readdir(destDir);
  const visibleTop = topEntries.filter((e) => !e.startsWith("."));
  let projectRoot = destDir;
  let hadSingleRoot = false;

  if (visibleTop.length === 1) {
    const candidate = path.join(destDir, visibleTop[0]!);
    const stat = await fs.stat(candidate);
    if (stat.isDirectory()) {
      projectRoot = candidate;
      hadSingleRoot = true;
    }
  }

  return { destDir, files, bytes, hadSingleRoot, projectRoot };
}
