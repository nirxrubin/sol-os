import { Moon, Sun, Plus } from 'lucide-react';
import type { ThemeMode } from '../data/types';
import HpLogo from './HpLogo';

interface TopBarProps {
  projectName: string;
  theme: ThemeMode;
  onThemeToggle: () => void;
  onNewProject?: () => void;
}

export default function TopBar({
  projectName,
  theme,
  onThemeToggle,
  onNewProject,
}: TopBarProps) {
  return (
    <header className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-bg-sidebar px-4 gap-4">
      {/* Left: Brand + Project */}
      <div className="flex items-center gap-2">
        <HpLogo className="h-4 w-auto text-text" />
        <span className="text-text-muted text-[14px] font-light select-none">/</span>
        <span className="text-[13px] text-text-secondary truncate max-w-[200px]">
          {projectName}
        </span>
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

      {/* Right: Actions */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onThemeToggle}
          className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-bg-hover hover:text-text-secondary transition-colors"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>
      </div>
    </header>
  );
}
