/**
 * FrameworkConfirmView — Stage 3 of the Compatibility Pipeline
 *
 * Shown when all automatic build attempts fail.
 * Lets the user correct the detected framework or supply a custom build command.
 * On submit, calls POST /api/analysis/confirm-framework and resumes analysis.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, ChevronDown, Loader2, Upload } from 'lucide-react';
import { API } from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────

interface FrameworkConfirmViewProps {
  detectedArchetype: string;
  buildError?: string;
  buildOutput?: string;
  onConfirmed: () => void;      // analysis resumed successfully
  onUploadPrebuilt: () => void; // user wants to start over with a pre-built zip
}

const ARCHETYPES = [
  { id: 'vite-react',         label: 'Vite + React'           },
  { id: 'vite-vue',           label: 'Vite + Vue'             },
  { id: 'nextjs-app-router',  label: 'Next.js (App Router)'   },
  { id: 'nextjs-pages-router',label: 'Next.js (Pages Router)' },
  { id: 'astro',              label: 'Astro'                  },
  { id: 'cra',                label: 'Create React App'       },
  { id: 'vanilla-html',       label: 'Static HTML (no build)' },
] as const;

// ─── Component ────────────────────────────────────────────────────────

export default function FrameworkConfirmView({
  detectedArchetype,
  buildError,
  buildOutput,
  onConfirmed,
  onUploadPrebuilt,
}: FrameworkConfirmViewProps) {
  const [selectedArchetype, setSelectedArchetype] = useState(detectedArchetype);
  const [customCommand, setCustomCommand]          = useState('');
  const [showError, setShowError]                  = useState(false);
  const [retryError, setRetryError]                = useState<string | null>(null);
  const [submitting, setSubmitting]                = useState(false);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setRetryError(null);

    try {
      const res = await fetch(`${API}/api/analysis/confirm-framework`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          archetypeId: selectedArchetype,
          buildCommand: customCommand.trim() || undefined,
        }),
      });
      const data = await res.json();

      if (data.success) {
        onConfirmed();
      } else {
        setRetryError(data.buildError ?? 'Build failed again. Try a different framework or upload a pre-built zip.');
        setSubmitting(false);
      }
    } catch {
      setRetryError('Network error — please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-bg p-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mx-auto w-full max-w-lg"
      >
        {/* Header */}
        <div className="mb-6 flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <h2 className="font-heading text-2xl font-medium text-text">
              Build didn't succeed
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              We couldn't build your project automatically. Tell us more so we can try again.
            </p>
          </div>
        </div>

        {/* Framework selector */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-text">
            What framework is this?
          </label>
          <div className="relative">
            <select
              value={selectedArchetype}
              onChange={e => setSelectedArchetype(e.target.value)}
              className="w-full appearance-none rounded-lg border border-border bg-surface px-4 py-2.5 pr-10 text-sm text-text outline-none focus:border-accent"
            >
              {ARCHETYPES.map(a => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          </div>
        </div>

        {/* Custom build command */}
        <div className="mb-6">
          <label className="mb-1.5 block text-sm font-medium text-text">
            Custom build command{' '}
            <span className="font-normal text-text-muted">(optional)</span>
          </label>
          <input
            type="text"
            value={customCommand}
            onChange={e => setCustomCommand(e.target.value)}
            placeholder="e.g. npm run build:prod"
            className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text placeholder-text-muted outline-none focus:border-accent"
          />
        </div>

        {/* Build error details (collapsible) */}
        {buildError && (
          <div className="mb-6">
            <button
              onClick={() => setShowError(v => !v)}
              className="mb-2 text-xs text-text-muted underline-offset-2 hover:text-text hover:underline"
            >
              {showError ? 'Hide' : 'Show'} build error
            </button>
            {showError && (
              <pre className="max-h-40 overflow-auto rounded-lg border border-border bg-surface p-3 text-xs text-red-400">
                {buildError}
                {buildOutput ? `\n\n--- output ---\n${buildOutput}` : ''}
              </pre>
            )}
          </div>
        )}

        {/* Retry error */}
        {retryError && (
          <div className="mb-4 rounded-lg border border-red-900/40 bg-red-950/30 p-3 text-sm text-red-400">
            {retryError}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Building…
              </>
            ) : (
              'Try again'
            )}
          </button>

          <button
            onClick={onUploadPrebuilt}
            disabled={submitting}
            className="flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm text-text-muted transition-colors hover:border-text-muted hover:text-text disabled:opacity-40"
          >
            <Upload className="h-4 w-4" />
            Upload pre-built
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-text-muted">
          Or compress your <code className="rounded bg-surface px-1 py-0.5">dist/</code> folder as a ZIP and re-upload — we'll skip the build entirely.
        </p>
      </motion.div>
    </div>
  );
}
