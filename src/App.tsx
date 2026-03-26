import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { AppView, MainView, ThemeMode, Page, TechSector, ContentType, ChatMessage } from './data/types';
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
  const [activePage, setActivePage] = useState<Page>(sampleProject.pages[0]);
  const [activeContentType, setActiveContentType] = useState<ContentType>(sampleProject.contentTypes[0]);
  const [activeSector, setActiveSector] = useState<TechSector>(sampleProject.sectors[0]);
  const [chatOpen, setChatOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const [showLaunchReadiness, setShowLaunchReadiness] = useState(false);

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
    setActiveContentType(ct);
    setMainView('cms-table');
  };

  const handleSectorSelect = (sector: TechSector) => {
    setActiveSector(sector);
    setMainView('tech-detail');
  };

  const handleImport = () => setView('analyzing');
  const handleAnalysisComplete = () => setView('dashboard');

  const handleSendMessage = (text: string) => {
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setTimeout(() => {
      const reply: ChatMessage = { id: (Date.now() + 1).toString(), role: 'assistant', content: `I can help you with that. Let me look into "${text}" for your project.`, timestamp: Date.now() };
      setMessages(prev => [...prev, reply]);
    }, 1000);
  };

  if (view === 'landing') return <Landing onImport={handleImport} />;
  if (view === 'analyzing') return <AnalysisView steps={analysisSteps} onComplete={handleAnalysisComplete} />;

  return (
    <div className="flex h-screen w-screen flex-col bg-bg overflow-hidden">
      <TopBar
        projectName={sampleProject.name}
        readinessScore={sampleProject.readinessScore}
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
          pages={sampleProject.pages}
          contentTypes={sampleProject.contentTypes}
          sectors={sampleProject.sectors}
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
          {mainView === 'page-editor' && <PageEditor page={activePage} />}
          {mainView === 'cms-table' && (
            <CMSTableView
              contentTypes={sampleProject.contentTypes}
              activeType={activeContentType}
              onTypeChange={setActiveContentType}
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
            sectors={sampleProject.sectors}
            readinessScore={sampleProject.readinessScore}
            onClose={() => setShowLaunchReadiness(false)}
            onDeploy={() => setShowLaunchReadiness(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
