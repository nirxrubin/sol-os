import { useEffect, useRef, useState, useCallback } from 'react';
import {
  initIframeEditor,
  getCSSSelector,
  type IframeSelection,
  type CanvasEdit,
} from '../lib/iframeEditorBridge';
import type { ContentType } from '../data/types';

// ─── Types ────────────────────────────────────────────────────────

export interface ToolbarPosition {
  top: number;
  left: number;
  width: number;
  visible: boolean;
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// ─── Source file edit API ─────────────────────────────────────────

interface SourceEdit {
  page: string;
  selector: string;
  type: 'text' | 'image';
  content: string;
  alt?: string;
}

async function postSourceEdits(edits: SourceEdit[]): Promise<boolean> {
  try {
    const res = await fetch('/api/source/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ edits, source: 'canvas' }),
    });
    const data = await res.json();
    return data.ok === true;
  } catch {
    return false;
  }
}

async function uploadAsset(file: File): Promise<string | null> {
  try {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/source/upload-asset', { method: 'POST', body: form });
    const data = await res.json();
    return data.ok ? data.path : null;
  } catch {
    return null;
  }
}


// ─── Main hook ────────────────────────────────────────────────────

export function useIframeEditor(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  pagePath?: string,
  contentTypes?: ContentType[],
) {
  const [selection, setSelection] = useState<IframeSelection | null>(null);
  const [toolbarPos, setToolbarPos] = useState<ToolbarPosition>({ top: 0, left: 0, width: 0, visible: false });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const cleanupRef = useRef<(() => void) | null>(null);
  const pendingEditsRef = useRef<Map<string, SourceEdit>>(new Map()); // selector → edit
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pagePathRef = useRef(pagePath);
  pagePathRef.current = pagePath;

  // Compute parent-frame coordinates from iframe-internal rect
  const updatePosition = useCallback((rect: DOMRect) => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const iframeRect = iframe.getBoundingClientRect();
    setToolbarPos({
      top: iframeRect.top + rect.top,
      left: iframeRect.left + rect.left,
      width: rect.width,
      visible: true,
    });
  }, [iframeRef]);

  // Resolve page path for edits - map "/" to "/index.html"
  const resolvePageFile = useCallback((p?: string): string => {
    if (!p) return '/index.html';
    if (p === '/') return '/index.html';
    if (p.endsWith('.html')) return p;
    return p + '.html';
  }, []);

  // Flush pending edits to server (source files)
  const flushEdits = useCallback(async () => {
    if (pendingEditsRef.current.size === 0) return;

    const edits = Array.from(pendingEditsRef.current.values());
    pendingEditsRef.current.clear();

    setSaveStatus('saving');
    const ok = await postSourceEdits(edits);
    setSaveStatus(ok ? 'saved' : 'error');

    // Reset to idle after showing "saved"
    if (ok) {
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  }, []);

  // Debounced save
  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flushEdits, 800);
  }, [flushEdits]);

  const handleLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    // Clean up previous bridge
    cleanupRef.current?.();

    let doc: Document;
    try {
      doc = iframe.contentDocument!;
      if (!doc || !doc.body) return;
    } catch {
      return;
    }

    // No need to fetch/apply overlays - the iframe loads the REAL source file
    // which already has all edits baked in from previous saves.

    cleanupRef.current = initIframeEditor(doc, {
      onHover: () => {},
      onSelect: (info) => {
        setSelection(info);
        if (info) {
          updatePosition(info.rect);
        } else {
          setToolbarPos((p) => ({ ...p, visible: false }));
        }
      },
      onContentChange: (selector, _element, html) => {
        const pageFile = resolvePageFile(pagePathRef.current);
        pendingEditsRef.current.set(selector, {
          page: pageFile,
          selector,
          type: 'text',
          content: html,
        });
        scheduleSave();
      },
      onImageChange: (selector, src, alt) => {
        const pageFile = resolvePageFile(pagePathRef.current);
        pendingEditsRef.current.set(selector, {
          page: pageFile,
          selector,
          type: 'image',
          content: src,
          alt,
        });
        scheduleSave();
      },
      onRectUpdate: (rect) => {
        updatePosition(rect);
      },
    });
  }, [iframeRef, updatePosition, scheduleSave, resolvePageFile]);

  // Init bridge when iframe loads
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    iframe.addEventListener('load', handleLoad);

    try {
      if (iframe.contentDocument?.readyState === 'complete' && iframe.contentDocument.body) {
        handleLoad();
      }
    } catch { /* cross-origin */ }

    return () => {
      iframe.removeEventListener('load', handleLoad);
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [iframeRef, handleLoad]);

  // Flush pending edits before page navigation
  useEffect(() => {
    // When page changes, flush any pending edits from the previous page
    flushEdits();
    pendingEditsRef.current.clear();
  }, [pagePath]); // eslint-disable-line react-hooks/exhaustive-deps

  // ESC in parent frame
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') deselect();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const execFormat = useCallback((command: string, value?: string) => {
    try {
      const doc = iframeRef.current?.contentDocument;
      (doc as any)?.__soloEditorBridge?.execCommand(command, value);
      // After formatting, save the updated content
      const el = (doc as any)?.__soloEditorBridge?.getSelectedElement();
      if (el && el.tagName !== 'IMG') {
        const selector = getCSSSelector(el);
        const pageFile = resolvePageFile(pagePathRef.current);
        pendingEditsRef.current.set(selector, {
          page: pageFile,
          selector,
          type: 'text',
          content: el.innerHTML,
        });
        scheduleSave();
      }
    } catch { /* ignore */ }
  }, [iframeRef, scheduleSave, resolvePageFile]);

  const deselect = useCallback(() => {
    try {
      const doc = iframeRef.current?.contentDocument;
      (doc as any)?.__soloEditorBridge?.deselect();
    } catch { /* ignore */ }
    setSelection(null);
    setToolbarPos((p) => ({ ...p, visible: false }));
  }, [iframeRef]);

  // Image replacement - uploads to server, gets a real project-relative path
  const replaceImage = useCallback(async (file: File) => {
    const relativePath = await uploadAsset(file);
    if (!relativePath) return;

    try {
      const doc = iframeRef.current?.contentDocument;
      const bridge = (doc as any)?.__soloEditorBridge;
      if (bridge) {
        bridge.replaceImage(relativePath, file.name);
        // The bridge's replaceImage triggers onImageChange → scheduleSave
      }
    } catch { /* ignore */ }
  }, [iframeRef]);

  return {
    selection,
    toolbarPos,
    saveStatus,
    execFormat,
    deselect,
    replaceImage,
    flushEdits,
  };
}
