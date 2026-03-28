import { useState, useRef, useCallback, useEffect } from 'react';
import { Monitor, Tablet, Smartphone, Image, X, Bold, Italic, Link2, Strikethrough, Code, Highlighter, RemoveFormatting } from 'lucide-react';
import { Database } from 'lucide-react';
import type { Page, ContentType, ContentItem } from '../data/types';
import { pageContents } from '../data/pageContent';
import type { EditableElement, PageSection, PageContent } from '../data/pageContent';
import { useIframeEditor } from '../hooks/useIframeEditor';

interface PageEditorProps {
  page: Page;
  contentTypes?: ContentType[];
  onOpenCMSItem?: (contentTypeId: string, itemId: string) => void;
  isImported?: boolean;
}

const seoStatusConfig: Record<
  Page['seoStatus'],
  { label: string; bg: string; text: string }
> = {
  complete: { label: 'SEO: complete', bg: 'bg-status-green/20', text: 'text-status-green' },
  partial: { label: 'SEO: partial', bg: 'bg-status-orange/20', text: 'text-status-orange' },
  missing: { label: 'SEO: missing', bg: 'bg-status-red/20', text: 'text-status-red' },
};

function formatCMSDate(raw: string): string {
  try {
    return new Date(raw).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return raw; }
}

function getElementLabel(el: EditableElement): string {
  if (el.type === 'image') return 'IMG';
  if (el.type === 'button') return 'BTN';
  if (el.type === 'link') return 'A';
  if (el.type === 'stat') return 'STAT';
  if (el.type === 'form-field') return 'INPUT';
  if (el.tag) return el.tag.toUpperCase();
  return 'DIV';
}

