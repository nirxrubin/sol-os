import { motion } from 'framer-motion';
import { TriangleAlert, X, RefreshCw, ExternalLink } from 'lucide-react';
import type { LimitWarning, LimitWarningType } from '../data/types';

interface LimitWarningBannerProps {
  warning: LimitWarning;
  onDismiss: () => void;
  onRetry: () => void;
}

// ─── Per-type config ─────────────────────────────────────────────────

const config: Record<LimitWarningType, {
  bg: string;
  border: string;
  iconColor: string;
  titleColor: string;
  canRetry: boolean;
  docsHref?: string;
}> = {
  rate_limit: {
    bg: 'bg-status-orange/8',
    border: 'border-status-orange/30',
    iconColor: 'text-status-orange',
    titleColor: 'text-status-orange',
    canRetry: true,
  },
  overloaded: {
    bg: 'bg-status-orange/8',
    border: 'border-status-orange/30',
    iconColor: 'text-status-orange',
    titleColor: 'text-status-orange',
    canRetry: true,
  },
  budget: {
    bg: 'bg-status-orange/8',
    border: 'border-status-orange/30',
    iconColor: 'text-status-orange',
    titleColor: 'text-status-orange',
    canRetry: true,
  },
  timeout: {
    bg: 'bg-status-orange/8',
    border: 'border-status-orange/30',
    iconColor: 'text-status-orange',
    titleColor: 'text-status-orange',
    canRetry: true,
  },
  context_window: {
    bg: 'bg-status-orange/8',
    border: 'border-status-orange/30',
    iconColor: 'text-status-orange',
    titleColor: 'text-status-orange',
    canRetry: true,
  },
  auth: {
    bg: 'bg-status-red/8',
    border: 'border-status-red/30',
    iconColor: 'text-status-red',
    titleColor: 'text-status-red',
    canRetry: false,
    docsHref: 'https://console.anthropic.com/settings/keys',
  },
  no_api_key: {
    bg: 'bg-border/60',
    border: 'border-border',
    iconColor: 'text-text-muted',
    titleColor: 'text-text-secondary',
    canRetry: false,
    docsHref: 'https://console.anthropic.com/settings/keys',
  },
  unknown: {
    bg: 'bg-status-orange/8',
    border: 'border-status-orange/30',
    iconColor: 'text-status-orange',
    titleColor: 'text-status-orange',
    canRetry: true,
  },
};

// ─── Component ────────────────────────────────────────────────────────

export default function LimitWarningBanner({ warning, onDismiss, onRetry }: LimitWarningBannerProps) {
  const c = config[warning.type] ?? config.unknown;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={`flex shrink-0 items-start gap-3 border-b px-5 py-3 ${c.bg} ${c.border}`}
    >
      <TriangleAlert size={15} className={`mt-0.5 shrink-0 ${c.iconColor}`} />

      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold leading-tight ${c.titleColor}`}>
          {warning.title}
        </p>
        <p className="mt-0.5 text-xs leading-snug text-text-secondary">
          {warning.message}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {c.docsHref && (
          <a
            href={c.docsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-text-muted transition-colors hover:bg-accent/10 hover:text-accent"
          >
            <ExternalLink size={10} />
            <span>Docs</span>
          </a>
        )}
        {c.canRetry && (
          <button
            onClick={onRetry}
            className="flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-text-muted transition-colors hover:bg-accent/10 hover:text-accent"
            title="Upload a new project to retry AI analysis"
          >
            <RefreshCw size={10} />
            <span>Retry</span>
          </button>
        )}
        <button
          onClick={onDismiss}
          className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-accent/10 hover:text-accent"
          title="Dismiss"
        >
          <X size={12} />
        </button>
      </div>
    </motion.div>
  );
}
