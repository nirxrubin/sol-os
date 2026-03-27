import { motion } from 'framer-motion';
import { Rocket, X, CheckCircle2, Circle, AlertTriangle } from 'lucide-react';
import type { TechSector } from '../data/types';

interface LaunchReadinessProps {
  sectors: TechSector[];
  readinessScore: number;
  onClose: () => void;
  onDeploy: () => void;
}

function getSectorBadge(sector: TechSector) {
  const completedTasks = sector.tasks.filter((t) => t.completed).length;
  const manualIncomplete = sector.tasks.filter((t) => !t.completed && t.automation === 'manual').length;

  if (sector.status === 'connected' || sector.status === 'ready') {
    return { label: 'Ready', className: 'bg-status-green/20 text-status-green' };
  }
  if (sector.status === 'not-started' && completedTasks === 0) {
    return { label: 'Not Started', className: 'bg-bg-elevated text-text-muted' };
  }
  if (manualIncomplete > 0) {
    return { label: 'Needs Human Action', className: 'bg-status-orange/20 text-status-orange' };
  }
  return { label: 'Suggested', className: 'bg-accent/20 text-accent' };
}

function getSectorDotColor(percentage: number) {
  if (percentage >= 80) return 'bg-status-green';
  if (percentage > 0) return 'bg-status-orange';
  return 'bg-text-muted';
}

export default function LaunchReadiness({
  sectors,
  readinessScore,
  onClose,
  onDeploy,
}: LaunchReadinessProps) {
  const readyCount = sectors.filter(
    (s) => s.status === 'connected' || s.status === 'ready'
  ).length;

  const blockedCount = sectors.filter(
    (s) => s.status === 'not-started' && s.tasks.filter((t) => t.completed).length === 0
  ).length;

  const manualCount = sectors.reduce(
    (sum, s) => sum + s.tasks.filter((t) => !t.completed && t.automation === 'manual').length,
    0
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-bg-card p-8 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
              <Rocket className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h2 className="font-heading text-xl font-semibold text-text">Launch Readiness</h2>
              <p className="text-sm text-text-secondary">
                Review all sectors before deploying to production
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-hover hover:text-text"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Score section */}
        <div className="mt-8 flex flex-wrap items-center gap-6">
          <div>
            <p className="font-heading text-5xl font-extrabold text-text">{readinessScore}%</p>
            <p className="text-sm text-text-secondary">Overall Score</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-2 rounded-xl border border-border bg-bg-elevated px-5 py-3 text-sm text-text-secondary">
              <CheckCircle2 className="h-4 w-4 text-status-green" />
              {readyCount} Ready
            </span>
            <span className="inline-flex items-center gap-2 rounded-xl border border-border bg-bg-elevated px-5 py-3 text-sm text-text-secondary">
              <Circle className="h-4 w-4 text-status-orange" />
              {manualCount} Manual
            </span>
            <span className="inline-flex items-center gap-2 rounded-xl border border-border bg-bg-elevated px-5 py-3 text-sm text-text-secondary">
              <AlertTriangle className="h-4 w-4 text-status-red" />
              {blockedCount} Blocked
            </span>
          </div>
        </div>

        {/* Sector list */}
        <div className="mt-8 divide-y divide-border-subtle">
          {sectors.map((sector) => {
            const totalTasks = sector.tasks.length;
            const completedTasks = sector.tasks.filter((t) => t.completed).length;
            const percentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
            const badge = getSectorBadge(sector);
            const manualActions = sector.tasks.filter(
              (t) => !t.completed && t.automation === 'manual'
            ).length;
            const dotColor = getSectorDotColor(percentage);

            return (
              <div
                key={sector.id}
                className="flex items-center gap-4 py-4 first:pt-0 last:pb-0"
              >
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotColor}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text">{sector.name}</span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  {manualActions > 0 && (
                    <p className="mt-0.5 text-xs text-text-muted">
                      {manualActions} manual action{manualActions !== 1 ? 's' : ''} required
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-1.5 w-24 rounded-full bg-border-subtle">
                    <div
                      className={`h-full rounded-full ${
                        percentage >= 80
                          ? 'bg-status-green'
                          : percentage > 0
                            ? 'bg-accent'
                            : 'bg-text-muted'
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-sm text-text-secondary">
                    {percentage}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom */}
        <div className="mt-8 flex items-center justify-between">
          <p className="text-sm text-text-muted">
            Several sectors need attention before launch
          </p>
          <button
            onClick={onDeploy}
            className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-brand-950 transition-colors hover:bg-accent-hover"
          >
            <Rocket className="h-4 w-4" />
            <span>Deploy to Production</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
