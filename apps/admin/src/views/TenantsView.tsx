import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type TenantInfo } from "../lib/api";
import { Folder, Globe } from "lucide-react";

export default function TenantsView() {
  const [tenants, setTenants] = useState<TenantInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listTenants()
      .then(setTenants)
      .catch((err) => setError(String(err)));
  }, []);

  if (error) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <h1 className="font-heading text-2xl mb-4">Can't reach the API</h1>
        <p className="text-[var(--color-text-secondary)] mb-2">{error}</p>
        <p className="text-sm text-[var(--color-text-muted)]">
          Start the API server: <code className="font-mono">pnpm --filter @hostaposta/api dev</code>
        </p>
      </div>
    );
  }

  if (tenants === null) {
    return <div className="p-8 text-[var(--color-text-muted)]">Loading…</div>;
  }

  if (tenants.length === 0) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <h1 className="font-heading text-2xl mb-4">No tenants yet</h1>
        <p className="text-[var(--color-text-secondary)]">
          Run <code className="font-mono">pnpm generate &lt;caseId&gt;</code> to create your first tenant.
        </p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="font-heading text-2xl">Tenants</h1>
        <span className="label-mono text-[var(--color-text-muted)]">{tenants.length} total</span>
      </div>

      <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tenants.map((t) => (
          <li key={t.slug}>
            <Link
              to={`/${encodeURIComponent(t.slug)}`}
              className="block p-5 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] hover:border-[var(--color-accent)] hover:shadow-sm transition"
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="min-w-0">
                  <h2 className="font-heading text-lg truncate">{t.siteName}</h2>
                  <div className="label-mono text-[var(--color-text-muted)] mt-1">{t.slug}</div>
                </div>
                <Folder className="w-5 h-5 text-[var(--color-text-muted)] shrink-0" />
              </div>
              <div className="flex items-center gap-4 text-sm text-[var(--color-text-secondary)]">
                <span className="flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" />
                  {t.routes.length} {t.routes.length === 1 ? "page" : "pages"}
                </span>
                <span className="label-mono">
                  {t.lang.toUpperCase()} · {t.dir.toUpperCase()}
                </span>
                {!t.hasCarveMap && (
                  <span className="label-mono text-[var(--color-status-orange)]">
                    no carve
                  </span>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
