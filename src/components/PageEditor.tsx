import { FileText } from 'lucide-react';
import type { Page } from '../data/types';

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

export default function PageEditor({ page }: PageEditorProps) {
  const seo = seoStatusConfig[page.seoStatus];

  return (
    <div className="flex h-full w-full flex-col p-8">
      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
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

      {/* Placeholder card */}
      <div className="flex flex-1 items-center justify-center">
        <div className="flex w-full max-w-2xl flex-col items-center rounded-2xl border border-border bg-bg-card p-12">
          <FileText size={48} className="mb-6 text-text-muted" />
          <h2 className="font-heading mb-2 text-lg font-medium text-text">
            {page.name} page editor
          </h2>
          <p className="max-w-md text-center text-sm leading-relaxed text-text-secondary">
            Visual on-canvas editor will appear here, showing the live layout of
            this page ready to edit.
          </p>
        </div>
      </div>
    </div>
  );
}
