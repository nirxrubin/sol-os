import { useState } from 'react';
import { ChevronDown, ChevronRight, Database, Settings, Bell, User, Sparkles, FileText } from 'lucide-react';
import type { Page, ContentType, TechSector, MainView, AIInsights, DashboardTab } from '../data/types';

interface SidebarProps {
  pages: Page[];
  contentTypes: ContentType[];
  sectors: TechSector[];
  activePage: Page;
  activeContentType: ContentType;
  activeSector: TechSector;
  mainView: MainView;
  activeTab: DashboardTab;
  aiInsights?: AIInsights;
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
  'not-started': 'bg-border',
};

export default function Sidebar({
  pages,
  contentTypes,
  sectors,
  activePage,
  activeContentType,
  activeSector,
  mainView,
  activeTab,
  aiInsights,
  onPageSelect,
  onContentSelect,
  onSectorSelect,
  onChatToggle,
  chatOpen,
}: SidebarProps) {
  const [pagesExpanded, setPagesExpanded] = useState(true);
  const [collectionsExpanded, setCollectionsExpanded] = useState(true);
  const [sectorsExpanded, setSectorsExpanded] = useState(true);

  // Editor: pages list
  const renderEditorNav = () => (
    <div className="pt-2 px-2">
      <button
        onClick={() => setPagesExpanded(!pagesExpanded)}
        className="flex w-full items-center justify-between px-2 py-1.5 group"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Pages
        </span>
        {pagesExpanded
          ? <ChevronDown className="h-3 w-3 text-text-muted group-hover:text-text-secondary" />
          : <ChevronRight className="h-3 w-3 text-text-muted group-hover:text-text-secondary" />
        }
      </button>
      {pagesExpanded && (
        <div className="mt-0.5 space-y-0.5">
          {pages.map((page) => {
            const isActive = mainView === 'page-editor' && activePage.id === page.id;
            return (
              <button
                key={page.id}
                onClick={() => onPageSelect(page)}
                className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-[13px] rounded-md transition-colors duration-150 ${
                  isActive
                    ? 'bg-bg-hover text-text font-medium'
                    : 'text-text-secondary hover:bg-bg-elevated hover:text-text'
                }`}
              >
                <FileText className="h-3 w-3 shrink-0 text-text-muted" />
                <span className="truncate">{page.name}</span>
                <span
                  className={`ml-auto h-1.5 w-1.5 shrink-0 rounded-full ${
                    page.seoStatus === 'complete' ? 'bg-status-green' :
                    page.seoStatus === 'partial' ? 'bg-status-orange' : 'bg-border'
                  }`}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  // Content: collections list
  const renderContentNav = () => (
    <div className="pt-2 px-2">
      <button
        onClick={() => setCollectionsExpanded(!collectionsExpanded)}
        className="flex w-full items-center justify-between px-2 py-1.5 group"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Collections
        </span>
        {collectionsExpanded
          ? <ChevronDown className="h-3 w-3 text-text-muted group-hover:text-text-secondary" />
          : <ChevronRight className="h-3 w-3 text-text-muted group-hover:text-text-secondary" />
        }
      </button>
      {collectionsExpanded && (
        <div className="mt-0.5 space-y-0.5">
          {contentTypes.length === 0 ? (
            <p className="px-2 py-3 text-[12px] text-text-muted">No collections yet</p>
          ) : (
            contentTypes.map((ct) => {
              const isActive = mainView === 'cms-table' && activeContentType.id === ct.id;
              return (
                <button
                  key={ct.id}
                  onClick={() => onContentSelect(ct)}
                  className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-[13px] rounded-md transition-colors duration-150 ${
                    isActive
                      ? 'bg-bg-hover text-text font-medium'
                      : 'text-text-secondary hover:bg-bg-elevated hover:text-text'
                  }`}
                >
                  <Database className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                  <span className="truncate">{ct.name}</span>
                  <span className="ml-auto text-[10px] text-text-muted tabular-nums">
                    {ct.items.length}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );

  // Settings: infrastructure sectors
  const renderSettingsNav = () => (
    <div className="pt-2 px-2">
      <button
        onClick={() => setSectorsExpanded(!sectorsExpanded)}
        className="flex w-full items-center justify-between px-2 py-1.5 group"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Infrastructure
        </span>
        {sectorsExpanded
          ? <ChevronDown className="h-3 w-3 text-text-muted group-hover:text-text-secondary" />
          : <ChevronRight className="h-3 w-3 text-text-muted group-hover:text-text-secondary" />
        }
      </button>
      {sectorsExpanded && (
        <div className="mt-0.5 space-y-0.5">
          {sectors.map((sector) => {
            const isActive = mainView === 'tech-detail' && activeSector.id === sector.id;
            return (
              <button
                key={sector.id}
                onClick={() => onSectorSelect(sector)}
                className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-[13px] rounded-md transition-colors duration-150 ${
                  isActive
                    ? 'bg-bg-hover text-text font-medium'
                    : 'text-text-secondary hover:bg-bg-elevated hover:text-text'
                }`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${sectorStatusColor[sector.status]}`} />
                <span className="truncate">{sector.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  // Insights: AI summary
  const renderInsightsNav = () => (
    <div className="pt-2 px-2">
      <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">
        AI Summary
      </p>
      {aiInsights ? (
        <div className="space-y-3 px-1">
          <div className="rounded-lg border border-border bg-bg-card p-3">
            <p className="text-[11px] font-medium text-text mb-1">{aiInsights.businessType}</p>
            <p className="text-[11px] text-text-secondary leading-relaxed">{aiInsights.businessSummary}</p>
          </div>
          {aiInsights.launchRecommendations.length > 0 && (
            <div>
              <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
                Next steps
              </p>
              <div className="space-y-1">
                {aiInsights.launchRecommendations.slice(0, 5).map((rec) => (
                  <div key={rec.id} className="flex items-start gap-2 px-1">
                    <span className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${
                      rec.priority === 'high' ? 'bg-status-orange' :
                      rec.priority === 'medium' ? 'bg-status-blue' : 'bg-text-muted'
                    }`} />
                    <p className="text-[11px] text-text-secondary leading-snug">{rec.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="px-2 py-3 text-[12px] text-text-muted">
          Import a project to see AI insights
        </p>
      )}
    </div>
  );

  return (
    <aside className="flex h-full w-52 shrink-0 flex-col border-r border-border bg-bg-sidebar">
      {/* Scrollable nav */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'editor' && renderEditorNav()}
        {activeTab === 'content' && renderContentNav()}
        {activeTab === 'settings' && renderSettingsNav()}
        {activeTab === 'insights' && renderInsightsNav()}
      </div>

      {/* Bottom toolbar */}
      <div className="shrink-0 border-t border-border px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-0.5">
            <button
              className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-bg-hover hover:text-text-secondary transition-colors"
              aria-label="Notifications"
            >
              <Bell className="h-3.5 w-3.5" />
            </button>
            <button
              className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-bg-hover hover:text-text-secondary transition-colors"
              aria-label="Settings"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
            <button
              className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-bg-hover hover:text-text-secondary transition-colors"
              aria-label="Profile"
            >
              <User className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            onClick={onChatToggle}
            className={`flex items-center gap-1.5 rounded-md px-2.5 h-7 text-[11px] font-medium transition-colors ${
              chatOpen
                ? 'bg-accent text-brand-950'
                : 'border border-border text-text-secondary hover:border-text-muted/40 hover:text-text'
            }`}
            aria-label="HostaPosta AI"
          >
            <Sparkles className="h-3 w-3" />
            <span>AI</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
