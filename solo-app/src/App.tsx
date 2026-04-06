import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { AppView, MainView, ThemeMode, DashboardTab, Page, TechSector, ContentType, ContentItem, ChatMessage, Project, UploadResult } from './data/types';
import { sampleProject } from './data/sampleProject';
import Landing from './components/Landing';
import AnalysisView from './components/AnalysisView';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import SetupBanner from './components/SetupBanner';
import LimitWarningBanner from './components/LimitWarningBanner';
import PageEditor from './components/PageEditor';
import CMSTableView from './components/CMSTableView';
import TechDetailView from './components/TechDetailView';
import ChatPanel from './components/ChatPanel';
import LaunchReadiness from './components/LaunchReadiness';

export default function App() {
  const [view, setView] = useState<AppView>('landing');
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem('sol-theme');
    return (stored === 'dark' || stored === 'light') ? stored : 'light';
  });
  const [mainView, setMainView] = useState<MainView>('page-editor');
  const [activeTab, setActiveTab] = useState<DashboardTab>('editor');

  // Dual-mode: imported project vs sample/demo
  const [importedProject, setImportedProject] = useState<Project | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const isImported = importedProject !== null;
  const currentProject = importedProject ?? sampleProject;

  const [activePage, setActivePage] = useState<Page>(currentProject.pages[0]);
  const [contentTypes, setContentTypes] = useState<ContentType[]>(currentProject.contentTypes);
  const [activeContentTypeId, setActiveContentTypeId] = useState<string>(currentProject.contentTypes[0]?.id ?? '');
  const [activeSector, setActiveSector] = useState<TechSector>(currentProject.sectors[0]);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const [showLaunchReadiness, setShowLaunchReadiness] = useState(false);
  const [editItemId, setEditItemId] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState(0); // Bumped after CMS sync + rebuild
  const [limitWarningDismissed, setLimitWarningDismissed] = useState(false);
  const [generatorId, setGeneratorId] = useState<string | undefined>(undefined);
  const [generatorConfidence, setGeneratorConfidence] = useState<string | undefined>(undefined);
  const [generatorNotice, setGeneratorNotice] = useState<string | undefined>(undefined);

  // Derive activeContentType from mutable state
  const activeContentType = contentTypes.find(ct => ct.id === activeContentTypeId) ?? contentTypes[0];

  // On mount: check if server already has a completed analysis (e.g. from previous upload)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    fetch('/api/analysis')
      .then(r => r.json())
      .then((data: { status: string; project?: Project; fileCount?: number; entryFile?: string; generatorId?: string; generatorConfidence?: string; generatorNotice?: string }) => {
        // Always capture detection data when available
        if (data.generatorId) setGeneratorId(data.generatorId);
        if (data.generatorConfidence) setGeneratorConfidence(data.generatorConfidence);
        if (data.generatorNotice) setGeneratorNotice(data.generatorNotice);

        if (data.status === 'complete' && data.project) {
          const project = data.project;
          setImportedProject(project);
          setContentTypes(project.contentTypes);
          setActivePage(project.pages[0] ?? { id: 'empty', name: 'Home', path: '/', seoStatus: 'missing' as const, sections: [] });
          setActiveContentTypeId(project.contentTypes[0]?.id ?? '');
          setActiveSector(project.sectors[0]);
          setBannerDismissed(true);
          setView('dashboard');
        }
      })
      .catch(() => { /* server offline — stay on landing */ });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Theme toggle - applies class to html element and persists
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    localStorage.setItem('sol-theme', next);
  };

  const handlePageSelect = (page: Page) => {
    setActivePage(page);
    setMainView('page-editor');
    setActiveTab('editor');
  };

  const handleContentSelect = (ct: ContentType) => {
    setActiveContentTypeId(ct.id);
    setMainView('cms-table');
    setEditItemId(null);
    setActiveTab('content');
  };

  const handleSectorSelect = (sector: TechSector) => {
    setActiveSector(sector);
    setMainView('tech-detail');
    setActiveTab('settings');
  };

  const handleTabChange = (tab: DashboardTab) => {
    setActiveTab(tab);
    if (tab === 'editor') setMainView('page-editor');
    else if (tab === 'content') setMainView('cms-table');
    else if (tab === 'settings') setMainView('tech-detail');
    else if (tab === 'insights') setShowLaunchReadiness(true);
  };

  // Dismiss limit warning and reset flag on new project
  const limitWarning = importedProject?.limitWarning ?? null;
  const showLimitWarning = !!limitWarning && !limitWarningDismissed;

  // Reset to landing — clears server workspace and returns to upload screen
  const handleNewProject = async () => {
    try { await fetch('/api/reset', { method: 'POST' }); } catch { /* server offline */ }
    setImportedProject(null);
    setUploadResult(null);
    setLimitWarningDismissed(false);
    setView('landing');
  };

  // Import handlers - dual mode
  const handleImport = (result: UploadResult) => {
    setUploadResult(result);
    setView('analyzing');
  };

  const handleDemoImport = () => {
    setUploadResult(null);
    setView('analyzing');
  };

  const handleAnalysisComplete = (project?: Project, detection?: { generatorId?: string; generatorConfidence?: string; generatorNotice?: string }) => {
    if (detection?.generatorId) setGeneratorId(detection.generatorId);
    if (detection?.generatorConfidence) setGeneratorConfidence(detection.generatorConfidence);
    if (detection?.generatorNotice) setGeneratorNotice(detection.generatorNotice);
    if (project) {
      // Real imported project
      setImportedProject(project);
      setContentTypes(project.contentTypes);
      setActivePage(project.pages[0] ?? { id: 'empty', name: 'Home', path: '/', seoStatus: 'missing' as const, sections: [] });
      setActiveContentTypeId(project.contentTypes[0]?.id ?? '');
      setActiveSector(project.sectors[0]);
      setBannerDismissed(true); // Skip setup banner for imported projects
    }
    setView('dashboard');
  };

  // CMS → source code sync for imported projects
  const prevContentTypesRef = useRef(contentTypes);
  useEffect(() => { prevContentTypesRef.current = contentTypes; }, [contentTypes]);

  const syncCMSToSource = useCallback(async (updated: ContentType[], prev: ContentType[]) => {
    if (!isImported) return;

    // Quick dirty check — skip if nothing changed
    let hasChanges = false;
    outer: for (const ct of updated) {
      const prevCt = prev.find(p => p.id === ct.id);
      if (!prevCt) { hasChanges = true; break; }
      for (const item of ct.items) {
        const prevItem = prevCt.items.find(p => p.id === item.id);
        if (!prevItem) { hasChanges = true; break outer; }
        for (const [k, v] of Object.entries(item.data)) {
          if (v !== prevItem.data[k]) { hasChanges = true; break outer; }
        }
      }
    }
    if (!hasChanges) return;

    // New strategy: send full CMS state to server.
    // Server writes to .sol-cms.json, preview server injects window.__HP_DATA on next load.
    // No rebuild needed — Phase 2 injector already modified source arrays to use __HP_DATA.
    fetch('/api/source/cms-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentTypes: updated }),
    })
      .then(r => r.json())
      .then((data: { ok: boolean }) => { if (data.ok) setPreviewVersion(v => v + 1); })
      .catch(() => {});
  }, [isImported]);

  // CMS data mutation - single source of truth
  const handleContentItemsChange = (typeId: string, items: ContentItem[]) => {
    const prev = prevContentTypesRef.current;
    const updated = prev.map(ct => ct.id === typeId ? { ...ct, items } : ct);
    setContentTypes(updated);
    // Sync changes to source files (async, non-blocking)
    syncCMSToSource(updated, prev);
  };

  // Live canvas sync when a CMS item is saved in the editor
  const handleItemSave = useCallback((_typeId: string, item: ContentItem, changedFields: Record<string, unknown>) => {
    const ct = contentTypes.find(c => c.id === _typeId);
    if (!ct) return;
    // varName: prefer explicit, then sourceBindings (set by server for pre-varName analyses), then id
    const varName = ct.varName || (ct as any).sourceBindings?.varName || ct.id;
    const index = ct.items.findIndex(i => i.id === item.id);
    if (index === -1) return;

    // Broadcast sol:cms-update for each changed field so the iframe preview updates live
    // PageEditor listens for 'sol:cms-update' and forwards as postMessage to the iframe
    for (const [key, value] of Object.entries(changedFields)) {
      if (typeof value === 'string') {
        window.dispatchEvent(new CustomEvent('sol:cms-update', {
          detail: { field: `${varName}.${index}.${key}`, value },
        }));
      }
    }
  }, [contentTypes]);

  // Click dynamic CMS element in preview → open CMS item editor
  const handleOpenCMSItem = (contentTypeId: string, itemId: string) => {
    setActiveContentTypeId(contentTypeId);
    setEditItemId(itemId);
    setMainView('cms-table');
  };

  // Listen for canvas edits on data-sol-field elements → update CMS state
  useEffect(() => {
    if (!isImported) return;
    const handler = (e: Event) => {
      const { field, value } = (e as CustomEvent<{ field: string; value: string }>).detail;
      // field format: "varName.index.fieldName"
      const parts = field.split('.');
      if (parts.length < 3) return;
      const [varName, indexStr, ...fieldParts] = parts;
      const index = parseInt(indexStr);
      const fieldName = fieldParts.join('.');
      if (isNaN(index)) return;

      setContentTypes(prev => {
        const ct = prev.find(c =>
          c.varName === varName ||
          (c as any).sourceBindings?.varName === varName ||
          c.id === varName
        );
        if (!ct || !ct.items[index]) return prev;
        return prev.map(c => {
          if (c.id !== ct.id) return c;
          return {
            ...c,
            items: c.items.map((item, i) =>
              i === index ? { ...item, data: { ...item.data, [fieldName]: value } } : item
            ),
          };
        });
      });
    };
    window.addEventListener('sol:field-changed', handler);
    return () => window.removeEventListener('sol:field-changed', handler);
  }, [isImported]);

  const handleSendMessage = (text: string) => {
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setTimeout(() => {
      const reply: ChatMessage = { id: (Date.now() + 1).toString(), role: 'assistant', content: `I can help you with that. Let me look into "${text}" for your project.`, timestamp: Date.now() };
      setMessages(prev => [...prev, reply]);
    }, 1000);
  };

  if (view === 'landing') return <Landing onImport={handleImport} />;
  if (view === 'analyzing') {
    return (
      <AnalysisView
        onComplete={handleAnalysisComplete}
        polling={uploadResult !== null}
        fileCount={uploadResult?.fileCount}
      />
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-bg overflow-hidden">
      <TopBar
        projectName={currentProject.name}
        theme={theme}
        onThemeToggle={toggleTheme}
        onDeploy={() => setShowLaunchReadiness(true)}
        onNewProject={handleNewProject}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        generatorId={generatorId}
        generatorConfidence={generatorConfidence}
      />
      {/* Generator notice — shown for generators with backend dependencies (e.g. Base44) */}
      {generatorNotice && isImported && (
        <div className="mx-4 mt-2 flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-400">
          <span className="shrink-0 mt-0.5">⚠</span>
          <span>{generatorNotice}</span>
        </div>
      )}
      <AnimatePresence>
        {!bannerDismissed && !setupComplete && (
          <SetupBanner
            onDismiss={() => setBannerDismissed(true)}
            onComplete={() => {
              setSetupComplete(true);
              setBannerDismissed(true);
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showLimitWarning && limitWarning && (
          <LimitWarningBanner
            warning={limitWarning}
            onDismiss={() => setLimitWarningDismissed(true)}
            onRetry={handleNewProject}
          />
        )}
      </AnimatePresence>
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          pages={currentProject.pages}
          contentTypes={contentTypes}
          sectors={currentProject.sectors}
          activePage={activePage}
          activeContentType={activeContentType}
          activeSector={activeSector}
          mainView={mainView}
          activeTab={activeTab}
          aiInsights={currentProject.aiInsights}
          onPageSelect={handlePageSelect}
          onContentSelect={handleContentSelect}
          onSectorSelect={handleSectorSelect}
          onChatToggle={() => setChatOpen(!chatOpen)}
          chatOpen={chatOpen}
        />
        <main className="flex-1 overflow-y-auto">
          {mainView === 'page-editor' && (
            <PageEditor
              page={activePage}
              contentTypes={contentTypes}
              onOpenCMSItem={handleOpenCMSItem}
              isImported={isImported}
              previewVersion={previewVersion}
              onNavigateTo={(href) => {
                // Design mode navigation: find matching page and select it in sidebar
                // without navigating the iframe (bridge has already blocked it)
                const normalized = href.startsWith('/') ? href : '/' + href;
                const match = currentProject.pages.find(p =>
                  p.path === normalized ||
                  p.path === href ||
                  (p.navigateTo && (p.navigateTo === href || p.navigateTo === normalized))
                );
                if (match) handlePageSelect(match);
              }}
            />
          )}
          {mainView === 'cms-table' && (
            <CMSTableView
              contentTypes={contentTypes}
              activeType={activeContentType}
              onTypeChange={(ct) => { setActiveContentTypeId(ct.id); setEditItemId(null); }}
              onItemsChange={handleContentItemsChange}
              onItemSave={handleItemSave}
              initialEditItemId={editItemId}
            />
          )}
          {mainView === 'tech-detail' && <TechDetailView sector={activeSector} />}
        </main>
        <AnimatePresence>
          {chatOpen && (
            <ChatPanel
              messages={messages}
              onSend={handleSendMessage}
              onClose={() => setChatOpen(false)}
            />
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {showLaunchReadiness && (
          <LaunchReadiness
            sectors={currentProject.sectors}
            readinessScore={currentProject.readinessScore}
            onClose={() => setShowLaunchReadiness(false)}
            onDeploy={() => setShowLaunchReadiness(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
