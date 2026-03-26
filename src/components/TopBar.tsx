import { ChevronDown, Search, Moon, Sun, Rocket } from 'lucide-react';
import type { ThemeMode } from '../data/types';
import SolLogo from './SolLogo';

interface TopBarProps {
  projectName: string;
  readinessScore: number;
  theme: ThemeMode;
  onThemeToggle: () => void;
  onChatToggle: () => void;
  onDeploy: () => void;
}

export default function TopBar({
  projectName,
  readinessScore,
  theme,
  onThemeToggle,
  onChatToggle,
  onDeploy,
}: TopBarProps) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-bg-sidebar px-4">
      {/* Left: Brand + Project */}
      <div className="flex items-center gap-2.5">
        <SolLogo className="h-6 w-auto text-text" />
        <span className="text-text-muted">&middot;</span>
        <button className="flex items-center gap-1 text-[13px] text-text-secondary hover:text-text transition-colors">
          <span>{projectName}</span>
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>

      {/* Center: Search */}
      <div className="hidden md:flex items-center w-72">
        <div className="relative flex w-full items-center">
          <Search className="absolute left-2.5 h-3.5 w-3.5 text-text-muted" />
          <input
            type="text"
            placeholder="Search nodes, pages, tasks..."
            className="w-full rounded-lg bg-bg-card border border-border px-3 py-1.5 pl-8 pr-14 text-[13px] text-text placeholder:text-text-muted outline-none focus:ring-1 focus:ring-accent/50"
          />
          <span className="absolute right-2.5 flex items-center gap-0.5 rounded bg-bg-elevated px-1 py-0.5 text-[10px] font-medium text-text-muted">
            <span>&#8984;</span>
            <span>K</span>
          </span>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1.5">
        {/* Readiness badge */}
        <div className="flex items-center gap-1.5 rounded-full bg-bg-elevated px-2.5 py-1 text-[12px] text-text-secondary">
          <span className="h-1.5 w-1.5 rounded-full bg-status-orange" />
          <span>Readiness {readinessScore}%</span>
        </div>

        <button
          onClick={onThemeToggle}
          className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-bg-hover hover:text-text transition-colors"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>

        <button
          onClick={onDeploy}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1 text-[12px] font-semibold text-brand-950 hover:bg-accent-hover transition-colors"
        >
          <Rocket className="h-3.5 w-3.5" />
          <span>Deploy</span>
        </button>
      </div>
    </header>
  );
}
