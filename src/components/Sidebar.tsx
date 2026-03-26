import { useState } from 'react';
import { ChevronDown, ChevronRight, Database, Settings, Bell, User, Sparkles } from 'lucide-react';
import type { Page, ContentType, TechSector, MainView } from '../data/types';

interface SidebarProps {
  pages: Page[];
  contentTypes: ContentType[];
  sectors: TechSector[];
  activePage: Page;
  activeContentType: ContentType;
  activeSector: TechSector;
  mainView: MainView;
  onPageSelect: (page: Page) => void;
  onContentSelect: (ct: ContentType) => void;
  onSectorSelect: (sector: TechSector) => void;
  onChatToggle: () => void;
  chatOpen: boolean;
}

const sectorStatusColor: Record<TechSector['status'], string> = {
  connected: 'bg-status-green',
  ready: 'bg-status-green',
  'needs-setup': 'bg-status-orange',
  'not-started': 'bg-status-red',
};

export default function Sidebar({
  pages,
  contentTypes,
  sectors,
  activePage,
  activeContentType,
  activeSector,
  mainView,
  onPageSelect,
  onContentSelect,
  onSectorSelect,
  onChatToggle,
  chatOpen,
}: SidebarProps) {
  const [pagesExpanded, setPagesExpanded] = useState(true);
  const [contentExpanded, setContentExpanded] = useState(true);
  const [techExpanded, setTechExpanded] = useState(true);

  return (
    <aside className="flex h-full w-52 shrink-0 flex-col border-r border-border bg-bg-sidebar overflow-y-auto">
      {/* Scrollable nav sections */}
      <div className="flex-1 overflow-y-auto">
        {/* PAGES Section */}
        <div className="pt-3 px-3">
          <button
            onClick={() => setPagesExpanded(!pagesExpanded)}
            className="flex w-full items-center justify-between px-2 py-1.5 group"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Pages
            </span>
            {pagesExpanded ? (
              <ChevronDown className="h-3 w-3 text-text-muted group-hover:text-text-secondary" />
            ) : (
              <ChevronRight className="h-3 w-3 text-text-muted group-hover:text-text-secondary" />
            )}
          </button>
          {pagesExpanded && (
            <div className="mt-0.5 space-y-0.5">
              {pages.map((page) => {
                const isActive = mainView === 'page-editor' && activePage.id === page.id;
                return (
                  <button
                    key={page.id}
                    onClick={() => onPageSelect(page)}
                    className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-[13px] transition-colors duration-150 rounded-md ${
                      isActive
                        ? 'bg-accent/10 text-accent'
                        : 'text-text-secondary hover:bg-bg-card hover:text-text'
                    }`}
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-green" />
                    <span className="truncate">{page.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* CONTENT Section */}
        <div className="pt-3 px-3">
          <button
            onClick={() => setContentExpanded(!contentExpanded)}
            className="flex w-full items-center justify-between px-2 py-1.5 group"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Content
            </span>
            {contentExpanded ? (
              <ChevronDown className="h-3 w-3 text-text-muted group-hover:text-text-secondary" />
            ) : (
              <ChevronRight className="h-3 w-3 text-text-muted group-hover:text-text-secondary" />
            )}
          </button>
          {contentExpanded && (
            <div className="mt-0.5 space-y-0.5">
              {contentTypes.map((ct) => {
                const isActive = mainView === 'cms-table' && activeContentType.id === ct.id;
                return (
                  <button
                    key={ct.id}
                    onClick={() => onContentSelect(ct)}
                    className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-[13px] transition-colors duration-150 rounded-md ${
                      isActive
                        ? 'bg-accent/10 text-accent'
                        : 'text-text-secondary hover:bg-bg-card hover:text-text'
                    }`}
                  >
                    <Database className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                    <span className="truncate">{ct.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* TECHNICAL SETUP Section */}
        <div className="pt-3 pb-3 px-3">
          <button
            onClick={() => setTechExpanded(!techExpanded)}
            className="flex w-full items-center justify-between px-2 py-1.5 group"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Technical Setup
            </span>
            {techExpanded ? (
              <ChevronDown className="h-3 w-3 text-text-muted group-hover:text-text-secondary" />
            ) : (
              <ChevronRight className="h-3 w-3 text-text-muted group-hover:text-text-secondary" />
            )}
          </button>
          {techExpanded && (
            <div className="mt-0.5 space-y-0.5">
              {sectors.map((sector) => {
                const isActive = mainView === 'tech-detail' && activeSector.id === sector.id;
                return (
                  <button
                    key={sector.id}
                    onClick={() => onSectorSelect(sector)}
                    className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-[13px] transition-colors duration-150 rounded-md ${
                      isActive
                        ? 'bg-accent/10 text-accent'
                        : 'text-text-secondary hover:bg-bg-card hover:text-text'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${sectorStatusColor[sector.status]}`}
                    />
                    <span className="truncate">{sector.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bottom toolbar: notifications, settings, profile, agent */}
      <div className="shrink-0 border-t border-border px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-0.5">
            <button
              className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-bg-card hover:text-text transition-colors"
              aria-label="Notifications"
            >
              <Bell className="h-3.5 w-3.5" />
            </button>
            <button
              className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-bg-card hover:text-text transition-colors"
              aria-label="Settings"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
            <button
              className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-bg-card hover:text-text transition-colors"
              aria-label="Profile"
            >
              <User className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            onClick={onChatToggle}
            className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
              chatOpen
                ? 'bg-accent text-brand-950'
                : 'bg-accent/10 text-accent hover:bg-accent/20'
            }`}
            aria-label="Sol OS Agent"
          >
            <Sparkles className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
