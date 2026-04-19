import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type PageInfo, type TenantInfo, type RebuildResult } from "../lib/api";
import { ArrowLeft, FileText, Hammer, ExternalLink } from "lucide-react";

export default function TenantView() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [pages, setPages] = useState<PageInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildResult, setRebuildResult] = useState<RebuildResult | null>(null);

  useEffect(() => {
    Promise.all([api.getTenant(slug), api.listPages(slug)])
      .then(([t, p]) => {
        setTenant(t);
        setPages(p);
      })
      .catch((err) => setError(String(err)));
  }, [slug]);

  async function onRebuild() {
    setRebuilding(true);
    setRebuildResult(null);
    try {
      const r = await api.rebuild(slug);
      setRebuildResult(r);
    } catch (err) {
      setRebuildResult({ ok: false, durationMs: 0, error: String(err) });
    } finally {
      setRebuilding(false);
    }
  }

  if (error) return <div className="p-8 text-[var(--color-status-red)]">{error}</div>;
  if (!tenant || !pages) return <div className="p-8 text-[var(--color-text-muted)]">Loading…</div>;

  const totalEdits = pages.reduce((n, p) => n + p.totalEdits, 0);
  const totalEdited = pages.reduce((n, p) => n + p.editedCount, 0);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <button
        onClick={() => navigate("/")}
        className="mb-4 flex items-center gap-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
      >
        <ArrowLeft className="w-4 h-4" /> All tenants
      </button>

      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="font-heading text-3xl mb-2">{tenant.siteName}</h1>
          <div className="flex items-center gap-4 text-sm text-[var(--color-text-secondary)]">
            <span className="label-mono text-[var(--color-text-muted)]">{tenant.slug}</span>
            <span className="label-mono">{tenant.lang.toUpperCase()} · {tenant.dir.toUpperCase()}</span>
            <span>
              {totalEdited} / {totalEdits} edits applied
            </span>
          </div>
        </div>
        <button
          onClick={onRebuild}
          disabled={rebuilding}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-brand-950)] font-medium text-sm hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          <Hammer className="w-4 h-4" />
          {rebuilding ? "Rebuilding…" : "Rebuild site"}
        </button>
      </div>

      {rebuildResult && (
        <div
          className={`mb-6 p-4 rounded-lg border ${
            rebuildResult.ok
              ? "bg-[var(--tint-success)] border-[var(--tint-success-text)]/30 text-[var(--tint-success-text)]"
              : "bg-[var(--tint-danger)] border-[var(--tint-danger-text)]/30 text-[var(--tint-danger-text)]"
          }`}
        >
          <div className="label-mono mb-1">
            {rebuildResult.ok ? "Rebuild ok" : "Rebuild failed"} · {rebuildResult.durationMs}ms
          </div>
          {rebuildResult.error && (
            <pre className="text-xs font-mono whitespace-pre-wrap mt-2 opacity-90">
              {rebuildResult.error.slice(0, 600)}
            </pre>
          )}
        </div>
      )}

      <div className="mb-2 flex items-center justify-between">
        <h2 className="label-mono text-[var(--color-text-muted)]">Pages</h2>
      </div>

      <ul className="divide-y divide-[var(--color-border-subtle)] bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] overflow-hidden">
        {pages.map((p) => (
          <li key={p.route}>
            <Link
              to={`/${encodeURIComponent(slug)}/page${p.route === "/" ? "" : p.route}`}
              className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-[var(--color-bg-hover)] transition"
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" />
                <div className="min-w-0">
                  <div className="font-mono text-sm truncate">{p.route}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {p.editedCount > 0 && (
                  <span className="label-mono bg-[var(--tint-info)] text-[var(--tint-info-text)] px-2 py-0.5 rounded">
                    {p.editedCount} edited
                  </span>
                )}
                <span className="label-mono text-[var(--color-text-muted)]">
                  {p.totalEdits} fields
                </span>
                <ExternalLink className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