// ─── Uncontrolled contentEditable component ──────────────────────
// This avoids React's reconciliation resetting text while the user edits.
function ContentEditable({
  html,
  onChange,
  className,
  editable,
  elRef,
}: {
  html: string;
  onChange: (html: string) => void;
  className?: string;
  editable: boolean;
  elRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const innerRef = elRef ?? ref;
  const lastHtml = useRef(html);

  // Only set innerHTML when html prop changes AND the element is not focused
  useEffect(() => {
    if (innerRef.current && lastHtml.current !== html) {
      // Don't overwrite if user is currently editing this element
      if (document.activeElement !== innerRef.current) {
        innerRef.current.innerHTML = html;
      }
      lastHtml.current = html;
    }
  }, [html, innerRef]);

  // Set initial content
  useEffect(() => {
    if (innerRef.current && !innerRef.current.innerHTML) {
      innerRef.current.innerHTML = html;
      lastHtml.current = html;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleInput = useCallback(() => {
    if (innerRef.current) {
      const newHtml = innerRef.current.innerHTML;
      lastHtml.current = newHtml;
      onChange(newHtml);
    }
  }, [onChange, innerRef]);

  return (
    <div
      ref={innerRef}
      contentEditable={editable}
      suppressContentEditableWarning
      className={`outline-none ${className ?? ''}`}
      style={editable ? { minHeight: '1em', cursor: 'text' } : undefined}
      onInput={handleInput}
      onBlur={handleInput}
    />
  );
}

// ─── Element Wrapper (top-level) ──────────────────────────────────
function ElementWrapper({
  el,
  children,
  className = '',
  hoveredElementId,
  selectedElementId,
  setHoveredElementId,
  setSelectedElementId,
}: {
  el: EditableElement;
  children: React.ReactNode;
  className?: string;
  hoveredElementId: string | null;
  selectedElementId: string | null;
  setHoveredElementId: (id: string | null) => void;
  setSelectedElementId: (id: string | null) => void;
}) {
  const isHovered = hoveredElementId === el.id;
  const isSelected = selectedElementId === el.id;

  return (
    <div
      className={`relative ${className}`}
      style={{
        outline: isSelected
          ? '2px solid var(--color-accent)'
          : isHovered
            ? '1px solid var(--color-accent)'
            : '1px solid transparent',
        outlineOffset: '2px',
        borderRadius: '2px',
        transition: 'outline-color 0.1s ease',
      }}
      onMouseEnter={() => setHoveredElementId(el.id)}
      onMouseLeave={() => { if (hoveredElementId === el.id) setHoveredElementId(null); }}
      onClick={(e) => { e.stopPropagation(); setSelectedElementId(el.id); }}
    >
      {(isHovered || isSelected) && (
        <span
          className="pointer-events-none absolute z-20 select-none px-1.5 py-0.5 text-[10px] font-bold leading-none tracking-wide"
          style={{ top: '-18px', left: '-2px', backgroundColor: 'var(--color-accent)', color: '#1C1917', borderRadius: '2px 2px 0 0' }}
        >
          {getElementLabel(el)}
        </span>
      )}
      {children}
    </div>
  );
}

// ─── Text Toolbar (top-level) ─────────────────────────────────────
function TextToolbar({
  execFormat,
  handleAddLink,
}: {
  execFormat: (command: string, value?: string) => void;
  handleAddLink: () => void;
}) {
  const buttons = [
    { icon: <Bold size={14} />, title: 'Bold', action: () => execFormat('bold') },
    { icon: <Italic size={14} />, title: 'Italic', action: () => execFormat('italic') },
    { icon: <Strikethrough size={14} />, title: 'Strikethrough', action: () => execFormat('strikeThrough') },
    { icon: <Code size={14} />, title: 'Code', action: () => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        const range = sel.getRangeAt(0);
        const code = document.createElement('code');
        code.style.cssText = 'background:#f1f0ee;padding:1px 4px;border-radius:3px;font-family:monospace;font-size:0.9em;';
        range.surroundContents(code);
      }
    }},
    { icon: <Link2 size={14} />, title: 'Add Link', action: handleAddLink },
    { icon: <Highlighter size={14} />, title: 'Highlight', action: () => execFormat('hiliteColor', '#FEF08A') },
    { icon: <RemoveFormatting size={14} />, title: 'Clear formatting', action: () => execFormat('removeFormat') },
  ];

  return (
    <div
      className="pointer-events-auto absolute z-50 flex items-center gap-0.5 rounded-lg px-1.5 py-1 shadow-xl"
      style={{ backgroundColor: '#1C1917', color: '#fff', top: '-44px', left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {buttons.map((btn, i) => (
        <button
          key={i}
          className="flex h-7 w-7 items-center justify-center rounded-md text-white/90 transition-colors hover:bg-white/15 hover:text-white"
          title={btn.title}
          onMouseDown={(e) => { e.preventDefault(); btn.action(); }}
        >
          {btn.icon}
        </button>
      ))}
    </div>
  );
}

// ─── Image Panel (top-level) ──────────────────────────────────────
function ImagePanel({
  el,
  selectedElementId,
  setSelectedElementId,
  imageOverrides,
  altTextDraft,
  setAltTextDraft,
  handleImageReplace,
  handleAltTextChange,
}: {
  el: EditableElement;
  selectedElementId: string | null;
  setSelectedElementId: (id: string | null) => void;
  imageOverrides: Record<string, { src: string; alt?: string }>;
  altTextDraft: string;
  setAltTextDraft: (v: string) => void;
  handleImageReplace: (id: string) => void;
  handleAltTextChange: (id: string, alt: string) => void;
}) {
  if (selectedElementId !== el.id || el.type !== 'image') return null;
  const override = imageOverrides[el.id];
  const currentAlt = override?.alt ?? el.alt ?? '';

  return (
    <div
      className="absolute z-50 mt-2 w-72 rounded-lg p-4 shadow-2xl"
      style={{ backgroundColor: '#1C1917', color: '#FAF9F7', top: '100%', left: '0' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Image size={14} className="text-gray-400" />
          <span className="text-sm font-medium">{override?.src ? 'Custom image' : (el.alt || el.content)}</span>
        </div>
        <button className="text-gray-500 hover:text-gray-300" onClick={() => setSelectedElementId(null)}>
          <X size={14} />
        </button>
      </div>

      <button
        className="mb-3 w-full rounded-md px-3 py-2 text-sm font-medium transition-colors"
        style={{ backgroundColor: 'var(--color-accent)', color: '#1C1917' }}
        onClick={() => handleImageReplace(el.id)}
      >
        Replace Image...
      </button>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Alt Text</label>
          <input
            type="text"
            value={altTextDraft || currentAlt}
            onChange={(e) => setAltTextDraft(e.target.value)}
            onBlur={() => { if (altTextDraft) { handleAltTextChange(el.id, altTextDraft); setAltTextDraft(''); } }}
            className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-gray-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Width</label>
            <input type="text" defaultValue={el.width ?? 'Auto'} className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Height</label>
            <input type="text" defaultValue={el.height ?? 'Auto'} className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Loading</label>
          <select className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200">
            <option>Lazy: loads on scroll</option>
            <option>Eager: loads immediately</option>
          </select>
        </div>
      </div>
    </div>
  );
}

// ─── Shared props interface for inner components ──────────────────
interface EditorElementProps {
  hoveredElementId: string | null;
  selectedElementId: string | null;
  setHoveredElementId: (id: string | null) => void;
  setSelectedElementId: (id: string | null) => void;
  getContent: (el: EditableElement) => string;
  handleContentChange: (id: string, html: string) => void;
  selectedRef: React.RefObject<HTMLDivElement | null>;
  execFormat: (command: string, value?: string) => void;
  handleAddLink: () => void;
  imageOverrides: Record<string, { src: string; alt?: string }>;
  altTextDraft: string;
  setAltTextDraft: (v: string) => void;
  handleImageReplace: (id: string) => void;
  handleAltTextChange: (id: string, alt: string) => void;
}

// ─── Editable Text (top-level) ────────────────────────────────────
function EditableText({ el, className = '', ...props }: { el: EditableElement; className?: string } & EditorElementProps) {
  const isSelected = props.selectedElementId === el.id;

  return (
    <ElementWrapper
      el={el}
      className="relative"
      hoveredElementId={props.hoveredElementId}
      selectedElementId={props.selectedElementId}
      setHoveredElementId={props.setHoveredElementId}
      setSelectedElementId={props.setSelectedElementId}
    >
      {isSelected && <TextToolbar execFormat={props.execFormat} handleAddLink={props.handleAddLink} />}
      <ContentEditable
        elRef={isSelected ? props.selectedRef : undefined}
        html={props.getContent(el)}
        onChange={(html) => props.handleContentChange(el.id, html)}
        editable={isSelected}
        className={className}
      />
    </ElementWrapper>
  );
}

// ─── Image Element (top-level) ────────────────────────────────────
function ImageElement({ el, className = '', ...props }: { el: EditableElement; className?: string } & EditorElementProps) {
  const override = props.imageOverrides[el.id];
  const hasSrc = override?.src || el.src;
  const imgSrc = override?.src || el.src;
  const imgAlt = override?.alt ?? el.alt ?? el.content ?? '';

  return (
    <ElementWrapper
      el={el}
      className="relative"
      hoveredElementId={props.hoveredElementId}
      selectedElementId={props.selectedElementId}
      setHoveredElementId={props.setHoveredElementId}
      setSelectedElementId={props.setSelectedElementId}
    >
      {hasSrc ? (
        <img
          src={imgSrc}
          alt={imgAlt}
          className={`w-full object-cover ${className}`}
          style={{ aspectRatio: el.width && el.height ? `${el.width}/${el.height}` : '16/9', maxHeight: el.height ? Math.min(el.height, 400) : 400 }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
        />
      ) : null}
      <div
        className={`flex items-center justify-center overflow-hidden ${hasSrc ? 'hidden' : ''} ${className}`}
        style={{ backgroundColor: '#E8E4DF', width: '100%', aspectRatio: el.width && el.height ? `${el.width}/${el.height}` : '16/9', maxHeight: el.height ? Math.min(el.height, 400) : 400 }}
      >
        <div className="flex flex-col items-center gap-2 text-gray-400">
          <Image size={24} />
          <span className="text-xs">{el.alt || el.content}</span>
        </div>
      </div>
      <ImagePanel
        el={el}
        selectedElementId={props.selectedElementId}
        setSelectedElementId={props.setSelectedElementId}
        imageOverrides={props.imageOverrides}
        altTextDraft={props.altTextDraft}
        setAltTextDraft={props.setAltTextDraft}
        handleImageReplace={props.handleImageReplace}
        handleAltTextChange={props.handleAltTextChange}
      />
    </ElementWrapper>
  );
}

// ─── Button Element (top-level) ───────────────────────────────────
function ButtonElement({ el, variant = 'primary', ...props }: { el: EditableElement; variant?: 'primary' | 'nav' } & EditorElementProps) {
  const isSelected = props.selectedElementId === el.id;

  return (
    <ElementWrapper
      el={el}
      hoveredElementId={props.hoveredElementId}
      selectedElementId={props.selectedElementId}
      setHoveredElementId={props.setHoveredElementId}
      setSelectedElementId={props.setSelectedElementId}
    >
      {isSelected && <TextToolbar execFormat={props.execFormat} handleAddLink={props.handleAddLink} />}
      <ContentEditable
        elRef={isSelected ? props.selectedRef : undefined}
        html={props.getContent(el)}
        onChange={(html) => props.handleContentChange(el.id, html)}
        editable={isSelected}
        className={`inline-block rounded-md px-5 py-2.5 text-sm font-medium ${
          variant === 'nav' ? 'bg-gray-900 text-white' : 'text-white'
        }`}
      />
    </ElementWrapper>
  );
}

// ─── Helper to get grid cols class based on breakpoint ────────────
function gridColsClass(desktopCols: number, breakpoint: 'desktop' | 'tablet' | 'mobile'): string {
  if (breakpoint === 'mobile') return 'grid-cols-1';
  if (breakpoint === 'tablet') return desktopCols >= 3 ? 'grid-cols-2' : `grid-cols-${desktopCols}`;
  return `grid-cols-${desktopCols}`;
}

// ─── Main Component ───────────────────────────────────────────────

export default function PageEditor({ page, contentTypes, onOpenCMSItem, isImported }: PageEditorProps) {
  const seo = seoStatusConfig[page.seoStatus];
  const pageContent = pageContents.find((pc: PageContent) => pc.pageId === page.id);

  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [hoveredElementId, setHoveredElementId] = useState<string | null>(null);
  const [editableContent, setEditableContent] = useState<Record<string, string>>({});
  const [imageOverrides, setImageOverrides] = useState<Record<string, { src: string; alt?: string }>>({});
  const [altTextDraft, setAltTextDraft] = useState('');
  const [breakpoint, setBreakpoint] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');

  const canvasRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeImageIdRef = useRef<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Iframe editing hook (only active when isImported)
  const iframePage = isImported ? page.path : undefined;
  const iframeEditor = useIframeEditor(iframeRef, iframePage, isImported ? contentTypes : undefined);

  // Sync CMS changes → source files + iframe when contentTypes change
  const prevContentTypesRef = useRef(contentTypes);
  useEffect(() => {
    if (isImported && contentTypes !== prevContentTypesRef.current) {
      const prev = prevContentTypesRef.current;
      prevContentTypesRef.current = contentTypes;
      if (prev) {
        iframeEditor.syncCMSToCanvas(contentTypes ?? [], prev);
      }
    }
  }, [contentTypes, isImported]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to top & clear selection when page changes
  useEffect(() => {
    canvasRef.current?.scrollTo(0, 0);
    setSelectedElementId(null);
  }, [page.id]);

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).dataset?.canvas === 'bg') {
      setSelectedElementId(null);
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (canvasRef.current && !canvasRef.current.contains(e.target as Node)) {
        setSelectedElementId(null);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedElementId(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  const getContent = useCallback((el: EditableElement): string => {
    return editableContent[el.id] ?? el.content ?? '';
  }, [editableContent]);

  const handleContentChange = useCallback((id: string, html: string) => {
    setEditableContent((prev) => ({ ...prev, [id]: html }));
  }, []);

  const isTextEditable = (el: EditableElement) =>
    el.type === 'heading' || el.type === 'text' || el.type === 'stat' || el.type === 'link' || el.type === 'button';

  const isImageElement = (el: EditableElement) => el.type === 'image';

  // Formatting commands
  const execFormat = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
    selectedRef.current?.focus();
  }, []);

  const handleAddLink = useCallback(() => {
    const url = prompt('Enter URL:');
    if (url) execFormat('createLink', url);
  }, [execFormat]);

  const handleImageReplace = useCallback((elementId: string) => {
    activeImageIdRef.current = elementId;
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeImageIdRef.current) return;
    const url = URL.createObjectURL(file);
    setImageOverrides((prev) => ({
      ...prev,
      [activeImageIdRef.current!]: { src: url, alt: prev[activeImageIdRef.current!]?.alt ?? file.name },
    }));
    e.target.value = '';
  };

  const handleAltTextChange = useCallback((elementId: string, alt: string) => {
    setImageOverrides((prev) => ({
      ...prev,
      [elementId]: { src: prev[elementId]?.src ?? '', alt },
    }));
  }, []);

  // Shared props to pass to extracted components
  const editorProps: EditorElementProps = {
    hoveredElementId,
    selectedElementId,
    setHoveredElementId,
    setSelectedElementId,
    getContent,
    handleContentChange,
    selectedRef,
    execFormat,
    handleAddLink,
    imageOverrides,
    altTextDraft,
    setAltTextDraft,
    handleImageReplace,
    handleAltTextChange,
  };

  // ─── CMS Helpers ──────────────────────────────────────────────

  const getCMSItems = (typeId: string): ContentItem[] => {
    const ct = contentTypes?.find(c => c.id === typeId);
    return ct?.items.filter(i => i.status === 'published') ?? [];
  };

  const CMSCardWrapper = ({ contentTypeId, itemId, children, className = '' }: {
    contentTypeId: string; itemId: string; children: React.ReactNode; className?: string;
  }) => (
    <div
      className={`group relative cursor-pointer ${className}`}
      onClick={(e) => { e.stopPropagation(); onOpenCMSItem?.(contentTypeId, itemId); }}
    >
      <div className="pointer-events-none absolute -top-2 right-2 z-20 flex items-center gap-1 rounded-full bg-accent/90 px-2 py-0.5 text-[9px] font-bold text-brand-950 opacity-0 transition-opacity group-hover:opacity-100">
        <Database size={9} />
        CMS
      </div>
      {children}
    </div>
  );

  // ─── Section Renderers ─────────────────────────────────────────

  const renderNav = (section: PageSection) => {
    const logo = section.elements.find((e) => e.type === 'heading' || (e.type === 'text' && e.tag === 'span'));
    const links = section.elements.filter((e) => e.type === 'link');
    const ctaBtn = section.elements.find((e) => e.type === 'button');

    return (
      <div className={`flex items-center justify-between border-b border-gray-200 px-8 py-4 ${breakpoint === 'mobile' ? 'flex-col gap-4' : ''}`} style={{ backgroundColor: '#fff' }}>
        {logo && <EditableText el={logo} className="text-lg font-bold text-gray-900" {...editorProps} />}
        <div className={`flex items-center gap-6 ${breakpoint === 'mobile' ? 'flex-col gap-3' : ''}`}>
          {breakpoint === 'mobile' ? (
            // Show only CTA on mobile
            <>
              {ctaBtn && (
                <ElementWrapper
                  el={ctaBtn}
                  hoveredElementId={hoveredElementId}
                  selectedElementId={selectedElementId}
                  setHoveredElementId={setHoveredElementId}
                  setSelectedElementId={setSelectedElementId}
                >
                  {selectedElementId === ctaBtn.id && <TextToolbar execFormat={execFormat} handleAddLink={handleAddLink} />}
                  <ContentEditable
                    elRef={selectedElementId === ctaBtn.id ? selectedRef : undefined}
                    html={getContent(ctaBtn)}
                    onChange={(html) => handleContentChange(ctaBtn.id, html)}
                    editable={selectedElementId === ctaBtn.id}
                    className="inline-block rounded-md bg-gray-900 px-5 py-2.5 text-sm font-medium text-white"
                  />
                </ElementWrapper>
              )}
            </>
          ) : (
            <>
              {links.map((link) => (
                <EditableText key={link.id} el={link} className="cursor-pointer text-sm text-gray-600 hover:text-gray-900" {...editorProps} />
              ))}
              {ctaBtn && (
                <ElementWrapper
                  el={ctaBtn}
                  hoveredElementId={hoveredElementId}
                  selectedElementId={selectedElementId}
                  setHoveredElementId={setHoveredElementId}
                  setSelectedElementId={setSelectedElementId}
                >
                  {selectedElementId === ctaBtn.id && <TextToolbar execFormat={execFormat} handleAddLink={handleAddLink} />}
                  <ContentEditable
                    elRef={selectedElementId === ctaBtn.id ? selectedRef : undefined}
                    html={getContent(ctaBtn)}
                    onChange={(html) => handleContentChange(ctaBtn.id, html)}
                    editable={selectedElementId === ctaBtn.id}
                    className="inline-block rounded-md bg-gray-900 px-5 py-2.5 text-sm font-medium text-white"
                  />
                </ElementWrapper>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  const renderHero = (section: PageSection) => {
    const h1 = section.elements.find((e) => e.tag === 'h1');
    const sub = section.elements.find((e) => e.type === 'text' && e.tag === 'p');
    const img = section.elements.find((e) => e.type === 'image');
    const btn = section.elements.find((e) => e.type === 'button');

    return (
      <div className="px-8 py-16" style={{ backgroundColor: '#FAFAF8' }}>
        <div className="mx-auto max-w-3xl text-center">
          {h1 && <EditableText el={h1} className={`mb-6 font-bold leading-tight tracking-tight text-gray-900 ${breakpoint === 'mobile' ? 'text-3xl' : 'text-5xl'}`} {...editorProps} />}
          {sub && <EditableText el={sub} className={`mx-auto mb-8 max-w-xl leading-relaxed text-gray-500 ${breakpoint === 'mobile' ? 'text-base' : 'text-lg'}`} {...editorProps} />}
          {btn && <div className="mb-10"><ButtonElement el={btn} {...editorProps} /></div>}
        </div>
        {img && <div className="mx-auto max-w-4xl"><ImageElement el={img} {...editorProps} /></div>}
      </div>
    );
  };

  const renderLogos = (section: PageSection) => {
    const heading = section.elements.find((e) => e.type === 'heading' || e.type === 'text');
    const logos = section.elements.filter((e) => e.type === 'image');

    return (
      <div className="border-y border-gray-100 px-8 py-12" style={{ backgroundColor: '#fff' }}>
        <div className="mx-auto max-w-4xl text-center">
          {heading && <EditableText el={heading} className="mb-8 text-sm font-medium uppercase tracking-widest text-gray-400" {...editorProps} />}
          <div className={`flex items-center justify-center ${breakpoint === 'mobile' ? 'flex-wrap gap-6' : 'gap-10'}`}>
            {logos.map((logo) => (
              <ElementWrapper
                key={logo.id}
                el={logo}
                hoveredElementId={hoveredElementId}
                selectedElementId={selectedElementId}
                setHoveredElementId={setHoveredElementId}
                setSelectedElementId={setSelectedElementId}
              >
                <div className="flex items-center justify-center rounded-md" style={{ backgroundColor: '#F5F3F0', width: 100, height: 36 }}>
                  <span className="text-[10px] text-gray-400">{logo.alt?.replace(' logo', '')}</span>
                </div>
              </ElementWrapper>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderFeatures = (section: PageSection) => {
    const heading = section.elements.find((e) => e.tag === 'h2');
    const sub = section.elements.find((e) => e.type === 'text' && e.tag === 'p' && !e.id.includes('-desc'));
    const titles = section.elements.filter((e) => e.tag === 'h3');
    const descs = section.elements.filter((e) => e.type === 'text' && e.tag === 'p' && e.id.includes('-desc'));
    const features: { title: EditableElement; desc: EditableElement }[] = [];
    for (let i = 0; i < titles.length; i++) {
      if (descs[i]) features.push({ title: titles[i], desc: descs[i] });
    }

    return (
      <div className="px-8 py-16" style={{ backgroundColor: '#FAFAF8' }}>
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            {heading && <EditableText el={heading} className="mb-3 text-3xl font-bold text-gray-900" {...editorProps} />}
            {sub && <EditableText el={sub} className="text-base text-gray-500" {...editorProps} />}
          </div>
          <div className={`grid ${gridColsClass(3, breakpoint)} gap-8`}>
            {features.map((feat, i) => (
              <div key={i} className="rounded-lg border border-gray-100 bg-white p-6">
                <EditableText el={feat.title} className="mb-2 text-lg font-semibold text-gray-900" {...editorProps} />
                <EditableText el={feat.desc} className="text-sm leading-relaxed text-gray-500" {...editorProps} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderStats = (section: PageSection) => {
    const stats = section.elements.filter((e) => e.type === 'stat');
    const labels = section.elements.filter((e) => e.type === 'text');

    return (
      <div className="border-y border-gray-100 px-8 py-14" style={{ backgroundColor: '#fff' }}>
        <div className={`mx-auto max-w-3xl ${breakpoint === 'mobile' ? 'flex flex-col items-center gap-8' : 'flex items-center justify-around'}`}>
          {stats.map((stat, i) => (
            <div key={stat.id} className="text-center">
              <EditableText el={stat} className="mb-1 text-4xl font-bold text-gray-900" {...editorProps} />
              {labels[i] && <EditableText el={labels[i]} className="text-sm text-gray-500" {...editorProps} />}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderTestimonials = (section: PageSection) => {
    const heading = section.elements.find((e) => e.tag === 'h2');
    const cmsItems = getCMSItems('ct-testimonials');

    // If CMS data available, render from it
    if (cmsItems.length > 0) {
      return (
        <div className="px-8 py-16" style={{ backgroundColor: '#FAFAF8' }}>
          <div className="mx-auto max-w-5xl">
            {heading && <div className="mb-12 text-center"><EditableText el={heading} className="text-3xl font-bold text-gray-900" {...editorProps} /></div>}
            <div className={`grid ${gridColsClass(3, breakpoint)} gap-6`}>
              {cmsItems.slice(0, 3).map((item) => (
                <CMSCardWrapper key={item.id} contentTypeId="ct-testimonials" itemId={item.id}>
                  <div className="rounded-lg border border-gray-100 bg-white p-6 transition-colors hover:border-accent/40">
                    <p className="mb-4 text-sm italic leading-relaxed text-gray-700">
                      &ldquo;{item.data.quote as string}&rdquo;
                    </p>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-500">
                        {(item.data.name as string)?.[0]}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-gray-900">{item.data.name as string}</div>
                        <div className="text-xs text-gray-400">{item.data.role as string}, {item.data.company as string}</div>
                      </div>
                    </div>
                  </div>
                </CMSCardWrapper>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Fallback to static page content
    const quotes = section.elements.filter((e) => e.id.includes('quote'));
    const avatars = section.elements.filter((e) => e.id.includes('avatar'));
    const names = section.elements.filter((e) => e.id.includes('-name'));
    const roles = section.elements.filter((e) => e.id.includes('-role'));

    return (
      <div className="px-8 py-16" style={{ backgroundColor: '#FAFAF8' }}>
        <div className="mx-auto max-w-5xl">
          {heading && <div className="mb-12 text-center"><EditableText el={heading} className="text-3xl font-bold text-gray-900" {...editorProps} /></div>}
          <div className={`grid ${gridColsClass(3, breakpoint)} gap-6`}>
            {quotes.map((quote, i) => (
              <div key={quote.id} className="rounded-lg border border-gray-100 bg-white p-6">
                <EditableText el={quote} className="mb-4 text-sm italic leading-relaxed text-gray-700" {...editorProps} />
                <div className="flex items-center gap-3">
                  {avatars[i] && (
                    <div className="h-8 w-8 overflow-hidden rounded-full">
                      <ImageElement el={avatars[i]} className="h-8 w-8 rounded-full" {...editorProps} />
                    </div>
                  )}
                  <div>
                    {names[i] && <EditableText el={names[i]} className="text-xs font-semibold text-gray-900" {...editorProps} />}
                    {roles[i] && <EditableText el={roles[i]} className="text-xs text-gray-400" {...editorProps} />}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderCTA = (section: PageSection) => {
    const heading = section.elements.find((e) => e.type === 'heading');
    const sub = section.elements.find((e) => e.type === 'text');
    const btn = section.elements.find((e) => e.type === 'button');

    return (
      <div className="px-8 py-20" style={{ backgroundColor: '#1C1917' }}>
        <div className="mx-auto max-w-2xl text-center">
          {heading && <EditableText el={heading} className="mb-4 text-3xl font-bold text-white" {...editorProps} />}
          {sub && <EditableText el={sub} className="mb-8 text-base text-gray-400" {...editorProps} />}
          {btn && (
            <ElementWrapper
              el={btn}
              hoveredElementId={hoveredElementId}
              selectedElementId={selectedElementId}
              setHoveredElementId={setHoveredElementId}
              setSelectedElementId={setSelectedElementId}
            >
              {selectedElementId === btn.id && <TextToolbar execFormat={execFormat} handleAddLink={handleAddLink} />}
              <ContentEditable
                elRef={selectedElementId === btn.id ? selectedRef : undefined}
                html={getContent(btn)}
                onChange={(html) => handleContentChange(btn.id, html)}
                editable={selectedElementId === btn.id}
                className="inline-block rounded-md px-6 py-3 text-sm font-medium outline-none"
                // accent bg applied via style
              />
            </ElementWrapper>
          )}
        </div>
      </div>
    );
  };

  const renderFooter = (section: PageSection) => {
    const logo = section.elements.find((e) => e.type === 'heading' || (e.type === 'text' && e.tag === 'span' && !e.id.includes('copy')));
    const desc = section.elements.find((e) => e.type === 'text' && e.tag === 'p');
    const links = section.elements.filter((e) => e.type === 'link');
    const copy = section.elements.find((e) => e.id.includes('copy'));

    return (
      <div className="border-t border-gray-200 px-8 py-10" style={{ backgroundColor: '#FAFAF8' }}>
        <div className="mx-auto max-w-5xl">
          <div className={`mb-8 ${breakpoint === 'mobile' ? 'flex flex-col gap-6' : 'flex items-start justify-between'}`}>
            <div className="max-w-xs">
              {logo && <EditableText el={logo} className="mb-2 text-base font-bold text-gray-900" {...editorProps} />}
              {desc && <EditableText el={desc} className="text-sm text-gray-500" {...editorProps} />}
            </div>
            {links.length > 0 && (
              <div className={`flex gap-8 ${breakpoint === 'mobile' ? 'flex-col gap-2' : ''}`}>
                <div className="flex flex-col gap-2">
                  {links.slice(0, Math.ceil(links.length / 2)).map((link) => (
                    <EditableText key={link.id} el={link} className="text-sm text-gray-500 hover:text-gray-900" {...editorProps} />
                  ))}
                </div>
                <div className="flex flex-col gap-2">
                  {links.slice(Math.ceil(links.length / 2)).map((link) => (
                    <EditableText key={link.id} el={link} className="text-sm text-gray-500 hover:text-gray-900" {...editorProps} />
                  ))}
                </div>
              </div>
            )}
          </div>
          {copy && <div className="border-t border-gray-200 pt-6"><EditableText el={copy} className="text-xs text-gray-400" {...editorProps} /></div>}
        </div>
      </div>
    );
  };

  const renderBlogGrid = (section: PageSection) => {
    const heading = section.elements.find((e) => e.tag === 'h1');
    const sub = section.elements.find((e) => e.type === 'text' && e.tag === 'p' && !e.id.includes('excerpt'));
    const cmsItems = getCMSItems('ct-blog');

    if (cmsItems.length > 0) {
      return (
        <div className="px-8 py-16" style={{ backgroundColor: '#FAFAF8' }}>
          <div className="mx-auto max-w-5xl">
            <div className="mb-12">
              {heading && <EditableText el={heading} className="mb-3 text-4xl font-bold text-gray-900" {...editorProps} />}
              {sub && <EditableText el={sub} className="text-base text-gray-500" {...editorProps} />}
            </div>
            <div className={`grid ${gridColsClass(3, breakpoint)} gap-8`}>
              {cmsItems.map((item) => (
                <CMSCardWrapper key={item.id} contentTypeId="ct-blog" itemId={item.id}>
                  <div className="overflow-hidden rounded-lg border border-gray-100 bg-white transition-colors hover:border-accent/40">
                    <div className="aspect-video bg-gray-100 flex items-center justify-center">
                      <span className="text-xs text-gray-400">{item.data.category as string}</span>
                    </div>
                    <div className="p-5">
                      <div className="mb-2 text-base font-semibold text-gray-900">{item.data.title as string}</div>
                      <div className="mb-3 text-sm leading-relaxed text-gray-500">{item.data.excerpt as string}</div>
                      <div className="text-xs text-gray-400">{item.data.author as string} &middot; {formatCMSDate(item.data.date as string)}</div>
                    </div>
                  </div>
                </CMSCardWrapper>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Fallback to static
    const images = section.elements.filter((e) => e.type === 'image');
    const titles = section.elements.filter((e) => e.tag === 'h3');
    const excerpts = section.elements.filter((e) => e.id.includes('excerpt'));

    return (
      <div className="px-8 py-16" style={{ backgroundColor: '#FAFAF8' }}>
        <div className="mx-auto max-w-5xl">
          <div className="mb-12">
            {heading && <EditableText el={heading} className="mb-3 text-4xl font-bold text-gray-900" {...editorProps} />}
            {sub && <EditableText el={sub} className="text-base text-gray-500" {...editorProps} />}
          </div>
          <div className={`grid ${gridColsClass(3, breakpoint)} gap-8`}>
            {images.map((img, i) => (
              <div key={img.id} className="overflow-hidden rounded-lg border border-gray-100 bg-white">
                <ImageElement el={img} className="!rounded-none" {...editorProps} />
                <div className="p-5">
                  {titles[i] && <EditableText el={titles[i]} className="mb-2 text-base font-semibold text-gray-900" {...editorProps} />}
                  {excerpts[i] && <EditableText el={excerpts[i]} className="text-sm leading-relaxed text-gray-500" {...editorProps} />}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderArticle = (section: PageSection) => {
    const title = section.elements.find((e) => e.tag === 'h1');
    const meta = section.elements.find((e) => e.tag === 'span');
    const heroImg = section.elements.find((e) => e.type === 'image');
    const paragraphs = section.elements.filter((e) => e.type === 'text' && e.tag === 'p');

    return (
      <div className="px-8 py-16" style={{ backgroundColor: '#fff' }}>
        <div className="mx-auto max-w-2xl">
          {title && <EditableText el={title} className="mb-4 text-4xl font-bold leading-tight text-gray-900" {...editorProps} />}
          {meta && <EditableText el={meta} className="mb-8 text-sm text-gray-400" {...editorProps} />}
          {heroImg && <div className="mb-10"><ImageElement el={heroImg} {...editorProps} /></div>}
          <div className="space-y-6">
            {paragraphs.map((p) => (
              <EditableText key={p.id} el={p} className="text-base leading-relaxed text-gray-600" {...editorProps} />
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderTeamGrid = (section: PageSection) => {
    const heading = section.elements.find((e) => e.tag === 'h2');
    const sub = section.elements.find((e) => e.type === 'text' && e.tag === 'p' && !e.id.includes('-role') && !e.id.includes('-bio') && !e.id.includes('member'));
    const cmsItems = getCMSItems('ct-team');

    if (cmsItems.length > 0) {
      return (
        <div className="px-8 py-16" style={{ backgroundColor: '#FAFAF8' }}>
          <div className="mx-auto max-w-5xl">
            {heading && (
              <div className="mb-12 text-center">
                <EditableText el={heading} className="mb-3 text-3xl font-bold text-gray-900" {...editorProps} />
                {sub && <EditableText el={sub} className="text-base text-gray-500" {...editorProps} />}
              </div>
            )}
            <div className={`grid ${gridColsClass(3, breakpoint)} gap-8`}>
              {cmsItems.map((item) => (
                <CMSCardWrapper key={item.id} contentTypeId="ct-team" itemId={item.id}>
                  <div className="text-center transition-colors">
                    <div className="mx-auto mb-4 flex h-40 w-40 items-center justify-center overflow-hidden rounded-full bg-gray-200">
                      <span className="text-3xl font-bold text-gray-400">{(item.data.name as string)?.[0]}</span>
                    </div>
                    <div className="mb-1 text-base font-semibold text-gray-900">{item.data.name as string}</div>
                    <div className="text-sm text-gray-500">{item.data.role as string}</div>
                    {item.data.bio && <div className="mt-2 text-xs leading-relaxed text-gray-400">{item.data.bio as string}</div>}
                  </div>
                </CMSCardWrapper>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Fallback to static
    const images = section.elements.filter((e) => e.type === 'image');
    const names = section.elements.filter((e) => e.tag === 'h3');
    const roles = section.elements.filter((e) => e.id.includes('-role'));
    const bios = section.elements.filter((e) => e.id.includes('-bio'));

    return (
      <div className="px-8 py-16" style={{ backgroundColor: '#FAFAF8' }}>
        <div className="mx-auto max-w-5xl">
          {heading && (
            <div className="mb-12 text-center">
              <EditableText el={heading} className="mb-3 text-3xl font-bold text-gray-900" {...editorProps} />
              {sub && <EditableText el={sub} className="text-base text-gray-500" {...editorProps} />}
            </div>
          )}
          <div className={`grid ${gridColsClass(3, breakpoint)} gap-8`}>
            {images.map((img, i) => (
              <div key={img.id} className="text-center">
                <div className="mx-auto mb-4 h-40 w-40 overflow-hidden rounded-full">
                  <ImageElement el={img} className="!rounded-full h-40 w-40" {...editorProps} />
                </div>
                {names[i] && <EditableText el={names[i]} className="mb-1 text-base font-semibold text-gray-900" {...editorProps} />}
                {roles[i] && <EditableText el={roles[i]} className="text-sm text-gray-500" {...editorProps} />}
                {bios[i] && <EditableText el={bios[i]} className="mt-2 text-xs leading-relaxed text-gray-400" {...editorProps} />}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderContactForm = (section: PageSection) => {
    const fields = section.elements.filter((e) => e.type === 'form-field');
    const submitBtn = section.elements.find((e) => e.type === 'button');

    return (
      <div className="px-8 py-16" style={{ backgroundColor: '#fff' }}>
        <div className="mx-auto max-w-lg">
          <div className="space-y-5">
            {fields.map((field) => (
              <ElementWrapper
                key={field.id}
                el={field}
                hoveredElementId={hoveredElementId}
                selectedElementId={selectedElementId}
                setHoveredElementId={setHoveredElementId}
                setSelectedElementId={setSelectedElementId}
              >
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">{getContent(field)}</label>
                  {field.id.includes('message') ? (
                    <textarea placeholder={field.placeholder} rows={4} className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400" />
                  ) : field.id.includes('budget') ? (
                    <select className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm text-gray-400 outline-none focus:border-gray-400">
                      <option>{field.placeholder}</option>
                    </select>
                  ) : (
                    <input type={field.id.includes('email') ? 'email' : 'text'} placeholder={field.placeholder} className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400" />
                  )}
                </div>
              </ElementWrapper>
            ))}
            {submitBtn && <ButtonElement el={submitBtn} {...editorProps} />}
          </div>
        </div>
      </div>
    );
  };

  const renderSection = (section: PageSection) => {
    switch (section.type) {
      case 'nav': return renderNav(section);
      case 'hero': return renderHero(section);
      case 'logos': return renderLogos(section);
      case 'features': return renderFeatures(section);
      case 'stats': return renderStats(section);
      case 'testimonials': return renderTestimonials(section);
      case 'cta': return renderCTA(section);
      case 'footer': return renderFooter(section);
      case 'blog-grid': return renderBlogGrid(section);
      case 'article': return renderArticle(section);
      case 'team-grid': return renderTeamGrid(section);
      case 'contact-form': return renderContactForm(section);
      default: return null;
    }
  };

  const canvasMaxWidth = breakpoint === 'tablet' ? '768px' : breakpoint === 'mobile' ? '375px' : '100%';

  return (
    <div className="flex h-full w-full flex-col">
      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelected} />

      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-bg-sidebar px-4 py-2">
        <div className="flex items-center gap-2">
          <h2 className="font-heading text-sm font-semibold text-text">{page.name}</h2>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${seo.bg} ${seo.text}`}>
            {seo.label}
          </span>
          {isImported && iframeEditor.saveStatus !== 'idle' && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-opacity ${
              iframeEditor.saveStatus === 'saving' ? 'bg-accent/10 text-accent' :
              iframeEditor.saveStatus === 'saved' ? 'bg-status-green/10 text-status-green' :
              'bg-status-red/10 text-status-red'
            }`}>
              {iframeEditor.saveStatus === 'saving' ? 'Saving...' :
               iframeEditor.saveStatus === 'saved' ? 'Saved' : 'Save error'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {([
            { key: 'desktop', icon: <Monitor size={15} />, label: 'Desktop' },
            { key: 'tablet', icon: <Tablet size={15} />, label: 'Tablet' },
            { key: 'mobile', icon: <Smartphone size={15} />, label: 'Mobile' },
          ] as const).map((bp) => (
            <button
              key={bp.key}
              onClick={() => setBreakpoint(bp.key)}
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                breakpoint === bp.key ? 'bg-accent/10 text-accent' : 'text-text-muted hover:text-text-secondary'
              }`}
              title={bp.label}
            >
              {bp.icon}
            </button>
          ))}
        </div>
      </div>

      {/* Canvas */}
      {isImported ? (
        /* ─── Iframe Preview Mode (imported projects) ─── */
        <div
          ref={canvasRef}
          className="relative flex-1 overflow-hidden"
          style={{ backgroundColor: breakpoint === 'desktop' ? '#fff' : '#E8E4DF' }}
          onClick={(e) => {
            // Click on canvas background → deselect
            if (e.target === e.currentTarget) iframeEditor.deselect();
          }}
        >
          <div
            className="mx-auto flex h-full transition-all duration-300"
            style={{ maxWidth: canvasMaxWidth }}
          >
            <iframe
              ref={iframeRef}
              src={`/preview${page.path === '/' ? '/index.html' : page.path.endsWith('.html') ? page.path : page.path + '.html'}`}
              className="h-full w-full border-0"
              style={{
                boxShadow: breakpoint !== 'desktop' ? '0 4px 24px -4px rgba(0,0,0,0.15)' : 'none',
                backgroundColor: '#fff',
              }}
              title={`Preview: ${page.name}`}
            />
          </div>

          {/* Floating Text Toolbar */}
          {iframeEditor.selection?.isText && iframeEditor.toolbarPos.visible && (
            <div
              className="pointer-events-auto fixed z-[9999] flex items-center gap-0.5 rounded-lg px-1.5 py-1 shadow-xl"
              style={{
                backgroundColor: '#1C1917',
                color: '#fff',
                top: `${Math.max(4, iframeEditor.toolbarPos.top - 44)}px`,
                left: `${iframeEditor.toolbarPos.left + iframeEditor.toolbarPos.width / 2}px`,
                transform: 'translateX(-50%)',
                whiteSpace: 'nowrap',
              }}
              onMouseDown={(e) => e.preventDefault()}
            >
              {[
                { icon: <Bold size={14} />, title: 'Bold', action: () => iframeEditor.execFormat('bold') },
                { icon: <Italic size={14} />, title: 'Italic', action: () => iframeEditor.execFormat('italic') },
                { icon: <Strikethrough size={14} />, title: 'Strikethrough', action: () => iframeEditor.execFormat('strikeThrough') },
                { icon: <Code size={14} />, title: 'Code', action: () => {
                  try {
                    const doc = iframeRef.current?.contentDocument;
                    const sel = doc?.getSelection();
                    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
                      const range = sel.getRangeAt(0);
                      const code = doc!.createElement('code');
                      code.style.cssText = 'background:#f1f0ee;padding:1px 4px;border-radius:3px;font-family:monospace;font-size:0.9em;';
                      range.surroundContents(code);
                    }
                  } catch { /* ignore */ }
                }},
                { icon: <Link2 size={14} />, title: 'Add Link', action: () => {
                  const url = prompt('Enter URL:');
                  if (url) iframeEditor.execFormat('createLink', url);
                }},
                { icon: <Highlighter size={14} />, title: 'Highlight', action: () => iframeEditor.execFormat('hiliteColor', '#FEF08A') },
                { icon: <RemoveFormatting size={14} />, title: 'Clear formatting', action: () => iframeEditor.execFormat('removeFormat') },
              ].map((btn, i) => (
                <button
                  key={i}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-white/90 transition-colors hover:bg-white/15 hover:text-white"
                  title={btn.title}
                  onMouseDown={(e) => { e.preventDefault(); btn.action(); }}
                >
                  {btn.icon}
                </button>
              ))}
            </div>
          )}

          {/* Floating Image Panel */}
          {iframeEditor.selection?.isImage && iframeEditor.toolbarPos.visible && (
            <div
              className="fixed z-[9999] w-72 rounded-lg p-4 shadow-2xl"
              style={{
                backgroundColor: '#1C1917',
                color: '#FAF9F7',
                top: `${Math.min(iframeEditor.toolbarPos.top + (iframeEditor.selection.rect.height ?? 0) + 8, window.innerHeight - 280)}px`,
                left: `${iframeEditor.toolbarPos.left}px`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Image size={14} className="text-gray-400" />
                  <span className="text-sm font-medium">
                    {(iframeEditor.selection.element as HTMLImageElement).alt || 'Image'}
                  </span>
                </div>
                <button className="text-gray-500 hover:text-gray-300" onClick={() => iframeEditor.deselect()}>
                  <X size={14} />
                </button>
              </div>

              <button
                className="mb-3 w-full rounded-md px-3 py-2 text-sm font-medium transition-colors"
                style={{ backgroundColor: '#D4A843', color: '#1C1917' }}
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*';
                  input.onchange = () => {
                    const file = input.files?.[0];
                    if (file) {
                      // Upload to server → get real project-relative path
                      iframeEditor.replaceImage(file);
                    }
                  };
                  input.click();
                }}
              >
                Replace Image...
              </button>

              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Alt Text</label>
                  <input
                    type="text"
                    defaultValue={(iframeEditor.selection.element as HTMLImageElement).alt ?? ''}
                    onBlur={(e) => {
                      const imgEl = iframeEditor.selection?.element as HTMLImageElement | undefined;
                      if (imgEl) imgEl.alt = e.target.value;
                    }}
                    className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-gray-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Width</label>
                    <input
                      type="text"
                      defaultValue={(iframeEditor.selection.element as HTMLImageElement).width || 'Auto'}
                      className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200"
                      readOnly
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Height</label>
                    <input
                      type="text"
                      defaultValue={(iframeEditor.selection.element as HTMLImageElement).height || 'Auto'}
                      className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200"
                      readOnly
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ─── Custom Renderer Mode (sample/demo) ─── */
        <div
          ref={canvasRef}
          className="flex-1 overflow-y-auto"
          onClick={handleCanvasClick}
          data-canvas="bg"
          style={{ backgroundColor: breakpoint === 'desktop' ? '#fff' : '#E8E4DF' }}
        >
          <div
            className="mx-auto transition-all duration-300"
            style={{ maxWidth: canvasMaxWidth, minHeight: '100%' }}
            data-canvas="bg"
          >
            <div
              style={{
                backgroundColor: '#FAFAF8',
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                boxShadow: breakpoint !== 'desktop' ? '0 4px 24px -4px rgba(0,0,0,0.15)' : 'none',
              }}
            >
              {pageContent ? (
                pageContent.sections.map((section: PageSection) => (
                  <div key={section.id} className="group relative">
                    <div className="pointer-events-none absolute left-0 top-0 z-30 opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="inline-block rounded-br-md px-2 py-1 text-[10px] font-medium" style={{ backgroundColor: 'var(--color-accent)', color: '#1C1917' }}>
                        {section.name}
                      </span>
                    </div>
                    {renderSection(section)}
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-24">
                  <Image size={48} className="mb-6 text-gray-300" />
                  <p className="text-sm text-gray-400">No content data available for this page.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
