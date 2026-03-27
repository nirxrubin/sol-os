import fs from 'fs/promises';
import path from 'path';

interface MediaAsset {
  id: string;
  name: string;
  type: 'image' | 'svg' | 'document' | 'font';
  size: string;
  dimensions?: string;
  optimized: boolean;
  usedIn: string[];
}

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp', '.ico']);
const SVG_EXTENSION = '.svg';
const FONT_EXTENSIONS = new Set(['.woff', '.woff2', '.ttf', '.otf', '.eot']);
const DOC_EXTENSIONS = new Set(['.pdf', '.doc', '.docx']);

export async function analyzeMedia(projectRoot: string, fileTree: string[]): Promise<MediaAsset[]> {
  const assets: MediaAsset[] = [];

  for (const file of fileTree) {
    const ext = path.extname(file).toLowerCase();
    let type: MediaAsset['type'] | null = null;

    if (IMAGE_EXTENSIONS.has(ext)) type = 'image';
    else if (ext === SVG_EXTENSION) type = 'svg';
    else if (FONT_EXTENSIONS.has(ext)) type = 'font';
    else if (DOC_EXTENSIONS.has(ext)) type = 'document';

    if (!type) continue;

    const fullPath = path.join(projectRoot, file);
    let sizeBytes = 0;
    try {
      const stat = await fs.stat(fullPath);
      sizeBytes = stat.size;
    } catch {
      continue;
    }

    const optimized = ext === '.webp' || ext === '.avif' || ext === '.svg' || ext === '.woff2' || sizeBytes < 100 * 1024;

    assets.push({
      id: `media-${assets.length + 1}`,
      name: path.basename(file),
      type,
      size: formatSize(sizeBytes),
      optimized,
      usedIn: [], // Would need cross-referencing with HTML to populate
    });
  }

  return assets;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
