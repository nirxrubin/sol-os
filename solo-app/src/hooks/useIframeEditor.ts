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
  navigateTo?: string,
  enabled?: boolean,
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

  // Resolve which source file to write edits to.
  // SPA (hash routing): all pages are rendered by index.html — edits target index.html.
  // Multi-page HTML: each page has its own .html file.
  const resolvePageFile = useCallback((p?: string): string => {
    // Hash-based SPA: navigateTo starts with "#" — all content lives in index.html
    if (navigateTo?.startsWith('#')) return '/index.html';
    if (!p) return '/index.html';
    if (p === '/') return '/index.html';
    if (p.endsWith('.html')) return p;
    return p + '.html';
  }, [navigateTo]);

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

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const handleLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    // Clean up previous bridge
    cleanupRef.current?.();

    // Don't initialize the editor bridge unless edit mode is active
    if (!enabledRef.current) return;

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
      onContentChange: (selector, element, html) => {
        const pageFile = resolvePageFile(pagePathRef.current);
        pendingEditsRef.current.set(selector, {
          page: pageFile,
          selector,
          type: 'text',
          content: html,
        });
        scheduleSave();

        // CMS reverse-sync: if this element is bound to a sol field, update CMS state
        const solField = (element as HTMLElement)?.dataset?.solField;
        if (solField) {
          const plainText = (element as HTMLElement).textContent ?? '';
          window.dispatchEvent(new CustomEvent('sol:field-changed', {
            detail: { field: solField, value: plainText },
          }));
        }
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

  // Re-init editor bridge when enabled transitions to true
  useEffect(() => {
    if (!enabled) {
      // Tear down the editor bridge when disabled
      cleanupRef.current?.();
      cleanupRef.current = null;
      setSelection(null);
      setToolbarPos(p => ({ ...p, visible: false }));
      return;
    }
    // Re-init if iframe is already loaded
    const iframe = iframeRef.current;
    try {
      if (iframe?.contentDocument?.readyState === 'complete' && iframe.contentDocument.body) {
        handleLoad();
      }
    } catch { /* cross-origin */ }
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // When page changes: flush previous edits, then navigate the SPA without a full reload
  useEffect(() => {
    flushEdits();
    pendingEditsRef.current.clear();

    // For hash-based SPAs, navigate by setting location.hash instead of reloading
    if (navigateTo?.startsWith('#')) {
      try {
        const iframe = iframeRef.current;
        if (iframe?.contentWindow) {
          iframe.contentWindow.location.hash = navigateTo.slice(1); // strip leading '#'
        }
      } catch { /* cross-origin or not yet loaded — iframe src handles it */ }
    }
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
