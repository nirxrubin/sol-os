import fs from 'fs/promises';
import path from 'path';
import type { Tool } from '@anthropic-ai/sdk/resources/messages.js';

// ─── Tool definitions (sent to Claude API) ───────────────────────────

export const LIST_FILES_TOOL: Tool = {
  name: 'list_files',
  description: 'List files in the project. Optionally filter to a subdirectory. Returns a formatted file tree. Start here — call list_files() first to understand the project shape.',
  input_schema: {
    type: 'object',
    properties: {
      dir: {
        type: 'string',
        description: 'Optional subdirectory path relative to project root (e.g. "src", "js", "pages"). Omit to list all files.',
      },
    },
  },
};

export const READ_FILE_TOOL: Tool = {
  name: 'read_file',
  description: 'Read the contents of a file. Path is relative to project root. Returns the file contents. Use this to read router files, page components, data files, and package.json.',
  input_schema: {
    type: 'object',
    required: ['path'],
    properties: {
      path: {
        type: 'string',
        description: 'File path relative to project root. e.g. "package.json", "js/router.js", "src/App.tsx"',
      },
    },
  },
};

export const SEARCH_IN_FILE_TOOL: Tool = {
  name: 'search_in_file',
  description: 'Search for a pattern within a specific file. Returns matching lines with line numbers. Useful for finding route definitions, variable declarations, or import statements in large files.',
  input_schema: {
    type: 'object',
    required: ['path', 'pattern'],
    properties: {
      path: {
        type: 'string',
        description: 'File path relative to project root.',
      },
      pattern: {
        type: 'string',
        description: 'String to search for. Case-insensitive substring match.',
      },
    },
  },
};

export const WRITE_FILE_TOOL: Tool = {
  name: 'write_file',
  description: 'Write content to a file in the project. Use this after reading a page component to save the modified version with data-sol-field, data-sol-static, and data-sol-image attributes injected. Only write files you have already read.',
  input_schema: {
    type: 'object',
    required: ['path', 'content'],
    properties: {
      path: {
        type: 'string',
        description: 'File path relative to project root. Must be a file you have already read.',
      },
      content: {
        type: 'string',
        description: 'The complete new file content with data-sol attributes injected.',
      },
    },
  },
};

// Phase 1 tools: read-only. No write_file — source mutations happen in Phase 2 (deterministic injector).
// This gives the full budget to discovery and prevents split-brain state.
export const ALL_TOOLS: Tool[] = [LIST_FILES_TOOL, READ_FILE_TOOL, SEARCH_IN_FILE_TOOL];
// Note: WRITE_ANALYSIS_TOOL is imported from outputSchema.ts and added by the agent

// ─── Tool implementations ─────────────────────────────────────────────

