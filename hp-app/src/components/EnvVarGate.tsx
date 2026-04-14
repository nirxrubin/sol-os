/**
 * EnvVarGate — Pre-deploy env var form
 *
 * Shown before deploy when required env vars are missing.
 * Reads status from GET /api/analysis/env-vars.
 * User fills in missing values → POST /api/analysis/env-vars.
 * Once all vars are filled, onComplete() is called and deploy can proceed.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { KeyRound, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { API } from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────

interface EnvVarStatus {
  required: string[];
  provided: Record<string, string>;
  missing: string[];
  complete: boolean;
}

interface EnvVarGateProps {
  onComplete: () => void;  // all vars filled → allow deploy
  onSkip: () => void;      // user decides to deploy without filling
}

// ─── Component ────────────────────────────────────────────────────────

export default function EnvVarGate({ onComplete, onSkip }: EnvVarGateProps) {
  const [status, setStatus]   = useState<EnvVarStatus | null>(null);
  const [values, setValues]   = useState<Record<string, string>>({});
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load env var status on mount
  useEffect(() => {
    fetch(`${API}/api/analysis/env-vars`)
      .then(r => r.json())
      .then((s: EnvVarStatus) => {
        setStatus(s);
        // Pre-fill with already-known values
        const pre: Record<string, string> = {};
        for (const k of s.missing) pre[k] = '';
        setValues(pre);
        // If already complete, skip straight to deploy
        if (s.complete) onComplete();
      })
      .catch(() => setError('Failed to load env var requirements'))
      .finally(() => setLoading(false));
  }, [onComplete]);

  const handleSave = async () => {
    if (!status || saving) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`${API}/api/analysis/env-vars`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vars: values }),
      });
      const data: EnvVarStatus = await res.json();
      setStatus(data);

      if (data.complete) {
        onComplete();
      } else {
        const stillMissing = data.missing;
        setValues(prev => {
          const next = { ...prev };
          for (const k of stillMissing) {
            if (!(k in next)) next[k] = '';
          }
          return next;
        });
      }
    } catch {
      setError('Failed to save env vars');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
      </div>
    );
  }

  if (!status || status.required.length === 0) {
    // No env vars needed — call onComplete immediately
    onComplete();
    return null;
  }

  const allFilled = status.missing.every(k => values[k]?.trim());

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
          <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div>
            <h2 className="font-heading text-2xl font-medium text-text">
              Environment variables needed
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              Your app uses these variables. Fill in any missing values before deploying.
            </p>
          </div>
        </div>

        {/* Var list */}
        <div className="mb-6 space-y-3">
          {status.required.map(key => {
            const alreadySet = !(status.missing.includes(key));
            return (
              <div key={key}>
                <label className="mb-1 flex items-center gap-2 text-xs font-medium text-text">
                  {alreadySet ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
                  )}
                  {key}
                  {alreadySet && (
                    <span className="font-normal text-text-muted">(from .env)</span>
                  )}
                </label>
                {!alreadySet && (
                  <input
                    type="text"
                    value={values[key] ?? ''}
                    onChange={e => setValues(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder={`Enter ${key}`}
                    className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text placeholder-text-muted outline-none focus:border-accent"
                  />
                )}
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-900/40 bg-red-950/30 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !allFilled}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? 'Saving…' : 'Save and deploy'}
          </button>

          <button
            onClick={onSkip}
            disabled={saving}
            className="rounded-xl border border-border px-4 py-3 text-sm text-text-muted transition-colors hover:border-text-muted hover:text-text disabled:opacity-40"
          >
            Deploy without
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-text-muted">
          Values are stored on your deploy target. They won't be committed to source.
        </p>
      </motion.div>
    </div>
  );
}
