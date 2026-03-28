import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { AppView, MainView, ThemeMode, Page, TechSector, ContentType, ContentItem, ChatMessage, Project, UploadResult } from './data/types';
import { sampleProject, analysisSteps } from './data/sampleProject';
import Landing from './components/Landing';
import AnalysisView from './components/AnalysisView';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import SetupBanner from './components/SetupBanner';
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

  // Derive activeContentType from mutable state
  const activeContentType = contentTypes.find(ct => ct.id === activeContentTypeId) ?? contentTypes[0];

  // Set initial theme on mount
  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Theme toggle - applies class to html element and persists
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.classList.toggle('light', next === 'light');
    localStorage.setItem('sol-theme', next);
  };

  const handlePageSelect = (page: Page) => {
    setActivePage(page);
    setMainView('page-editor');
  };

  const handleContentSelect = (ct: ContentType) => {
    setActiveContentTypeId(ct.id);
    setMainView('cms-table');
    setEditItemId(null);
  };

  const handleSectorSelect = (sector: TechSector) => {
    setActiveSector(sector);
    setMainView('tech-detail');
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

  const handleAnalysisComplete = (project?: Project) => {
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

    // Compute field-level diffs
    const changes: { contentTypeId: string; itemId: string; fieldName: string; newValue: string }[] = [];
    for (const ct of updated) {
      const prevCt = prev.find(p => p.id === ct.id);
      if (!prevCt) continue;
      for (const item of ct.items) {
        const prevItem = prevCt.items.find(p => p.id === item.id);
        if (!prevItem) continue;
        for (const [fieldName, value] of Object.entries(item.data)) {
          if (typeof value === 'string' && value !== prevItem.data[fieldName]) {
            changes.push({ contentTypeId: ct.id, itemId: item.id, fieldName, newValue: value });
          }
        }
      }
    }
    if (changes.length === 0) return;

    try {
      const res = await fetch('/api/source/cms-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes }),
      });
      const data = await res.json();
      if (data.ok) {
        // Rebuild is done, bump version so PageEditor reloads iframe
        setPreviewVersion(v => v + 1);
      }
    } catch { /* server offline */ }
  }, [isImported]);

  // CMS data mutation - single source of truth
  const handleContentItemsChange = (typeId: string, items: ContentItem[]) => {
    const prev = prevContentTypesRef.current;
    const updated = prev.map(ct => ct.id === typeId ? { ...ct, items } : ct);
    setContentTypes(updated);
    // Sync changes to source files (async, non-blocking)
    syncCMSToSource(updated, prev);
  };

  // Click dynamic CMS element in preview → open CMS item editor
  const handleOpenCMSItem = (contentTypeId: string, itemId: string) => {
    setActiveContentTypeId(contentTypeId);
    setEditItemId(itemId);
    setMainView('cms-table');
  };

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
        steps={analysisSteps}
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
        readinessScore={currentProject.readinessScore}
        theme={theme}
        onThemeToggle={toggleTheme}
        onChatToggle={() => setChatOpen(!chatOpen)}
        onDeploy={() => setShowLaunchReadiness(true)}
      />
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
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          pages={currentProject.pages}
          contentTypes={contentTypes}
          sectors={currentProject.sectors}
          activePage={activePage}
          activeContentType={activeContentType}
          activeSector={activeSector}
          mainView={mainView}
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
            />
          )}
          {mainView === 'cms-table' && (
            <CMSTableView
              contentTypes={contentTypes}
              activeType={activeContentType}
              onTypeChange={(ct) => { setActiveContentTypeId(ct.id); setEditItemId(null); }}
              onItemsChange={handleContentItemsChange}
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
