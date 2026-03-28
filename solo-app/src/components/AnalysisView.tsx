import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Circle } from 'lucide-react';
import type { AnalysisStep, Project } from '../data/types';

interface AnalysisViewProps {
  steps: AnalysisStep[];
  onComplete: (project?: Project) => void;
  /** When true, polls /api/analysis for real data instead of using timer. */
  polling?: boolean;
  fileCount?: number;
}

export default function AnalysisView({ steps: initialSteps, onComplete, polling, fileCount }: AnalysisViewProps) {
  const [steps, setSteps] = useState<AnalysisStep[]>(() =>
    initialSteps.map((s) => ({ ...s, status: 'pending' as const }))
  );
  const completedRef = useRef(false);

  const completedCount = steps.filter((s) => s.status === 'complete').length;
  const inProgressStep = steps.find((s) => s.status === 'in-progress');
  const progress = (completedCount / steps.length) * 100;

  // ─── Polling mode: real server analysis ──────────────────────
  useEffect(() => {
    if (!polling) return;

    let cancelled = false;
    let completeTimeout: ReturnType<typeof setTimeout> | null = null;

    // Immediately mark first step as in-progress
    setSteps((prev) => prev.map((s, i) => (i === 0 ? { ...s, status: 'in-progress' as const } : s)));

    let stepIndex = 0;
    const stepTimer = setInterval(() => {
      if (cancelled) return;
      stepIndex++;
      setSteps((prev) =>
        prev.map((s, i) => {
          if (i < stepIndex) return { ...s, status: 'complete' as const };
          if (i === stepIndex) return { ...s, status: 'in-progress' as const };
          return s;
        }),
      );
    }, 800);

    // Poll for analysis completion
    const pollTimer = setInterval(async () => {
      if (cancelled) return;
      try {
        const res = await fetch('/api/analysis');
        const data = await res.json();

        if (data.status === 'complete' && data.project && !cancelled) {
          cancelled = true;
          clearInterval(stepTimer);
          clearInterval(pollTimer);

          // Complete all remaining steps
          setSteps((prev) => prev.map((s) => ({ ...s, status: 'complete' as const })));

          // Delay to show completion animation
          // Note: cancelled is true here (set above to stop polling), so we
          // only guard with completedRef to prevent double-fire.
          const project = data.project as Project;
          completeTimeout = setTimeout(() => {
            if (!completedRef.current) {
              completedRef.current = true;
              onComplete(project);
            }
          }, 600);
        }
      } catch {
        // Network error - keep polling
      }
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(stepTimer);
      clearInterval(pollTimer);
      if (completeTimeout) clearTimeout(completeTimeout);
    };
  }, [polling, onComplete]);

  // ─── Timer mode: demo/sample analysis ────────────────────────
  useEffect(() => {
    if (polling) return;

    setSteps(initialSteps.map((s) => ({ ...s, status: 'pending' as const })));
    completedRef.current = false;

    let index = 0;
    const timer = setInterval(() => {
      setSteps((prev) => {
        const next = prev.map((step, i) => {
          if (i === index) return { ...step, status: 'in-progress' as const };
          if (i < index) return { ...step, status: 'complete' as const };
          return step;
        });
        return next;
      });

      if (index > 0) {
        setSteps((prev) =>
          prev.map((step, i) =>
            i === index - 1 ? { ...step, status: 'complete' as const } : step
          )
        );
      }

      index++;

      if (index > initialSteps.length) {
        clearInterval(timer);
        setSteps((prev) =>
          prev.map((step, i) =>
            i === initialSteps.length - 1 ? { ...step, status: 'complete' as const } : step
          )
        );
      }
    }, 600);

    return () => clearInterval(timer);
  }, [initialSteps, polling]);

  // ─── Auto-complete callback for timer mode ───────────────────
  useEffect(() => {
    if (polling) return;
    if (completedCount === steps.length && steps.length > 0 && !completedRef.current) {
      completedRef.current = true;
      const timeout = setTimeout(() => onComplete(), 800);
      return () => clearTimeout(timeout);
    }
  }, [completedCount, steps.length, onComplete, polling]);

  return (
    <div className="flex h-full w-full items-center justify-center bg-bg">
      <div className="mx-auto flex w-full max-w-lg flex-col items-center px-6">
        {/* Heading */}
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="mt-8 font-heading text-3xl font-medium text-text"
        >
          Analyzing your project
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="mt-2 text-sm text-text-secondary"
        >
          {fileCount
            ? `Processing ${fileCount} files - building your launch canvas`
            : 'Building your intelligent launch canvas'}
        </motion.p>

        {/* Progress bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mt-8 w-full max-w-sm"
        >
          <div className="h-1.5 w-full rounded-full bg-border">
            <motion.div
              className="h-full rounded-full bg-accent"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between text-sm text-text-secondary">
            <span>{inProgressStep?.label ?? (completedCount === steps.length ? 'Complete' : 'Starting...')}</span>
            <span>{Math.round(progress)}%</span>
          </div>
        </motion.div>

        {/* Checklist */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.25 }}
          className="mt-10 w-full max-w-sm"
        >
          {steps.map((step) => (
            <div key={step.id} className="flex items-center gap-3 py-2.5">
              {step.status === 'complete' && (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-status-green" />
              )}
              {step.status === 'in-progress' && (
                <Circle className="h-5 w-5 shrink-0 animate-pulse text-accent" />
              )}
              {step.status === 'pending' && (
                <Circle className="h-5 w-5 shrink-0 text-text-muted" />
              )}
              <span
                className={`text-sm ${
                  step.status === 'complete'
                    ? 'text-text-secondary'
                    : step.status === 'in-progress'
                      ? 'text-text'
                      : 'text-text-muted'
                }`}
              >
                {step.label}
              </span>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
