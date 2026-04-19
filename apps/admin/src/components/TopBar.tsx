import { Link, useParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";

export default function TopBar() {
  const params = useParams();
  const slug = params.slug as string | undefined;

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-sidebar)]">
      <div className="flex items-center gap-3 text-sm">
        <Link to="/" className="font-heading text-lg text-[var(--color-text)]">
          HostaPosta
        </Link>
        <span className="label-mono text-[var(--color-text-muted)]">Admin</span>
        {slug && (
          <>
            <ChevronRight className="w-3 h-3 text-[var(--color-text-muted)]" />
            <Link
              to={`/${slug}`}
              className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
            >
              {slug}
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
