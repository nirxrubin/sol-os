import { useState, useCallback } from 'react';
import { Copy, ExternalLink, Globe, User } from 'lucide-react';
import type { Project } from '../data/types';
import { API, PREVIEW_URL, IS_PROD } from '../lib/api';

interface ProjectDashboardProps {
  project: Project;
  generatorId?: string;
  deployUrl?: string;
  onDeployUrl?: (url: string) => void;
}

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
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[11px] font-semibold uppercase tracking-widest text-accent mb-2">
          Coming soon
        </p>
        <h3 className="text-lg font-semibold text-text leading-snug">
          We're working on it
        </h3>
        <p className="mt-2 text-sm text-text-secondary">
          This feature is on our roadmap. Stay tuned for updates.
        </p>
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

// ─── Copy button ──────────────────────────────────────────────────
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
      title="Copy URL"
      className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-text-muted hover:text-text-secondary hover:border-text-muted/30 transition-colors"
    >
      <Copy className="h-3 w-3" />
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────
export default function ProjectDashboard({
  project,
  generatorId,
  deployUrl: externalDeployUrl,
  onDeployUrl,
}: ProjectDashboardProps) {
  const [deployStatus, setDeployStatus] = useState<DeployStatus>(
    externalDeployUrl ? 'live' : 'idle'
  );
  const [deployUrl, setDeployUrl] = useState<string | undefined>(externalDeployUrl);
  const [deployError, setDeployError] = useState<string | undefined>();
  const [comingSoon, setComingSoon] = useState(false);

  const handleDeploy = useCallback(async () => {
    if (deployStatus === 'live' || deployStatus === 'loading') return;
    setDeployStatus('loading');
    setDeployError(undefined);

    try {
      const res = await fetch(`${API}/api/deploy`, { method: 'POST' });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data: { slug?: string; url?: string; ok?: boolean } = await res.json();
      const url = data.url ?? (data.slug ? `https://${data.slug}.hostaposta.app` : undefined);
      if (!url) throw new Error('No URL returned from server');
      setDeployUrl(url);
      setDeployStatus('live');
      onDeployUrl?.(url);
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : 'Deploy failed');
      setDeployStatus('error');
    }
  }, [deployStatus, onDeployUrl]);

  // Derive slug label from URL for display
  const deploySlug = deployUrl
    ? deployUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
    : null;

  // Archetype label — map generatorId to friendly name
  const archetypeLabel = (() => {
    if (!generatorId) return 'vanilla-html';
    const map: Record<string, string> = {
      LOVABLE: 'lovable',
      BASE44: 'base44',
      CLAUDE_CODE: 'claude-code',
      CURSOR: 'cursor',
      REACT: 'react',
      NEXTJS: 'next.js',
    };
    return map[generatorId] ?? generatorId.toLowerCase().replace(/_/g, '-');
  })();

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* ── Left: Read-only preview iframe ── */}
      <div className="flex-1 overflow-hidden bg-bg-elevated border-r border-border">
        {IS_PROD ? (
          <div className="h-full w-full flex flex-col items-center justify-center gap-3 text-text-muted">
            <Globe className="h-8 w-8 opacity-30" />
            <p className="text-sm">Preview available in local dev</p>
            <p className="text-xs opacity-60">Deploy to see your site live</p>
          </div>
        ) : (
          <iframe
            src={PREVIEW_URL}
            className="h-full w-full border-0"
            title="Site preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            style={{ minWidth: '1024px', transform: 'scale(1)', transformOrigin: 'top left' }}
          />
        )}
      </div>

      {/* ── Right: Control panel ── */}
      <div className="w-64 shrink-0 flex flex-col gap-6 overflow-y-auto bg-bg-sidebar px-5 py-6">

        {/* Project info */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-2">
            Project
          </p>
          <p className="text-sm font-semibold text-text truncate">{project.name}</p>
          <p className="mt-0.5 text-xs text-text-muted">
            Archetype:{' '}
            <span className="rounded bg-bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-text-secondary">
              {archetypeLabel}
            </span>
          </p>
        </div>

        <div className="h-px bg-border" />

        {/* Deploy section */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-3">
            Deployment
          </p>

          {/* Status indicator */}
          <div className="flex items-center gap-2 mb-4">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                deployStatus === 'live'
                  ? 'bg-status-green'
                  : deployStatus === 'error'
                  ? 'bg-status-red'
                  : 'bg-text-muted/40'
              }`}
            />
            <span className="text-sm text-text-secondary">
              {deployStatus === 'live'
                ? 'Live'
                : deployStatus === 'error'
                ? 'Deploy failed'
                : 'Not deployed'}
            </span>
          </div>

          {/* Deploy button or live URL */}
          {deployStatus !== 'live' ? (
            <>
              <button
                onClick={handleDeploy}
                disabled={deployStatus === 'loading'}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-brand-950 hover:bg-accent-hover transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {deployStatus === 'loading' ? (
                  <>
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-brand-950/30 border-t-brand-950 animate-spin" />
                    Deploying…
                  </>
                ) : (
                  'Deploy to HostaPosta →'
                )}
              </button>
              {deployStatus === 'error' && deployError && (
                <p className="mt-2 text-xs text-status-red">{deployError}</p>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-border bg-bg-elevated p-3">
              <p className="text-[11px] text-text-muted mb-1.5 truncate">{deploySlug}</p>
              <div className="flex items-center gap-1.5">
                <CopyButton text={deployUrl!} />
                <a
                  href={deployUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-text-muted hover:text-text-secondary hover:border-text-muted/30 transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open
                </a>
              </div>
            </div>
          )}
        </div>

        <div className="h-px bg-border" />

        {/* Domain section */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-3">
            Domain
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setComingSoon(true)}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:bg-bg-elevated hover:text-text transition-colors text-left"
            >
              <Globe className="h-3.5 w-3.5 shrink-0 text-text-muted" />
              Buy domain
            </button>
            <button
              onClick={() => setComingSoon(true)}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:bg-bg-elevated hover:text-text transition-colors text-left"
            >
              <Globe className="h-3.5 w-3.5 shrink-0 text-text-muted" />
              Connect domain
            </button>
          </div>
        </div>

        <div className="h-px bg-border" />

        {/* Client section */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-3">
            Client
          </p>
          <button
            onClick={() => setComingSoon(true)}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:bg-bg-elevated hover:text-text transition-colors w-full text-left"
          >
            <User className="h-3.5 w-3.5 shrink-0 text-text-muted" />
            Invite client
          </button>
        </div>

      </div>

      {/* Coming soon modal */}
      {comingSoon && <ComingSoonModal onClose={() => setComingSoon(false)} />}
    </div>
  );
}
