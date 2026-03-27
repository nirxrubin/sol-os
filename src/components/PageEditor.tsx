import { useState, useRef, useCallback, useEffect } from 'react';
import { FileText, Image, X } from 'lucide-react';
import type { Page } from '../data/types';
import { pageContents } from '../data/pageContent';
import type { EditableElement, PageSection, PageContent } from '../data/pageContent';

interface PageEditorProps {
  page: Page;
}

const seoStatusConfig: Record<
  Page['seoStatus'],
  { label: string; bg: string; text: string }
> = {
  complete: {
    label: 'SEO: complete',
    bg: 'bg-status-green/20',
    text: 'text-status-green',
  },
  partial: {
    label: 'SEO: partial',
    bg: 'bg-status-orange/20',
    text: 'text-status-orange',
  },
  missing: {
    label: 'SEO: missing',
    bg: 'bg-status-red/20',
    text: 'text-status-red',
  },
};

// Tag label for the hover indicator
function getElementLabel(el: EditableElement): string {
  if (el.type === 'image') return 'IMG';
  if (el.type === 'button') return 'BTN';
  if (el.type === 'link') return 'A';
  if (el.type === 'stat') return 'STAT';
  if (el.type === 'form-field') return 'INPUT';
  if (el.type === 'logo-grid') return 'GRID';
  if (el.tag) return el.tag.toUpperCase();
  return 'DIV';
}

