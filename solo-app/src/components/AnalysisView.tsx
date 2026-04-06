import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Loader2, AlertCircle, Sparkles, Search, FileText, ScanSearch, TriangleAlert } from 'lucide-react';
import type { Project, LimitWarning } from '../data/types';

// ─── Types (mirror server's LogEvent) ────────────────────────────────

type LogEventType = 'tool_call' | 'insight' | 'info' | 'complete' | 'error';

interface LogEvent {
  id: number;
  type: LogEventType;
  tool?: string;
  message: string;
  path?: string;
  timestamp: number;
  limitType?: string;
}

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

// ─── Limit type → human title map ────────────────────────────────────

const limitTitles: Record<string, string> = {
  rate_limit:     'API rate limit hit',
  overloaded:     'Anthropic API overloaded',
  budget:         'AI tool-call budget exhausted',
  timeout:        'Analysis timed out',
  context_window: 'Context window exceeded',
  auth:           'API key error',
  no_api_key:     'No API key configured',
  unknown:        'AI analysis failed',
};

const limitColors: Record<string, string> = {
  auth:       'var(--color-status-red)',
  no_api_key: 'var(--color-text-muted)',
};

function limitColor(type: string): string {
  return limitColors[type] ?? 'var(--color-status-orange)';
}

// ─── Main component ──────────────────────────────────────────────────

// Maps raw server messages to friendly UI copy
// Technical messages are still shown in the log; this is just the headline status
function wittyStatus(msg: string, progress: number): string {
  const m = msg.toLowerCase();
  if (m.includes('collecting') || m.includes('key files')) return 'Gathering the files…';
  if (m.includes('local mode') || m.includes('single-shot')) return 'Spinning up the analysis…';
  if (m.includes('local claude') || m.includes('subscription')) return 'Claude is thinking…';
  if (m.includes('list_files') || m.includes('list files')) return 'Getting the lay of the land…';
  if (m.includes('read_file') || m.includes('reading')) return 'Reading through your code…';
  if (m.includes('search') || m.includes('scan')) return 'Hunting for patterns…';
  if (m.includes('package.json')) return 'Checking your dependencies…';
  if (m.includes('router') || m.includes('route')) return 'Mapping the pages…';
  if (m.includes('cms') || m.includes('content') || m.includes('collection')) return 'Finding your content…';
  if (m.includes('component') || m.includes('page')) return 'Tracing the components…';
  if (m.includes('build') || m.includes('compil')) return 'Building the preview…';
  if (m.includes('complete') || m.includes('done') || m.includes('write_analysis')) return 'Wrapping up…';
  if (m.includes('error') || m.includes('fail')) return 'Hit a snag, recovering…';
  if (m.includes('starting') || m.includes('start')) return 'Getting started…';
  if (progress < 20) return 'Warming up…';
  if (progress < 50) return 'Making progress…';
  if (progress < 80) return 'Almost there…';
  return 'Finishing touches…';
}

