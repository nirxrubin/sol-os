import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import type { Project } from '../data/types';
import { API } from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────

interface DetectionInfo {
  generatorId?: string;
  generatorConfidence?: string;
  generatorNotice?: string;
}

interface AnalysisViewProps {
  onComplete: (project?: Project, detection?: DetectionInfo) => void;
  polling?: boolean;
  fileCount?: number;
}

// ─── Prep steps shown to the user ────────────────────────────────────

const STEPS = [
  { id: 'unpack',  label: 'Unpacking your files'   },
  { id: 'detect',  label: 'Reading your stack'      },
  { id: 'build',   label: 'Building for the web'    },
  { id: 'preview', label: 'Spinning up preview'     },
];

type StepStatus = 'pending' | 'active' | 'done';

function progressToStep(progress: number): number {
  if (progress < 25) return 0;
  if (progress < 50) return 1;
  if (progress < 80) return 2;
  return 3;
}

// ─── Component ────────────────────────────────────────────────────────

export default function AnalysisView({ onComplete, polling, fileCount }: AnalysisViewProps) {
  const [progress, setProgress] = useState(5);
  const [isDone, setIsDone]     = useState(false);
  const completedRef            = useRef(false);

  // Smoothly walk progress forward while waiting
  useEffect(() => {
    if (isDone) return;
    const id = setInterval(() => {
      setProgress(p => Math.min(p + 3, 88));
    }, 800);
    return () => clearInterval(id);
  }, [isDone]);

  // ─── Poll /api/analysis for completion ──────────────────────────
  useEffect(() => {
    if (!polling) return;

    let cancelled = false;
    let completeTimeout: ReturnType<typeof setTimeout> | null = null;

    const pollTimer = setInterval(async () => {
      if (cancelled) return;
      try {
        const res  = await fetch(`${API}/api/analysis`);
        const data = await res.json();

        if (data.status === 'complete' && data.project && !cancelled) {
          cancelled = true;
          clearInterval(pollTimer);
          setProgress(100);
          setIsDone(true);

          const project   = data.project as Project;
          const detection: DetectionInfo = {
            generatorId:         data.generatorId,
            generatorConfidence: data.generatorConfidence,
            generatorNotice:     data.generatorNotice,
          };

          completeTimeout = setTimeout(() => {
            if (!completedRef.current) {
              completedRef.current = true;
              onComplete(project, detection);
            }
          }, 900);
        }
      } catch { /* network blip — keep polling */ }
    }, 1500);

    return () => {
      cancelled = true;
      clearInterval(pollTimer);
      if (completeTimeout) clearTimeout(completeTimeout);
    };
  }, [polling, onComplete]);

  const activeStep = progressToStep(progress);

  const stepStatus = (i: number): StepStatus => {
    if (isDone)       return 'done';
    if (i < activeStep) return 'done';
    if (i === activeStep) return 'active';
    return 'pending';
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-bg">
      <div className="mx-auto flex w-full max-w-sm flex-col items-center px-6">

        {/* Heading */}
        <motion.h2
          key={isDone ? 'done' : 'loading'}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="font-heading text-3xl font-medium text-text text-center"
        >
          {isDone ? 'Ready.' : 'Prepping your site…'}
        </motion.h2>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="mt-2 text-sm text-text-secondary text-center"
        >
          {isDone
            ? 'Hit deploy and you\'re live.'
            : fileCount
            ? `${fileCount} files — getting everything launch-ready`
            : 'Getting everything launch-ready…'}
        </motion.p>

        {/* Steps */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mt-10 w-full space-y-3"
        >
          {STEPS.map((step, i) => {
            const status = stepStatus(i);
            return (
              <div key={step.id} className="flex items-center gap-3">
                <span className="shrink-0">
                  {status === 'done'   && <CheckCircle2 className="h-4 w-4 text-status-green" />}
                  {status === 'active' && <Loader2      className="h-4 w-4 animate-spin text-accent" />}
                  {status === 'pending'&& <Circle       className="h-4 w-4 text-border" />}
                </span>
                <span className={`text-sm transition-colors duration-300 ${
                  status === 'done'    ? 'text-text-secondary line-through decoration-text-muted/40'
                  : status === 'active' ? 'text-text font-medium'
                  : 'text-text-muted'
                }`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </motion.div>

        {/* Progress bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mt-8 w-full"
        >
          <div className="h-1 w-full rounded-full bg-border">
            <motion.div
              className="h-full rounded-full bg-accent"
              animate={{ width: `${isDone ? 100 : progress}%` }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            />
          </div>
        </motion.div>

      </div>
    </div>
  );
}