export default function PageEditor({ page }: PageEditorProps) {
  const seo = seoStatusConfig[page.seoStatus];
  const pageContent = pageContents.find((pc: PageContent) => pc.pageId === page.id);

  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [hoveredElementId, setHoveredElementId] = useState<string | null>(null);
  const [editableContent, setEditableContent] = useState<Record<string, string>>({});

  const canvasRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLElement | null>(null);

  // Deselect when clicking on the canvas background
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).dataset?.canvas === 'bg') {
      setSelectedElementId(null);
    }
  }, []);

  // Handle clicking outside canvas to deselect
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (canvasRef.current && !canvasRef.current.contains(e.target as Node)) {
        setSelectedElementId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const getContent = (el: EditableElement): string => {
    return editableContent[el.id] ?? el.content ?? '';
  };

  const handleContentChange = (id: string, value: string) => {
    setEditableContent((prev) => ({ ...prev, [id]: value }));
  };

  const isTextEditable = (el: EditableElement) =>
    el.type === 'heading' || el.type === 'text' || el.type === 'stat' || el.type === 'link' || el.type === 'button';

  const isImageElement = (el: EditableElement) => el.type === 'image';

  // Element wrapper with hover/selection states
  const ElementWrapper = ({ el, children, className = '' }: { el: EditableElement; children: React.ReactNode; className?: string }) => {
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
        onClick={(e) => {
          e.stopPropagation();
          setSelectedElementId(el.id);
        }}
      >
        {/* Hover label */}
        {(isHovered || isSelected) && (
          <span
            className="pointer-events-none absolute z-20 select-none px-1.5 py-0.5 text-[10px] font-bold leading-none tracking-wide"
            style={{
              top: '-18px',
              left: '-2px',
              backgroundColor: 'var(--color-accent)',
              color: '#1C1917',
              borderRadius: '2px 2px 0 0',
            }}
          >
            {getElementLabel(el)}
          </span>
        )}
        {children}
      </div>
    );
  };

  // Text editing toolbar (appears above selected text elements)
  const TextToolbar = () => {
    if (!selectedElementId) return null;
    const section = pageContent?.sections.find((s: PageSection) =>
      s.elements.some((e: EditableElement) => e.id === selectedElementId)
    );
    const el = section?.elements.find((e: EditableElement) => e.id === selectedElementId);
    if (!el || !isTextEditable(el)) return null;

    return (
      <div
        className="pointer-events-auto absolute z-50 flex items-center gap-0.5 rounded-full px-1.5 py-1 shadow-xl"
        style={{
          backgroundColor: '#1C1917',
          color: '#fff',
          top: '-44px',
          left: '50%',
          transform: 'translateX(-50%)',
          whiteSpace: 'nowrap',
        }}
      >
        {[
          { label: 'B', title: 'Bold', style: 'font-bold' },
          { label: 'I', title: 'Italic', style: 'italic' },
          { label: <span>X<sup className="text-[8px]">2</sup></span>, title: 'Superscript', style: '' },
          { label: <span>X<sub className="text-[8px]">2</sub></span>, title: 'Subscript', style: '' },
          { label: '</>', title: 'Code', style: 'font-mono text-[11px]' },
          { label: <span className="text-[13px]">&#128279;</span>, title: 'Link', style: '' },
          { label: <span className="text-[12px]">&#9998;</span>, title: 'Highlight', style: '' },
          { label: <span className="text-[11px]">x<span className="font-bold">A</span></span>, title: 'Clear formatting', style: '' },
        ].map((btn, i) => (
          <button
            key={i}
            className={`flex h-7 w-7 items-center justify-center rounded-md text-xs text-white/90 transition-colors hover:bg-white/10 hover:text-white ${btn.style}`}
            title={btn.title}
            onMouseDown={(e) => e.preventDefault()}
          >
            {btn.label}
          </button>
        ))}
      </div>
    );
  };

  // Image settings panel (appears below selected image elements)
  const ImagePanel = ({ el }: { el: EditableElement }) => {
    if (selectedElementId !== el.id || !isImageElement(el)) return null;

    return (
      <div
        className="absolute z-50 mt-2 w-72 rounded-lg p-4 shadow-2xl"
        style={{ backgroundColor: '#1C1917', color: '#FAF9F7', top: '100%', left: '0' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image size={14} className="text-gray-400" />
            <span className="text-sm font-medium">{el.content}</span>
          </div>
          <button
            className="text-gray-500 hover:text-gray-300"
            onClick={() => setSelectedElementId(null)}
          >
            <X size={14} />
          </button>
        </div>

        <div className="mb-3 flex items-center gap-3 text-xs text-gray-400">
          <span>{el.width} x {el.height}</span>
          <span className="text-gray-600">|</span>
          <span>{Math.round(((el.width ?? 400) * (el.height ?? 300)) / 4000)}KB</span>
        </div>

        <button
          className="mb-3 w-full rounded-md px-3 py-2 text-sm font-medium transition-colors"
          style={{ backgroundColor: 'var(--color-accent)', color: '#1C1917' }}
        >
          Replace Image...
        </button>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">HiDPI (2x)</span>
            <div
              className="h-5 w-9 rounded-full p-0.5"
              style={{ backgroundColor: 'var(--color-accent)' }}
            >
              <div className="h-4 w-4 rounded-full bg-white shadow-sm" style={{ marginLeft: '14px' }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Width</label>
              <input
                type="text"
                defaultValue={el.width ?? ''}
                className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Height</label>
              <input
                type="text"
                defaultValue={el.height ?? ''}
                className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Alt Text</label>
            <input
              type="text"
              defaultValue={el.alt ?? ''}
              className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Loading</label>
            <select className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200">
              <option>Lazy: loads on scroll</option>
              <option>Eager: loads immediately</option>
            </select>
          </div>

          <button className="mt-1 text-xs font-medium" style={{ color: 'var(--color-accent)' }}>
            Show All Settings &rarr;
          </button>
        </div>
      </div>
    );
  };

  // Editable text element
  const EditableText = ({ el, className = '' }: { el: EditableElement; className?: string }) => {
    const isSelected = selectedElementId === el.id;

    return (
      <ElementWrapper el={el} className="relative">
        {isSelected && <TextToolbar />}
        <div
          ref={isSelected ? (node) => { selectedRef.current = node; } : undefined}
          contentEditable={isSelected}
          suppressContentEditableWarning
          className={`outline-none ${className}`}
          onBlur={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? '')}
        >
          {getContent(el)}
        </div>
      </ElementWrapper>
    );
  };

  // Image element
  const ImageElement = ({ el, className = '' }: { el: EditableElement; className?: string }) => {
    return (
      <ElementWrapper el={el} className="relative">
        <div
          className={`flex items-center justify-center overflow-hidden rounded-md ${className}`}
          style={{
            backgroundColor: '#E8E4DF',
            width: '100%',
            aspectRatio: el.width && el.height ? `${el.width}/${el.height}` : '16/9',
            maxHeight: el.height ? Math.min(el.height, 400) : 400,
          }}
        >
          <div className="flex flex-col items-center gap-2 text-gray-400">
            <Image size={24} />
            <span className="text-xs">{el.content}</span>
            {el.width && el.height && (
              <span className="text-[10px] text-gray-400/60">{el.width} x {el.height}</span>
            )}
          </div>
        </div>
        <ImagePanel el={el} />
      </ElementWrapper>
    );
  };

  // Button element
  const ButtonElement = ({ el, variant = 'primary' }: { el: EditableElement; variant?: 'primary' | 'nav' }) => {
    const isSelected = selectedElementId === el.id;

    return (
      <ElementWrapper el={el}>
        {isSelected && <TextToolbar />}
        <button
          contentEditable={isSelected}
          suppressContentEditableWarning
          className={`inline-block rounded-md px-5 py-2.5 text-sm font-medium outline-none transition-colors ${
            variant === 'nav'
              ? 'bg-gray-900 text-white'
              : 'text-white'
          }`}
          style={variant === 'primary' ? { backgroundColor: '#1C1917', color: '#fff' } : undefined}
          onBlur={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? '')}
          onClick={(e) => e.preventDefault()}
        >
          {getContent(el)}
        </button>
      </ElementWrapper>
    );
  };

  // --- Section Renderers ---

  const renderNav = (section: PageSection) => {
    const logo = section.elements.find((e: EditableElement) => e.type === 'heading');
    const links = section.elements.filter((e: EditableElement) => e.type === 'link');
    const ctaBtn = section.elements.find((e: EditableElement) => e.type === 'button');

    return (
      <div className="flex items-center justify-between border-b border-gray-200 px-8 py-4" style={{ backgroundColor: '#fff' }}>
        {logo && (
          <EditableText el={logo} className="text-lg font-bold text-gray-900" />
        )}
        <div className="flex items-center gap-6">
          {links.map((link: EditableElement) => (
            <EditableText key={link.id} el={link} className="cursor-pointer text-sm text-gray-600 hover:text-gray-900" />
          ))}
          {ctaBtn && <ButtonElement el={ctaBtn} variant="nav" />}
        </div>
      </div>
    );
  };

  const renderHero = (section: PageSection) => {
    const h1 = section.elements.find((e: EditableElement) => e.tag === 'h1');
    const sub = section.elements.find((e: EditableElement) => e.type === 'text' && e.tag === 'p');
    const img = section.elements.find((e: EditableElement) => e.type === 'image');
    const btn = section.elements.find((e: EditableElement) => e.type === 'button');

    return (
      <div className="px-8 py-16" style={{ backgroundColor: '#FAFAF8' }}>
        <div className="mx-auto max-w-3xl text-center">
          {h1 && (
            <EditableText
              el={h1}
              className="mb-6 text-5xl font-bold leading-tight tracking-tight text-gray-900"
            />
          )}
          {sub && (
            <EditableText
              el={sub}
              className="mx-auto mb-8 max-w-xl text-lg leading-relaxed text-gray-500"
            />
          )}
          {btn && (
            <div className="mb-10">
              <ButtonElement el={btn} />
            </div>
          )}
        </div>
        {img && (
          <div className="mx-auto max-w-4xl">
            <ImageElement el={img} />
          </div>
        )}
      </div>
    );
  };

  const renderLogos = (section: PageSection) => {
    const heading = section.elements.find((e: EditableElement) => e.type === 'heading');
    const logos = section.elements.filter((e: EditableElement) => e.type === 'image');

    return (
      <div className="border-y border-gray-100 px-8 py-12" style={{ backgroundColor: '#fff' }}>
        <div className="mx-auto max-w-4xl text-center">
          {heading && (
            <EditableText
              el={heading}
              className="mb-8 text-sm font-medium uppercase tracking-widest text-gray-400"
            />
          )}
          <div className="flex items-center justify-center gap-10">
            {logos.map((logo: EditableElement) => (
              <ElementWrapper key={logo.id} el={logo}>
                <div
                  className="flex items-center justify-center rounded-md"
                  style={{ backgroundColor: '#F5F3F0', width: 100, height: 36 }}
                >
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
    const heading = section.elements.find((e: EditableElement) => e.tag === 'h2');
    const sub = section.elements.find((e: EditableElement) => e.type === 'text' && e.tag === 'p' && !e.id.includes('feat-1') && !e.id.includes('feat-2') && !e.id.includes('feat-3'));
    // Group features: title + desc pairs
    const featureElements = section.elements.filter(
      (e: EditableElement) => (e.tag === 'h3' || (e.type === 'text' && (e.id.includes('feat-1-desc') || e.id.includes('feat-2-desc') || e.id.includes('feat-3-desc'))))
    );
    const features: { title: EditableElement; desc: EditableElement }[] = [];
    const titles = section.elements.filter((e: EditableElement) => e.tag === 'h3');
    const descs = section.elements.filter((e: EditableElement) => e.type === 'text' && e.tag === 'p' && e.id.includes('-desc'));
    for (let i = 0; i < titles.length; i++) {
      if (descs[i]) features.push({ title: titles[i], desc: descs[i] });
    }

    return (
      <div className="px-8 py-16" style={{ backgroundColor: '#FAFAF8' }}>
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            {heading && (
              <EditableText
                el={heading}
                className="mb-3 text-3xl font-bold text-gray-900"
              />
            )}
            {sub && (
              <EditableText
                el={sub}
                className="text-base text-gray-500"
              />
            )}
          </div>
          <div className="grid grid-cols-3 gap-8">
            {features.map((feat, i) => (
              <div key={i} className="rounded-lg border border-gray-100 bg-white p-6">
                <EditableText
                  el={feat.title}
                  className="mb-2 text-lg font-semibold text-gray-900"
                />
                <EditableText
                  el={feat.desc}
                  className="text-sm leading-relaxed text-gray-500"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderStats = (section: PageSection) => {
    const stats = section.elements.filter((e: EditableElement) => e.type === 'stat');
    const labels = section.elements.filter((e: EditableElement) => e.type === 'text');

    return (
      <div className="border-y border-gray-100 px-8 py-14" style={{ backgroundColor: '#fff' }}>
        <div className="mx-auto flex max-w-3xl items-center justify-around">
          {stats.map((stat: EditableElement, i: number) => (
            <div key={stat.id} className="text-center">
              <EditableText
                el={stat}
                className="mb-1 text-4xl font-bold text-gray-900"
              />
              {labels[i] && (
                <EditableText
                  el={labels[i]}
                  className="text-sm text-gray-500"
                />
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderTestimonials = (section: PageSection) => {
    const heading = section.elements.find((e: EditableElement) => e.tag === 'h2');
    const quotes = section.elements.filter((e: EditableElement) => e.id.includes('quote'));
    const authors = section.elements.filter((e: EditableElement) => e.id.includes('author'));

    return (
      <div className="px-8 py-16" style={{ backgroundColor: '#FAFAF8' }}>
        <div className="mx-auto max-w-5xl">
          {heading && (
            <div className="mb-12 text-center">
              <EditableText
                el={heading}
                className="text-3xl font-bold text-gray-900"
              />
            </div>
          )}
          <div className="grid grid-cols-3 gap-6">
            {quotes.map((quote: EditableElement, i: number) => (
              <div key={quote.id} className="rounded-lg border border-gray-100 bg-white p-6">
                <EditableText
                  el={quote}
                  className="mb-4 text-sm italic leading-relaxed text-gray-700"
                />
                {authors[i] && (
                  <EditableText
                    el={authors[i]}
                    className="text-xs font-medium text-gray-400"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderCTA = (section: PageSection) => {
    const heading = section.elements.find((e: EditableElement) => e.type === 'heading');
    const sub = section.elements.find((e: EditableElement) => e.type === 'text');
    const btn = section.elements.find((e: EditableElement) => e.type === 'button');

    return (
      <div className="px-8 py-20" style={{ backgroundColor: '#1C1917' }}>
        <div className="mx-auto max-w-2xl text-center">
          {heading && (
            <EditableText
              el={heading}
              className="mb-4 text-3xl font-bold text-white"
            />
          )}
          {sub && (
            <EditableText
              el={sub}
              className="mb-8 text-base text-gray-400"
            />
          )}
          {btn && (
            <ElementWrapper el={btn}>
              <button
                contentEditable={selectedElementId === btn.id}
                suppressContentEditableWarning
                className="inline-block rounded-md px-6 py-3 text-sm font-medium outline-none"
                style={{ backgroundColor: 'var(--color-accent)', color: '#1C1917' }}
                onBlur={(e) => handleContentChange(btn.id, e.currentTarget.textContent ?? '')}
                onClick={(e) => e.preventDefault()}
              >
                {getContent(btn)}
              </button>
              {selectedElementId === btn.id && <TextToolbar />}
            </ElementWrapper>
          )}
        </div>
      </div>
    );
  };

  const renderFooter = (section: PageSection) => {
    const logo = section.elements.find((e: EditableElement) => e.type === 'heading');
    const desc = section.elements.find((e: EditableElement) => e.type === 'text' && e.tag === 'p');
    const links = section.elements.filter((e: EditableElement) => e.type === 'link');
    const copy = section.elements.find((e: EditableElement) => e.tag === 'span');

    return (
      <div className="border-t border-gray-200 px-8 py-10" style={{ backgroundColor: '#FAFAF8' }}>
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 flex items-start justify-between">
            <div className="max-w-xs">
              {logo && (
                <EditableText el={logo} className="mb-2 text-base font-bold text-gray-900" />
              )}
              {desc && (
                <EditableText el={desc} className="text-sm text-gray-500" />
              )}
            </div>
            {links.length > 0 && (
              <div className="flex gap-8">
                <div className="flex flex-col gap-2">
                  {links.slice(0, Math.ceil(links.length / 2)).map((link: EditableElement) => (
                    <EditableText key={link.id} el={link} className="text-sm text-gray-500 hover:text-gray-900" />
                  ))}
                </div>
                <div className="flex flex-col gap-2">
                  {links.slice(Math.ceil(links.length / 2)).map((link: EditableElement) => (
                    <EditableText key={link.id} el={link} className="text-sm text-gray-500 hover:text-gray-900" />
                  ))}
                </div>
              </div>
            )}
          </div>
          {copy && (
            <div className="border-t border-gray-200 pt-6">
              <EditableText el={copy} className="text-xs text-gray-400" />
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderBlogGrid = (section: PageSection) => {
    const heading = section.elements.find((e: EditableElement) => e.tag === 'h1');
    const sub = section.elements.find((e: EditableElement) => e.type === 'text' && e.tag === 'p' && !e.id.includes('excerpt'));
    const images = section.elements.filter((e: EditableElement) => e.type === 'image');
    const titles = section.elements.filter((e: EditableElement) => e.tag === 'h3');
    const excerpts = section.elements.filter((e: EditableElement) => e.id.includes('excerpt'));

    return (
      <div className="px-8 py-16" style={{ backgroundColor: '#FAFAF8' }}>
        <div className="mx-auto max-w-5xl">
          <div className="mb-12">
            {heading && (
              <EditableText el={heading} className="mb-3 text-4xl font-bold text-gray-900" />
            )}
            {sub && (
              <EditableText el={sub} className="text-base text-gray-500" />
            )}
          </div>
          <div className="grid grid-cols-3 gap-8">
            {images.map((img: EditableElement, i: number) => (
              <div key={img.id} className="overflow-hidden rounded-lg border border-gray-100 bg-white">
                <ImageElement el={img} className="!rounded-none" />
                <div className="p-5">
                  {titles[i] && (
                    <EditableText el={titles[i]} className="mb-2 text-base font-semibold text-gray-900" />
                  )}
                  {excerpts[i] && (
                    <EditableText el={excerpts[i]} className="text-sm leading-relaxed text-gray-500" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderArticle = (section: PageSection) => {
    const title = section.elements.find((e: EditableElement) => e.tag === 'h1');
    const meta = section.elements.find((e: EditableElement) => e.tag === 'span');
    const heroImg = section.elements.find((e: EditableElement) => e.type === 'image');
    const h2s = section.elements.filter((e: EditableElement) => e.tag === 'h2');
    const paragraphs = section.elements.filter((e: EditableElement) => e.type === 'text' && e.tag === 'p');

    return (
      <div className="px-8 py-16" style={{ backgroundColor: '#fff' }}>
        <div className="mx-auto max-w-2xl">
          {title && (
            <EditableText el={title} className="mb-4 text-4xl font-bold leading-tight text-gray-900" />
          )}
          {meta && (
            <EditableText el={meta} className="mb-8 text-sm text-gray-400" />
          )}
          {heroImg && (
            <div className="mb-10">
              <ImageElement el={heroImg} />
            </div>
          )}
          <div className="space-y-6">
            {paragraphs.map((p: EditableElement, i: number) => (
              <div key={p.id}>
                {h2s[i - (heroImg ? 0 : 0)] && i > 0 && (
                  <EditableText
                    el={h2s.find((h: EditableElement) => {
                      const pIdx = paragraphs.indexOf(p);
                      // Find the h2 that comes before this paragraph by checking element order
                      const elIdx = section.elements.indexOf(h);
                      const pElIdx = section.elements.indexOf(p);
                      return elIdx < pElIdx && elIdx > (pIdx > 0 ? section.elements.indexOf(paragraphs[pIdx - 1]) : 0);
                    }) ?? h2s[0]}
                    className="mb-4 mt-8 text-2xl font-bold text-gray-900"
                  />
                )}
                <EditableText el={p} className="text-base leading-relaxed text-gray-600" />
              </div>
            ))}
            {/* Render any h2s that weren't placed inline */}
          </div>
        </div>
      </div>
    );
  };

  const renderTeamGrid = (section: PageSection) => {
    const images = section.elements.filter((e: EditableElement) => e.type === 'image');
    const names = section.elements.filter((e: EditableElement) => e.tag === 'h3');
    const roles = section.elements.filter((e: EditableElement) => e.type === 'text' && e.tag === 'p');

    return (
      <div className="px-8 py-16" style={{ backgroundColor: '#FAFAF8' }}>
        <div className="mx-auto max-w-5xl">
          <div className="grid grid-cols-3 gap-8">
            {images.map((img: EditableElement, i: number) => (
              <div key={img.id} className="text-center">
                <div className="mx-auto mb-4 h-40 w-40 overflow-hidden rounded-full">
                  <ElementWrapper el={img}>
                    <div
                      className="flex h-40 w-40 items-center justify-center rounded-full"
                      style={{ backgroundColor: '#E8E4DF' }}
                    >
                      <div className="flex flex-col items-center gap-1 text-gray-400">
                        <Image size={20} />
                        <span className="text-[9px]">{img.content}</span>
                      </div>
                    </div>
                  </ElementWrapper>
                </div>
                {names[i] && (
                  <EditableText el={names[i]} className="mb-1 text-base font-semibold text-gray-900" />
                )}
                {roles[i] && (
                  <EditableText el={roles[i]} className="text-sm text-gray-500" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderContactForm = (section: PageSection) => {
    const fields = section.elements.filter((e: EditableElement) => e.type === 'form-field');
    const submitBtn = section.elements.find((e: EditableElement) => e.type === 'button');

    return (
      <div className="px-8 py-16" style={{ backgroundColor: '#fff' }}>
        <div className="mx-auto max-w-lg">
          <div className="space-y-5">
            {fields.map((field: EditableElement) => (
              <ElementWrapper key={field.id} el={field}>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    {getContent(field)}
                  </label>
                  {field.id.includes('message') ? (
                    <textarea
                      placeholder={field.placeholder}
                      rows={4}
                      className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400"
                    />
                  ) : field.id.includes('budget') ? (
                    <select className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm text-gray-400 outline-none focus:border-gray-400">
                      <option>{field.placeholder}</option>
                    </select>
                  ) : (
                    <input
                      type={field.id.includes('email') ? 'email' : 'text'}
                      placeholder={field.placeholder}
                      className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400"
                    />
                  )}
                </div>
              </ElementWrapper>
            ))}
            {submitBtn && <ButtonElement el={submitBtn} />}
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

  return (
    <div className="flex h-full w-full flex-col p-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-bg-elevated">
          <FileText size={18} className="text-text-secondary" />
        </div>
        <h1 className="font-heading text-2xl font-semibold text-text">{page.name}</h1>
        <span
          className={`ml-2 rounded-full px-3 py-1 text-xs font-medium ${seo.bg} ${seo.text}`}
        >
          {seo.label}
        </span>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-hidden rounded-lg border border-border bg-bg-card">
        <div
          ref={canvasRef}
          className="h-full overflow-y-auto"
          onClick={handleCanvasClick}
          data-canvas="bg"
          style={{ backgroundColor: '#E8E4DF' }}
        >
          <div className="mx-auto my-6 max-w-5xl" data-canvas="bg">
            {/* Page preview container */}
            <div
              className="overflow-hidden rounded-lg shadow-xl"
              style={{
                backgroundColor: '#FAFAF8',
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                boxShadow: '0 4px 24px -4px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
              }}
            >
              {pageContent ? (
                pageContent.sections.map((section: PageSection) => (
                  <div key={section.id} className="relative">
                    {/* Section name label on hover */}
                    <div className="group relative">
                      <div className="pointer-events-none absolute -left-0 top-0 z-30 opacity-0 transition-opacity group-hover:opacity-100">
                        <span
                          className="inline-block rounded-br-md px-2 py-1 text-[10px] font-medium"
                          style={{ backgroundColor: 'var(--color-accent)', color: '#1C1917' }}
                        >
                          {section.name}
                        </span>
                      </div>
                      {renderSection(section)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-24">
                  <FileText size={48} className="mb-6 text-gray-300" />
                  <p className="text-sm text-gray-400">
                    No content data available for this page.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
