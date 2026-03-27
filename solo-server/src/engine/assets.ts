/**
 * Asset Management Engine
 *
 * Handles image uploads and asset management for the project.
 * When a user replaces an image on canvas, the file is uploaded here
 * and stored in the project's directory — giving it a real relative path
 * that works in the deployed site.
 */

import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const ASSETS_DIR = 'sol-assets'; // Directory within project for uploaded assets

export interface UploadedAsset {
  relativePath: string;  // e.g., "sol-assets/hero-a1b2c3.jpg"
  absolutePath: string;  // Full disk path
  originalName: string;
  size: number;
  mimeType: string;
}

export async function uploadAsset(
  projectRoot: string,
  fileBuffer: Buffer,
  originalName: string,
  mimeType: string,
): Promise<UploadedAsset> {
  // Ensure assets directory exists
  const assetsDir = path.join(projectRoot, ASSETS_DIR);
  await fs.mkdir(assetsDir, { recursive: true });

  // Generate unique filename preserving extension
  const ext = path.extname(originalName) || mimeTypeToExt(mimeType);
  const baseName = path.basename(originalName, ext)
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .substring(0, 40);
  const uniqueId = randomUUID().slice(0, 8);
  const fileName = `${baseName}-${uniqueId}${ext}`;

  const absolutePath = path.join(assetsDir, fileName);
  await fs.writeFile(absolutePath, fileBuffer);

  return {
    relativePath: `${ASSETS_DIR}/${fileName}`,
    absolutePath,
    originalName,
    size: fileBuffer.length,
    mimeType,
  };
}

function mimeTypeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'image/avif': '.avif',
  };
  return map[mime] ?? '.bin';
}