const MAX_FILE_SIZE = 80 * 1024; // 80KB — truncate larger files

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  projectRoot: string,
  fileTree: string[],
): Promise<string> {
  try {
    switch (name) {
      case 'list_files':
        return executeListFiles(input.dir as string | undefined, projectRoot, fileTree);

      case 'read_file':
        return executeReadFile(input.path as string, projectRoot);

      case 'search_in_file':
        return executeSearchInFile(input.path as string, input.pattern as string, projectRoot);

      case 'write_file':
        return executeWriteFile(input.path as string, input.content as string, projectRoot);

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function executeListFiles(
  dir: string | undefined,
  projectRoot: string,
  fileTree: string[],
): string {
  let filtered = fileTree;

  if (dir) {
    const normalizedDir = dir.replace(/\\/g, '/').replace(/^\//, '');
    filtered = fileTree.filter(f => f.startsWith(normalizedDir + '/') || f.startsWith(normalizedDir + '\\'));
    if (filtered.length === 0) {
      return `No files found in "${dir}". Available top-level entries:\n${getTopLevel(fileTree).join('\n')}`;
    }
  }

  if (filtered.length === 0) {
    return 'No files found.';
  }

  // Build a simple indented tree
  return buildFileTree(filtered, dir);
}

function getTopLevel(fileTree: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const f of fileTree) {
    const parts = f.split(/[/\\]/);
    const top = parts[0];
    if (!seen.has(top)) {
      seen.add(top);
      result.push(parts.length > 1 ? `${top}/` : top);
    }
  }
  return result;
}

function buildFileTree(files: string[], prefix?: string): string {
  const lines: string[] = [`${files.length} files${prefix ? ` in ${prefix}/` : ''}:`];

  // Group by directory
  const dirMap = new Map<string, string[]>();
  for (const f of files) {
    const normalized = prefix ? f.slice(prefix.length).replace(/^[/\\]/, '') : f;
    const parts = normalized.split(/[/\\]/);
    if (parts.length === 1) {
      const existing = dirMap.get('') ?? [];
      existing.push(parts[0]);
      dirMap.set('', existing);
    } else {
      const dir = parts[0];
      const existing = dirMap.get(dir) ?? [];
      existing.push(parts.slice(1).join('/'));
      dirMap.set(dir, existing);
    }
  }

  // Root files first
  const rootFiles = dirMap.get('') ?? [];
  for (const f of rootFiles) lines.push(`  ${f}`);

  // Then directories
  for (const [dir, dirFiles] of dirMap.entries()) {
    if (!dir) continue;
    lines.push(`  ${dir}/`);
    for (const f of dirFiles.slice(0, 20)) {
      lines.push(`    ${f}`);
    }
    if (dirFiles.length > 20) {
      lines.push(`    ... and ${dirFiles.length - 20} more`);
    }
  }

  return lines.join('\n');
}

async function executeReadFile(filePath: string, projectRoot: string): Promise<string> {
  if (!filePath) return 'Error: path is required';

  // Normalize and validate path
  const normalized = filePath.replace(/\\/g, '/').replace(/^\//, '');
  const fullPath = path.resolve(projectRoot, normalized);

  // Path traversal guard
  if (!fullPath.startsWith(path.resolve(projectRoot))) {
    return 'Error: path is outside project root';
  }

  let content: string;
  try {
    const buf = await fs.readFile(fullPath);
    if (buf.length > MAX_FILE_SIZE) {
      content = buf.slice(0, MAX_FILE_SIZE).toString('utf-8');
      content += `\n\n[... file truncated at ${MAX_FILE_SIZE / 1024}KB — use search_in_file() to find specific content ...]`;
    } else {
      content = buf.toString('utf-8');
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return `File not found: ${normalized}`;
    }
    throw err;
  }

  return content;
}

async function executeWriteFile(filePath: string, content: string, projectRoot: string): Promise<string> {
  if (!filePath || content === undefined) return 'Error: path and content are required';

  const normalized = filePath.replace(/\\/g, '/').replace(/^\//, '');
  const fullPath = path.resolve(projectRoot, normalized);

  if (!fullPath.startsWith(path.resolve(projectRoot))) {
    return 'Error: path is outside project root';
  }

  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, 'utf-8');
  return `Written: ${normalized} (${content.length} bytes)`;
}

async function executeSearchInFile(filePath: string, pattern: string, projectRoot: string): Promise<string> {
  if (!filePath || !pattern) return 'Error: path and pattern are required';

  const normalized = filePath.replace(/\\/g, '/').replace(/^\//, '');
  const fullPath = path.resolve(projectRoot, normalized);

  if (!fullPath.startsWith(path.resolve(projectRoot))) {
    return 'Error: path is outside project root';
  }

  let content: string;
  try {
    content = await fs.readFile(fullPath, 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return `File not found: ${normalized}`;
    }
    throw err;
  }

  const lines = content.split('\n');
  const lowerPattern = pattern.toLowerCase();
  const matches: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(lowerPattern)) {
      matches.push(`${i + 1}: ${lines[i]}`);
    }
  }

  if (matches.length === 0) {
    return `No matches for "${pattern}" in ${normalized}`;
  }

  if (matches.length > 50) {
    return `${matches.slice(0, 50).join('\n')}\n... and ${matches.length - 50} more matches`;
  }

  return `${matches.length} match${matches.length === 1 ? '' : 'es'} for "${pattern}" in ${normalized}:\n${matches.join('\n')}`;
}
