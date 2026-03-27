import { useState, useEffect } from 'react';
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
  const [theme, setTheme] = useState<ThemeMode>('light');
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

  // Derive activeContentType from mutable state
  const activeContentType = contentTypes.find(ct => ct.id === activeContentTypeId) ?? contentTypes[0];

  // Set initial theme on mount
  useEffect(() => {
    document.documentElement.classList.add('light');
  }, []);

  // Theme toggle - applies class to html element
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.classList.toggle('light', next === 'light');
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

  // Import handlers — dual mode
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

  // CMS data mutation — single source of truth
  const handleContentItemsChange = (typeId: string, items: ContentItem[]) => {
    setContentTypes(prev =>
      prev.map(ct => ct.id === typeId ? { ...ct, items } : ct)
    );
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
