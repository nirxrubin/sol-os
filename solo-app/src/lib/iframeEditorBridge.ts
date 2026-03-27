/**
 * Iframe Editor Bridge
 *
 * Injects hover/select overlays and contentEditable support into a same-origin
 * iframe. Generates stable CSS selectors for edit persistence.
 */

const EDITABLE_SELECTOR =
  'h1, h2, h3, h4, h5, h6, p, span, a, button, li, blockquote, figcaption, td, th, label, img';

const TAG_LABELS: Record<string, string> = {
  H1: 'H1', H2: 'H2', H3: 'H3', H4: 'H4', H5: 'H5', H6: 'H6',
  P: 'P', SPAN: 'SPAN', A: 'A', BUTTON: 'BTN', LI: 'LI',
  BLOCKQUOTE: 'QUOTE', FIGCAPTION: 'CAPTION', TD: 'TD', TH: 'TH',
  LABEL: 'LABEL', IMG: 'IMG',
};

function getTagLabel(el: Element): string {
  return TAG_LABELS[el.tagName] ?? el.tagName;
}

function isTextElement(el: Element): boolean {
  return el.tagName !== 'IMG';
}

// ─── CSS Selector Generation ──────────────────────────────────────
// Generate a unique, stable CSS selector path for any element.

export function getCSSSelector(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current !== current.ownerDocument.documentElement) {
    let selector = current.tagName.toLowerCase();

    // Use id if available and unique
    if (current.id && !current.id.startsWith('solo-')) {
      selector += `#${CSS.escape(current.id)}`;
      parts.unshift(selector);
      break; // ID is unique, no need to go further up
    }

    // Add nth-of-type for disambiguation among siblings
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (s) => s.tagName === current!.tagName,
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }

    parts.unshift(selector);
    current = current.parentElement;
  }

  return parts.join(' > ');
}

// ─── Types ────────────────────────────────────────────────────────

export interface CanvasEdit {
  selector: string;
  type: 'text' | 'image';
  content: string;  // innerHTML for text, src for image
  alt?: string;
}

export interface IframeSelection {
  element: Element;
  selector: string;
  tagName: string;
  rect: DOMRect;
  isImage: boolean;
  isText: boolean;
}

export interface IframeBridgeCallbacks {
  onHover: (info: { tagName: string; rect: DOMRect } | null) => void;
  onSelect: (info: IframeSelection | null) => void;
  onContentChange: (selector: string, element: Element, html: string) => void;
  onImageChange: (selector: string, src: string, alt?: string) => void;
  onRectUpdate: (rect: DOMRect) => void;
}

// ─── Apply saved edits to the iframe DOM ──────────────────────────

export function applyEdits(doc: Document, edits: CanvasEdit[]): void {
  for (const edit of edits) {
    try {
      const el = doc.querySelector(edit.selector);
      if (!el) continue;
      if (edit.type === 'text') {
        (el as HTMLElement).innerHTML = edit.content;
      } else if (edit.type === 'image') {
        (el as HTMLImageElement).src = edit.content;
        if (edit.alt !== undefined) (el as HTMLImageElement).alt = edit.alt;
      }
    } catch { /* skip invalid selector */ }
  }
}

// ─── Apply CMS changes to iframe DOM by matching content ──────────

export interface CMSBinding {
  contentTypeId: string;
  itemId: string;
  fieldName: string;
  selector: string;
}

export function applyCMSData(
  doc: Document,
  bindings: CMSBinding[],
  getFieldValue: (contentTypeId: string, itemId: string, fieldName: string) => string | undefined,
): void {
  for (const binding of bindings) {
    const value = getFieldValue(binding.contentTypeId, binding.itemId, binding.fieldName);
    if (value === undefined) continue;
    try {
      const el = doc.querySelector(binding.selector);
      if (!el) continue;
      if (el.tagName === 'IMG') {
        (el as HTMLImageElement).src = value;
      } else {
        el.textContent = value;
      }
    } catch { /* skip */ }
  }
}

// ─── Main initializer ─────────────────────────────────────────────

