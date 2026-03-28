/**
 * Source Array Editor
 *
 * Edits hardcoded data arrays in JS/TS source files.
 * Used for CMS sync in SPA projects where content lives in
 * source code arrays rather than HTML elements.
 *
 * Example: editing `articles[2].title` in:
 *   const articles = [
 *     { title: 'Old Title', excerpt: '...' },
 *   ];
 *
 * Strategy: Use regex-based field replacement within the specific
 * array item. This preserves formatting, comments, and non-string values.
 */

import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

export interface SourceArrayEdit {
  file: string;          // Relative path to source file
  varName: string;       // Array variable name
  itemIndex: number;     // Index in the array
  fieldName: string;     // Field to edit
  newValue: string;      // New value
  oldValue?: string;     // Previous value (for changelog)
}

export interface SourceArrayEditResult {
  success: boolean;
  changeId: string;
  file: string;
  varName: string;
  itemIndex: number;
  fieldName: string;
  oldValue: string;
  newValue: string;
  error?: string;
}

/**
 * Apply edits to source code arrays.
 * Groups edits by file for efficient batch processing.
 */
export async function applySourceArrayEdits(
  projectRoot: string,
  edits: SourceArrayEdit[],
): Promise<SourceArrayEditResult[]> {
  // Group by file
  const byFile = new Map<string, SourceArrayEdit[]>();
  for (const edit of edits) {
    if (!byFile.has(edit.file)) byFile.set(edit.file, []);
    byFile.get(edit.file)!.push(edit);
  }

  const results: SourceArrayEditResult[] = [];

  for (const [file, fileEdits] of byFile) {
    const filePath = path.join(projectRoot, file);
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      for (const edit of fileEdits) {
        results.push({
          success: false,
          changeId: randomUUID(),
          file, varName: edit.varName, itemIndex: edit.itemIndex,
          fieldName: edit.fieldName, oldValue: '', newValue: edit.newValue,
          error: `File not found: ${file}`,
        });
      }
      continue;
    }

    let modified = content;

    for (const edit of fileEdits) {
      const changeId = randomUUID();
      try {
        const result = replaceArrayField(modified, edit);
        if (result.success) {
          modified = result.content;
          results.push({
            success: true, changeId, file,
            varName: edit.varName, itemIndex: edit.itemIndex,
            fieldName: edit.fieldName,
            oldValue: result.oldValue, newValue: edit.newValue,
          });
        } else {
          results.push({
            success: false, changeId, file,
            varName: edit.varName, itemIndex: edit.itemIndex,
            fieldName: edit.fieldName, oldValue: '', newValue: edit.newValue,
            error: result.error,
          });
        }
      } catch (err) {
        results.push({
          success: false, changeId, file,
          varName: edit.varName, itemIndex: edit.itemIndex,
          fieldName: edit.fieldName, oldValue: '', newValue: edit.newValue,
          error: String(err),
        });
      }
    }

    // Write back if any edits succeeded
    if (modified !== content) {
      const tmpPath = filePath + '.tmp.' + randomUUID().slice(0, 8);
      await fs.writeFile(tmpPath, modified, 'utf-8');
      await fs.rename(tmpPath, filePath);
    }
  }

  return results;
}

/**
 * Replace a single field value within a specific array item in source code.
 */
function replaceArrayField(
  content: string,
  edit: SourceArrayEdit,
): { success: boolean; content: string; oldValue: string; error?: string } {
  // Find the array variable declaration
  const arrayPattern = new RegExp(
    `(?:const|let|var)\\s+${escapeRegex(edit.varName)}\\s*(?::\\s*[^=]+)?\\s*=\\s*\\[`,
  );
  const arrayMatch = arrayPattern.exec(content);
  if (!arrayMatch) {
    return { success: false, content, oldValue: '', error: `Variable "${edit.varName}" not found` };
  }

  const arrayStart = arrayMatch.index + arrayMatch[0].length - 1; // Position of [

  // Find the specific array item by counting object braces
  let itemStart = -1;
  let itemEnd = -1;
  let itemCount = 0;
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let escaped = false;

  for (let i = arrayStart + 1; i < content.length; i++) {
    const ch = content[i];

    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }

    if (inString) {
      if (ch === stringChar) inString = false;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inString = true;
      stringChar = ch;
      continue;
    }

    if (ch === '{' && depth === 0) {
      if (itemCount === edit.itemIndex) {
        itemStart = i;
      }
      depth++;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        if (itemCount === edit.itemIndex) {
          itemEnd = i + 1;
          break;
        }
        itemCount++;
      }
    } else if (ch === ']' && depth === 0) {
      break; // End of array
    }
  }

  if (itemStart === -1 || itemEnd === -1) {
    return { success: false, content, oldValue: '', error: `Item at index ${edit.itemIndex} not found in "${edit.varName}"` };
  }

  const itemContent = content.substring(itemStart, itemEnd);

  // Find the field within this item and replace its value
  // Handles: fieldName: 'value', fieldName: "value", fieldName: `value`, fieldName: 123
  const fieldPattern = new RegExp(
    `(${escapeRegex(edit.fieldName)}\\s*:\\s*)` +
    `(?:` +
      `'([^']*)'` +   // single-quoted string (group 2)
      `|"([^"]*)"` +  // double-quoted string (group 3)
      `|\`([^\`]*)\`` + // template literal (group 4)
      `|(\\d+(?:\\.\\d+)?)` + // number (group 5)
    `)`,
  );
  const fieldMatch = fieldPattern.exec(itemContent);

  if (!fieldMatch) {
    return { success: false, content, oldValue: '', error: `Field "${edit.fieldName}" not found in item ${edit.itemIndex}` };
  }

  const prefix = fieldMatch[1]; // "fieldName: "
  const oldValue = fieldMatch[2] ?? fieldMatch[3] ?? fieldMatch[4] ?? fieldMatch[5] ?? '';
  const fullMatch = fieldMatch[0];

  // Determine quote style from original
  let quoteChar = "'";
  if (fieldMatch[3] !== undefined) quoteChar = '"';
  else if (fieldMatch[4] !== undefined) quoteChar = '`';
  else if (fieldMatch[5] !== undefined) quoteChar = ''; // number

  // Build replacement
  let newFieldValue: string;
  if (quoteChar === '') {
    // Was a number - if new value is numeric, keep unquoted; otherwise quote it
    const numVal = Number(edit.newValue);
    if (!isNaN(numVal) && edit.newValue.trim() !== '') {
      newFieldValue = `${prefix}${edit.newValue}`;
    } else {
      newFieldValue = `${prefix}'${escapeStringValue(edit.newValue)}'`;
    }
  } else {
    // Escape the new value for the quote style
    const escaped = quoteChar === '`'
      ? edit.newValue.replace(/`/g, '\\`')
      : escapeStringValue(edit.newValue);
    newFieldValue = `${prefix}${quoteChar}${escaped}${quoteChar}`;
  }

  // Replace within the item content
  const newItemContent = itemContent.replace(fullMatch, newFieldValue);

  // Replace the item in the full content
  const newContent = content.substring(0, itemStart) + newItemContent + content.substring(itemEnd);

  return { success: true, content: newContent, oldValue };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeStringValue(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n');
}
