import { useState, useCallback } from 'react';
import { Copy, ExternalLink, Globe, User, FileText, Database, CheckCircle2, Circle, AlertCircle, ChevronRight } from 'lucide-react';
import type { Project, ContentType, Page } from '../data/types';
import { API, PREVIEW_URL, IS_PROD } from '../lib/api';

interface ProjectDashboardProps {
  project: Project;
  generatorId?: string;
  deployUrl?: string;
  onDeployUrl?: (url: string) => void;
  onPreDeploy?: () => void;
}

type Tab = 'preview' | 'pages' | 'cms' | 'readiness';
type DeployStatus = 'idle' | 'loading' | 'live' | 'error';

// ─── Coming Soon Modal ────────────────────────────────────────────
function ComingSoonModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative rounded-2xl border border-border bg-bg-sidebar px-8 py-7 shadow-2xl max-w-sm w-full mx-4"
        onClick={e => e.stopPropagation()}
      >
        <p className="label-mono text-accent mb-2">Coming soon</p>
        <h3 className="text-lg font-semibold text-text leading-snug">We're working on it</h3>
        <p className="mt-2 text-sm text-text-secondary">This feature is on our roadmap. Stay tuned for updates.</p>
        <button
          onClick={onClose}
          className="mt-6 w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-brand-950 hover:bg-accent-hover transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }, [text]);
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-text-muted hover:text-text-secondary transition-colors"
    >
      <Copy className="h-3 w-3" />
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

// ─── Shared: section label ────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="label-mono text-text-muted mb-2">{children}</p>
  );
}

// ─── Shared: status badge with tint ──────────────────────────────
type TintColor = 'success' | 'warning' | 'danger' | 'info';

function TintBadge({ color, children }: { color: TintColor; children: React.ReactNode }) {
  return (
    <span
      className="label-mono px-2 py-0.5 rounded"
      style={{
        background: `var(--tint-${color})`,
        color: `var(--tint-${color}-text)`,
      }}
    >
      {children}
    </span>
  );
}