export function initIframeEditor(
  iframeDoc: Document,
  callbacks: IframeBridgeCallbacks,
): () => void {
  const { onHover, onSelect, onContentChange, onImageChange, onRectUpdate } = callbacks;

  // ── Inject styles ──────────────────────────────────────────────
  const style = iframeDoc.createElement('style');
  style.id = 'solo-editor-styles';
  style.textContent = `
    .solo-hover {
      outline: 1px dashed #D4A843 !important;
      outline-offset: 2px !important;
      cursor: pointer !important;
    }
    .solo-selected {
      outline: 2px solid #D4A843 !important;
      outline-offset: 2px !important;
    }
    .solo-tag-label {
      position: absolute;
      z-index: 99999;
      pointer-events: none;
      padding: 1px 6px;
      font-size: 10px;
      font-weight: 700;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      letter-spacing: 0.05em;
      line-height: 1.4;
      color: #1C1917;
      background: #D4A843;
      border-radius: 2px 2px 0 0;
      white-space: nowrap;
    }
    [contenteditable="true"]:focus {
      outline: 2px solid #D4A843 !important;
      outline-offset: 2px !important;
    }
  `;
  iframeDoc.head.appendChild(style);

  // ── Tag label element (reused) ─────────────────────────────────
  const tagLabel = iframeDoc.createElement('div');
  tagLabel.className = 'solo-tag-label';
  tagLabel.style.display = 'none';
  iframeDoc.body.appendChild(tagLabel);

  // ── State ──────────────────────────────────────────────────────
  let hoveredEl: Element | null = null;
  let selectedEl: Element | null = null;

  function positionTagLabel(el: Element) {
    const rect = el.getBoundingClientRect();
    const scrollX = iframeDoc.defaultView?.scrollX ?? 0;
    const scrollY = iframeDoc.defaultView?.scrollY ?? 0;
    tagLabel.style.display = 'block';
    tagLabel.style.left = `${rect.left + scrollX - 2}px`;
    tagLabel.style.top = `${rect.top + scrollY - 20}px`;
    tagLabel.textContent = getTagLabel(el);
  }

  function clearHover() {
    if (hoveredEl) {
      hoveredEl.classList.remove('solo-hover');
      hoveredEl = null;
    }
    if (!selectedEl) {
      tagLabel.style.display = 'none';
    }
    onHover(null);
  }

  function clearSelection() {
    if (selectedEl) {
      selectedEl.classList.remove('solo-selected');
      if (isTextElement(selectedEl) && selectedEl.getAttribute('contenteditable') === 'true') {
        selectedEl.removeAttribute('contenteditable');
      }
      selectedEl = null;
    }
    tagLabel.style.display = 'none';
    onSelect(null);
  }

  // ── Event handlers ─────────────────────────────────────────────
  function handleMouseOver(e: Event) {
    const target = (e.target as Element).closest?.(EDITABLE_SELECTOR);
    if (!target || target === selectedEl) {
      if (!target && hoveredEl) clearHover();
      return;
    }
    if (hoveredEl && hoveredEl !== target) {
      hoveredEl.classList.remove('solo-hover');
    }
    hoveredEl = target;
    hoveredEl.classList.add('solo-hover');
    if (!selectedEl) {
      positionTagLabel(hoveredEl);
    }
    onHover({ tagName: getTagLabel(target), rect: target.getBoundingClientRect() });
  }

  function handleMouseOut(e: Event) {
    const target = (e.target as Element).closest?.(EDITABLE_SELECTOR);
    if (target === hoveredEl) {
      clearHover();
    }
  }

  function handleClick(e: Event) {
    const target = (e.target as Element).closest?.(EDITABLE_SELECTOR);
    if (!target) {
      clearSelection();
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    // Deselect previous
    if (selectedEl && selectedEl !== target) {
      selectedEl.classList.remove('solo-selected');
      if (isTextElement(selectedEl)) {
        selectedEl.removeAttribute('contenteditable');
      }
    }

    // Clear hover on the selected element
    if (hoveredEl === target) {
      hoveredEl.classList.remove('solo-hover');
      hoveredEl = null;
    }

    selectedEl = target;
    selectedEl.classList.add('solo-selected');
    positionTagLabel(selectedEl);

    const isImg = target.tagName === 'IMG';
    const isTxt = isTextElement(target);

    if (isTxt) {
      selectedEl.setAttribute('contenteditable', 'true');
      (selectedEl as HTMLElement).focus();
    }

    onSelect({
      element: target,
      selector: getCSSSelector(target),
      tagName: getTagLabel(target),
      rect: target.getBoundingClientRect(),
      isImage: isImg,
      isText: isTxt,
    });
  }

  function handleInput(e: Event) {
    const target = e.target as Element;
    if (target === selectedEl && isTextElement(target)) {
      onContentChange(getCSSSelector(target), target, (target as HTMLElement).innerHTML);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      clearSelection();
    }
  }

  function handleScroll() {
    if (selectedEl) {
      const rect = selectedEl.getBoundingClientRect();
      positionTagLabel(selectedEl);
      onRectUpdate(rect);
    }
  }

  // ── Attach ─────────────────────────────────────────────────────
  iframeDoc.addEventListener('mouseover', handleMouseOver, true);
  iframeDoc.addEventListener('mouseout', handleMouseOut, true);
  iframeDoc.addEventListener('click', handleClick, true);
  iframeDoc.addEventListener('input', handleInput, true);
  iframeDoc.addEventListener('keydown', handleKeyDown, true);
  iframeDoc.defaultView?.addEventListener('scroll', handleScroll, { passive: true });

  // ── Public API (called from parent via direct reference) ───────
  (iframeDoc as any).__soloEditorBridge = {
    execCommand(command: string, value?: string) {
      iframeDoc.execCommand(command, false, value);
    },
    deselect() {
      clearSelection();
    },
    replaceImage(src: string, alt?: string) {
      if (selectedEl && selectedEl.tagName === 'IMG') {
        const selector = getCSSSelector(selectedEl);
        (selectedEl as HTMLImageElement).src = src;
        if (alt !== undefined) (selectedEl as HTMLImageElement).alt = alt;
        onImageChange(selector, src, alt);
      }
    },
    getSelectedElement(): Element | null {
      return selectedEl;
    },
  };

  // ── Cleanup ────────────────────────────────────────────────────
  return () => {
    iframeDoc.removeEventListener('mouseover', handleMouseOver, true);
    iframeDoc.removeEventListener('mouseout', handleMouseOut, true);
    iframeDoc.removeEventListener('click', handleClick, true);
    iframeDoc.removeEventListener('input', handleInput, true);
    iframeDoc.removeEventListener('keydown', handleKeyDown, true);
    iframeDoc.defaultView?.removeEventListener('scroll', handleScroll);
    style.remove();
    tagLabel.remove();
    delete (iframeDoc as any).__soloEditorBridge;
  };
}