export default function AnalysisView({ onComplete, polling, fileCount }: AnalysisViewProps) {
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [aiReveal, setAiReveal] = useState<{ summary: string; businessType: string; audience: string } | null>(null);
  const [isDone, setIsDone] = useState(false);
  const completedRef = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);

  // Progress: each tool call = ~3%, capped at 95% until done
  const toolCallCount = events.filter(e => e.type === 'tool_call').length;
  const progress = isDone ? 100 : Math.min(15 + toolCallCount * 3, 94);
  const hasError = events.some(e => e.type === 'error') && isDone;

  // Detect limit warnings from the event stream
  const limitEvent = events.find(e => e.type === 'error' && e.limitType);
  const limitWarning: LimitWarning | null = limitEvent?.limitType ? {
    type: limitEvent.limitType as LimitWarning['type'],
    title: limitTitles[limitEvent.limitType] ?? 'Analysis interrupted',
    message: limitEvent.message.replace(/^⚠\s*[^—]+—\s*/, ''), // strip "⚠ title — " prefix
  } : null;

  // Elapsed time tracker
  const [elapsedMs, setElapsedMs] = useState(0);
  const startTimeRef = useRef<number>(Date.now());
  useEffect(() => {
    if (isDone) return;
    const t = setInterval(() => setElapsedMs(Date.now() - startTimeRef.current), 1000);
    return () => clearInterval(t);
  }, [isDone]);

  // Estimated total time: extrapolate from progress (clamped to reasonable bounds)
  const estimatedTotalMs = progress > 5 && progress < 95
    ? Math.min(Math.max((elapsedMs / progress) * 100, 15_000), 180_000)
    : null;
  const remainingMs = estimatedTotalMs ? Math.max(0, estimatedTotalMs - elapsedMs) : null;

  function formatTime(ms: number): string {
    if (ms < 60_000) return `${Math.ceil(ms / 1000)}s`;
    return `${Math.floor(ms / 60_000)}m ${Math.ceil((ms % 60_000) / 1000)}s`;
  }

  const activeMessage = (() => {
    if (isDone) return 'Complete';
    if (hasError) return 'Analysis completed with errors';
    const last = events[events.length - 1];
    if (last) return last.message;
    return 'Starting…';
  })();

  // ─── SSE: live log events from server ──────────────────────────
  useEffect(() => {
    if (!polling) return;

    const es = new EventSource('/api/progress');

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as LogEvent[];
        setEvents(data);
        if (data.some(ev => ev.type === 'complete')) {
          setIsDone(true);
        }
      } catch { /* ignore malformed */ }
    };

    return () => es.close();
  }, [polling]);

  // ─── Auto-scroll log to bottom ─────────────────────────────────
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [events]);

  // ─── Poll /api/analysis for completion ─────────────────────────
  useEffect(() => {
    if (!polling) return;

    let cancelled = false;
    let completeTimeout: ReturnType<typeof setTimeout> | null = null;

    const pollTimer = setInterval(async () => {
      if (cancelled) return;
      try {
        const res = await fetch('/api/analysis');
        const data = await res.json();

        if (data.status === 'complete' && data.project && !cancelled) {
          cancelled = true;
          clearInterval(pollTimer);

          const project = data.project as Project;
          const detection: DetectionInfo = {
            generatorId: data.generatorId,
            generatorConfidence: data.generatorConfidence,
            generatorNotice: data.generatorNotice,
          };

          if (project.aiInsights?.businessSummary) {
            setAiReveal({
              summary:      project.aiInsights.businessSummary,
              businessType: project.aiInsights.businessType,
              audience:     project.aiInsights.targetAudience,
            });
            completeTimeout = setTimeout(() => {
              if (!completedRef.current) {
                completedRef.current = true;
                onComplete(project, detection);
              }
            }, 2800);
          } else {
            completeTimeout = setTimeout(() => {
              if (!completedRef.current) {
                completedRef.current = true;
                onComplete(project, detection);
              }
            }, 600);
          }
        }
      } catch { /* network blip — keep polling */ }
    }, 1500);

    return () => {
      cancelled = true;
      clearInterval(pollTimer);
      if (completeTimeout) clearTimeout(completeTimeout);
    };
  }, [polling, onComplete]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-bg">
      <div className="mx-auto flex w-full max-w-lg flex-col items-center px-6">

        {/* Heading */}
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="font-heading text-3xl font-medium text-text"
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
            ? `Reading through ${fileCount} files — won't take long`
            : 'Hold tight, figuring out what you built…'}
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
              className={`h-full rounded-full transition-colors ${hasError ? 'bg-status-orange' : 'bg-accent'}`}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between text-sm text-text-secondary">
            <span className={`truncate ${hasError ? 'text-status-orange' : ''}`}>
              {isDone ? '✓ All done' : wittyStatus(activeMessage, progress)}
            </span>
            <span className="ml-3 shrink-0 tabular-nums flex items-center gap-2">
              {!isDone && remainingMs !== null && (
                <span className="text-[10px] text-text-muted">~{formatTime(remainingMs)} left</span>
              )}
              <span>{progress}%</span>
            </span>
          </div>
        </motion.div>

        {/* Limit warning banner */}
        <AnimatePresence>
          {limitWarning && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="mt-5 w-full max-w-sm rounded-xl border px-4 py-3"
              style={{
                borderColor: limitColor(limitWarning.type),
                backgroundColor: `color-mix(in srgb, ${limitColor(limitWarning.type)} 8%, transparent)`,
              }}
            >
              <div className="flex items-start gap-2.5">
                <TriangleAlert
                  size={15}
                  className="mt-0.5 shrink-0"
                  style={{ color: limitColor(limitWarning.type) }}
                />
                <div>
                  <p
                    className="text-sm font-semibold leading-tight"
                    style={{ color: limitColor(limitWarning.type) }}
                  >
                    {limitWarning.title}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                    {limitWarning.message}
                  </p>
                  <p className="mt-1.5 text-[10px] text-text-muted">
                    Dashboard will open with heuristic data — re-upload to retry.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Live log */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.25 }}
          ref={logRef}
          className="mt-6 w-full max-w-sm h-52 overflow-y-auto space-y-0.5 scrollbar-none"
          style={{ scrollbarWidth: 'none' }}
        >
          {events.length === 0 && (
            <div className="flex items-center gap-2.5 px-1 py-2">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-text-muted" />
              <span className="text-sm text-text-muted">Connecting…</span>
            </div>
          )}
          {events.map(event => (
            <LogRow key={event.id} event={event} />
          ))}
        </motion.div>

        {/* AI reveal card */}
        <AnimatePresence>
          {aiReveal && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="mt-6 w-full max-w-sm rounded-xl border border-accent/30 bg-accent/5 px-5 py-4"
            >
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                      HostaPosta understands
                    </span>
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent">
                      {aiReveal.businessType}
                    </span>
                  </div>
                  <p className="text-sm text-text">{aiReveal.summary}</p>
                  <p className="mt-1 text-xs text-text-secondary">For: {aiReveal.audience}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}

// ─── Individual log row ──────────────────────────────────────────────

function LogRow({ event }: { event: LogEvent }) {
  const icon = (() => {
    if (event.type === 'complete') return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-status-green" />;
    if (event.type === 'error')    return <AlertCircle  className="h-3.5 w-3.5 shrink-0 text-status-orange" />;
    if (event.type === 'insight')  return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-accent" />;
    if (event.tool === 'list_files')     return <Search     className="h-3.5 w-3.5 shrink-0 text-text-muted" />;
    if (event.tool === 'search_in_file') return <ScanSearch className="h-3.5 w-3.5 shrink-0 text-text-muted" />;
    if (event.tool === 'read_file')      return <FileText   className="h-3.5 w-3.5 shrink-0 text-text-muted" />;
    return <Loader2 className="h-3.5 w-3.5 shrink-0 text-text-muted opacity-60" />;
  })();

  const textClass = (() => {
    if (event.type === 'complete') return 'text-status-green font-medium';
    if (event.type === 'error')    return 'text-status-orange';
    if (event.type === 'insight')  return 'text-accent';
    return 'text-text-muted';
  })();

  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-2.5 rounded px-1 py-1"
    >
      <div className="shrink-0">{icon}</div>
      <span className={`text-xs truncate ${textClass}`}>{event.message}</span>
      <span className="ml-auto shrink-0 text-[10px] text-text-muted tabular-nums opacity-50">
        {(event.timestamp / 1000).toFixed(1)}s
      </span>
    </motion.div>
  );
}
