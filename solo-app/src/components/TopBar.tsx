import { Moon, Sun, ChevronDown, Plus } from 'lucide-react';
import type { ThemeMode, DashboardTab } from '../data/types';
import HpLogo from './HpLogo';

// Generator display config — badge only shown for certain/likely detections
const GENERATOR_LABELS: Record<string, string> = {
  LOVABLE: 'Lovable',
  BASE44: 'Base44',
  CLAUDE_CODE: 'Claude Code',
  CURSOR: 'Cursor',
};

interface TopBarProps {
  projectName: string;
  theme: ThemeMode;
  onThemeToggle: () => void;
  onDeploy: () => void;
  onNewProject?: () => void;
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  generatorId?: string;
  generatorConfidence?: string;
}

const tabs: { id: DashboardTab; label: string }[] = [
  { id: 'editor', label: 'Editor' },
  { id: 'content', label: 'Content' },
  { id: 'settings', label: 'Settings' },
  { id: 'insights', label: 'Insights' },
];

export default function TopBar({
  projectName,
  theme,
  onThemeToggle,
  onDeploy,
  onNewProject,
  activeTab,
  onTabChange,
  generatorId,
  generatorConfidence,
}: TopBarProps) {
  const generatorLabel = generatorId && (generatorConfidence === 'certain' || generatorConfidence === 'likely')
    ? GENERATOR_LABELS[generatorId]
    : null;
  return (
    <header className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-bg-sidebar px-4 gap-4">
      {/* Left: Brand + Project */}
      <div className="flex items-center gap-2 min-w-[160px]">
        <HpLogo className="h-4 w-auto text-text" />
        <span className="text-text-muted text-[14px] font-light select-none">/</span>
        <button className="flex items-center gap-1 text-[13px] text-text-secondary hover:text-text transition-colors max-w-[128px]">
          <span className="truncate">{projectName}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </button>
        {generatorLabel && (
          <span
            title={`Detected generator: ${generatorLabel} (${generatorConfidence})`}
            className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 select-none"
          >
            {generatorLabel}
          </span>
        )}
        {onNewProject && (
          <button
            onClick={onNewProject}
            title="New project"
            className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] text-text-muted hover:text-text-secondary hover:border-text-muted/30 transition-colors"
          >
            <Plus className="h-2.5 w-2.5" />
            New
          </button>
        )}
      </div>

      {/* Center: Tab navigation */}
      <nav className="flex items-center gap-0.5 flex-1 justify-center">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`px-3.5 py-1.5 text-[13px] rounded-md transition-colors font-medium ${
              activeTab === tab.id
                ? 'bg-bg-hover text-text'
                : 'text-text-muted hover:text-text-secondary hover:bg-bg-elevated'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Right: Actions */}
      <div className="flex items-center gap-1.5 min-w-[160px] justify-end">
        <button
          onClick={onThemeToggle}
          className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-bg-hover hover:text-text-secondary transition-colors"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>

        <button
          onClick={onDeploy}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-[12px] font-medium text-brand-950 hover:bg-accent-hover transition-colors"
        >
          Publish
        </button>
      </div>
    </header>
  );
}