// ─── Tab: Pages ────────────────────────────────────────────────────
function PagesTab({ pages }: { pages: Page[] }) {
  if (pages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-muted">
        No pages detected
      </div>
    );
  }
  return (
    <div className="p-5 space-y-2">
      {pages.map(page => (
        <div key={page.id} className="flex items-center justify-between rounded-xl border border-border bg-bg-elevated px-4 py-3 gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text truncate">{page.name}</p>
            <p className="text-[11px] font-mono text-text-muted truncate">{page.path}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <TintBadge color={
              page.seoStatus === 'complete' ? 'success' :
              page.seoStatus === 'partial'  ? 'warning' : 'danger'
            }>
              SEO {page.seoStatus}
            </TintBadge>
            {page.sections.length > 0 && (
              <span className="label-mono text-text-muted">{page.sections.length} sections</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Tab: CMS ─────────────────────────────────────────────────────
function CMSTab({ contentTypes, onComingSoon }: { contentTypes: ContentType[]; onComingSoon: () => void }) {
  const [expanded, setExpanded] = useState<string | null>(contentTypes[0]?.id ?? null);

  if (contentTypes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <Database className="h-8 w-8 text-text-muted opacity-30" />
        <p className="text-sm text-text-muted">No CMS collections detected</p>
        <p className="text-xs text-text-muted opacity-60">
          AI looks for static arrays in your source (team members, blog posts, testimonials, etc.)
        </p>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-3">
      {contentTypes.map(ct => (
        <div key={ct.id} className="rounded-xl border border-border bg-bg-elevated overflow-hidden">
          <button
            className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-bg-sidebar transition-colors"
            onClick={() => setExpanded(expanded === ct.id ? null : ct.id)}
          >
            <div>
              <p className="text-sm font-medium text-text">{ct.name}</p>
              <p className="label-mono text-text-muted mt-0.5">{ct.items.length} items · {ct.fields.length} fields</p>
            </div>
            <ChevronRight className={`h-4 w-4 text-text-muted transition-transform ${expanded === ct.id ? 'rotate-90' : ''}`} />
          </button>

          {expanded === ct.id && (
            <div className="border-t border-border">
              {/* Field list */}
              <div className="flex flex-wrap gap-1.5 px-4 py-3 border-b border-border">
                {ct.fields.map(f => (
                  <span key={f.id} className="rounded-md bg-bg px-2 py-0.5 border border-border font-mono text-[10px] text-text-muted">
                    {f.name}: <span className="text-accent">{f.type}</span>
                  </span>
                ))}
              </div>

              {/* Items preview */}
              <div className="divide-y divide-border max-h-64 overflow-y-auto">
                {ct.items.slice(0, 8).map(item => {
                  const firstTextField = ct.fields.find(f => f.type === 'text' || f.type === 'richtext');
                  const label = firstTextField ? String(item.data[firstTextField.name] ?? '') : item.id;
                  return (
                    <div key={item.id} className="flex items-center justify-between px-4 py-2.5 gap-3">
                      <p className="text-sm text-text truncate">{label || item.id}</p>
                      <button
                        onClick={onComingSoon}
                        className="label-mono text-accent hover:underline shrink-0"
                      >
                        Edit
                      </button>
                    </div>
                  );
                })}
                {ct.items.length > 8 && (
                  <div className="px-4 py-2 label-mono text-text-muted">+{ct.items.length - 8} more</div>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Tab: Readiness ───────────────────────────────────────────────
function ReadinessTab({ project }: { project: Project }) {
  const score = project.readinessScore;
  const items = project.readinessItems;
  const { aiInsights } = project;

  const scoreColor: TintColor = score >= 80 ? 'success' : score >= 50 ? 'warning' : 'danger';

  return (
    <div className="p-5 space-y-5">
      {/* Score */}
      <div className="rounded-xl border border-border bg-bg-elevated px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <SectionLabel>Launch readiness</SectionLabel>
          <p
            className="text-2xl font-heading font-bold"
            style={{ color: `var(--tint-${scoreColor}-text)` }}
          >
            {score}<span className="text-base text-text-muted font-normal font-sans">/100</span>
          </p>
        </div>
        <div className="h-1.5 rounded-full bg-bg overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${score}%`,
              background: `var(--tint-${scoreColor}-text)`,
            }}
          />
        </div>
      </div>

      {/* Business summary */}
      {aiInsights.businessSummary && (
        <div className="rounded-xl border border-border bg-bg-elevated px-4 py-4">
          <SectionLabel>About this project</SectionLabel>
          <p className="text-sm text-text-secondary leading-relaxed">{aiInsights.businessSummary}</p>
          {aiInsights.businessType && (
            <p className="mt-3 flex flex-wrap gap-2">
              <TintBadge color="info">{aiInsights.businessType}</TintBadge>
              {aiInsights.targetAudience && (
                <TintBadge color="info">{aiInsights.targetAudience}</TintBadge>
              )}
            </p>
          )}
        </div>
      )}

      {/* Readiness items */}
      {items.length > 0 && (
        <div className="space-y-2">
          <SectionLabel>Checklist</SectionLabel>
          {items.map(item => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors"
              style={
                item.status === 'complete'
                  ? { background: 'var(--tint-success)', borderColor: 'transparent' }
                  : item.status === 'in-progress'
                  ? { background: 'var(--tint-warning)', borderColor: 'transparent' }
                  : { borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }
              }
            >
              {item.status === 'complete' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: 'var(--tint-success-text)' }} />
              ) : item.status === 'in-progress' ? (
                <AlertCircle className="h-4 w-4 shrink-0" style={{ color: 'var(--tint-warning-text)' }} />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-text-muted" />
              )}
              <p className="text-sm text-text-secondary">{item.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────
export default function ProjectDashboard({
  project,
  generatorId,
  deployUrl: externalDeployUrl,
  onDeployUrl,
  onPreDeploy,
}: ProjectDashboardProps) {
  const [activeTab, setActiveTab] = useState<Tab>('preview');
  const [deployStatus, setDeployStatus] = useState<DeployStatus>(externalDeployUrl ? 'live' : 'idle');
  const [deployUrl, setDeployUrl] = useState<string | undefined>(externalDeployUrl);
  const [deployError, setDeployError] = useState<string | undefined>();
  const [comingSoon, setComingSoon] = useState(false);

  const handleDeploy = useCallback(async () => {
    if (deployStatus === 'live' || deployStatus === 'loading') return;
    if (onPreDeploy) { onPreDeploy(); return; }
    setDeployStatus('loading');
    setDeployError(undefined);
    try {
      const res = await fetch(`${API}/api/deploy`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Server returned ${res.status}`);
      }
      const data: { url?: string; error?: string } = await res.json();
      if (!data.url) throw new Error('No URL returned from server');
      setDeployUrl(data.url);
      setDeployStatus('live');
      onDeployUrl?.(data.url);
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : 'Deploy failed');
      setDeployStatus('error');
    }
  }, [deployStatus, onDeployUrl, onPreDeploy]);

  const deploySlug = deployUrl
    ? deployUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
    : null;

  const generatorLabel = (() => {
    if (!generatorId) return null;
    const map: Record<string, string> = {
      LOVABLE: 'Lovable', BASE44: 'Base44', CLAUDE_CODE: 'Claude Code', CURSOR: 'Cursor',
    };
    return map[generatorId] ?? null;
  })();

  const TABS: { id: Tab; label: string; icon: typeof FileText; badge?: number }[] = [
    { id: 'preview',   label: 'Preview',   icon: Globe },
    { id: 'pages',     label: 'Pages',     icon: FileText,  badge: project.pages.length },
    { id: 'cms',       label: 'CMS',       icon: Database,  badge: project.contentTypes?.length },
    { id: 'readiness', label: 'Readiness', icon: CheckCircle2 },
  ];

  return (
    <div className="flex h-full w-full overflow-hidden">

      {/* ── Left: tabbed main content ── */}
      <div className="flex flex-1 flex-col overflow-hidden border-r border-border">

        {/* Tab bar */}
        <div className="flex shrink-0 border-b border-border bg-bg-sidebar">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm border-b-2 transition-colors ${
                  isActive
                    ? 'border-accent text-text font-medium'
                    : 'border-transparent text-text-muted hover:text-text-secondary'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {tab.badge != null && tab.badge > 0 && (
                  <span className={`label-mono px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-accent/15 text-accent' : 'bg-bg-elevated text-text-muted'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'preview' && (
            IS_PROD ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-text-muted">
                <Globe className="h-8 w-8 opacity-30" />
                <p className="text-sm">Deploy your site to see a live preview</p>
                <p className="text-xs opacity-60">Preview is available in local dev</p>
              </div>
            ) : (
              <iframe
                src={PREVIEW_URL}
                className="h-full w-full border-0"
                title="Site preview"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            )
          )}
          {activeTab === 'pages' && <PagesTab pages={project.pages} />}
          {activeTab === 'cms' && (
            <CMSTab contentTypes={project.contentTypes ?? []} onComingSoon={() => setComingSoon(true)} />
          )}
          {activeTab === 'readiness' && <ReadinessTab project={project} />}
        </div>
      </div>

      {/* ── Right: sidebar ── */}
      <div className="w-64 shrink-0 flex flex-col gap-5 overflow-y-auto bg-bg-sidebar px-5 py-6">

        {/* Project info */}
        <div>
          <SectionLabel>Project</SectionLabel>
          <p className="text-sm font-semibold text-text truncate">{project.name}</p>
          {generatorLabel && (
            <p className="mt-1">
              <span className="label-mono rounded bg-bg-elevated px-2 py-0.5 text-text-secondary border border-border">
                {generatorLabel}
              </span>
            </p>
          )}
          {project.readinessScore > 0 && (
            <div className="mt-3 flex items-center gap-2">
              <div className="flex-1 h-1 rounded-full bg-bg overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${project.readinessScore}%`,
                    background: `var(--tint-${project.readinessScore >= 80 ? 'success' : project.readinessScore >= 50 ? 'warning' : 'danger'}-text)`,
                  }}
                />
              </div>
              <span className="label-mono text-text-muted">{project.readinessScore}%</span>
            </div>
          )}
        </div>

        <div className="h-px bg-border" />

        {/* Deploy section */}
        <div>
          <SectionLabel>Deployment</SectionLabel>
          <div className="flex items-center gap-2 mb-4">
            <span className={`inline-block h-2 w-2 rounded-full ${
              deployStatus === 'live'  ? 'bg-status-green' :
              deployStatus === 'error' ? 'bg-status-red'   : 'bg-text-muted/40'
            }`} />
            <span className="text-sm text-text-secondary">
              {deployStatus === 'live' ? 'Live' : deployStatus === 'error' ? 'Deploy failed' : 'Not deployed'}
            </span>
          </div>

          {deployStatus !== 'live' ? (
            <>
              <button
                onClick={handleDeploy}
                disabled={deployStatus === 'loading'}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-brand-950 hover:bg-accent-hover transition-colors disabled:opacity-60"
              >
                {deployStatus === 'loading' ? (
                  <><span className="h-3.5 w-3.5 rounded-full border-2 border-brand-950/30 border-t-brand-950 animate-spin" />Deploying…</>
                ) : 'Deploy to HostaPosta →'}
              </button>
              {deployStatus === 'error' && deployError && (
                <p className="mt-2 text-xs" style={{ color: 'var(--tint-danger-text)' }}>{deployError}</p>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-border bg-bg-elevated p-3">
              <p className="label-mono text-text-muted mb-1.5 truncate">{deploySlug}</p>
              <div className="flex items-center gap-1.5">
                <CopyButton text={deployUrl!} />
                <a href={deployUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-text-muted hover:text-text-secondary transition-colors">
                  <ExternalLink className="h-3 w-3" />Open
                </a>
              </div>
            </div>
          )}
        </div>

        <div className="h-px bg-border" />

        {/* Domain section */}
        <div>
          <SectionLabel>Domain</SectionLabel>
          <div className="flex flex-col gap-2">
            <button onClick={() => setComingSoon(true)}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:bg-bg-elevated hover:text-text transition-colors text-left">
              <Globe className="h-3.5 w-3.5 shrink-0 text-text-muted" />Buy domain
            </button>
            <button onClick={() => setComingSoon(true)}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:bg-bg-elevated hover:text-text transition-colors text-left">
              <Globe className="h-3.5 w-3.5 shrink-0 text-text-muted" />Connect domain
            </button>
          </div>
        </div>

        <div className="h-px bg-border" />

        {/* Client section */}
        <div>
          <SectionLabel>Client</SectionLabel>
          <button onClick={() => setComingSoon(true)}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:bg-bg-elevated hover:text-text transition-colors w-full text-left">
            <User className="h-3.5 w-3.5 shrink-0 text-text-muted" />Invite client
          </button>
        </div>

      </div>

      {comingSoon && <ComingSoonModal onClose={() => setComingSoon(false)} />}
    </div>
  );
}
