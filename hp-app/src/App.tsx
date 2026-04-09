import { useState, useEffect } from 'react';
import type { AppView, ThemeMode, Project, UploadResult } from './data/types';
import { API } from './lib/api';
import Landing from './components/Landing';
import AnalysisView from './components/AnalysisView';
import TopBar from './components/TopBar';
import ProjectDashboard from './components/ProjectDashboard';

export default function App() {
  const [view, setView] = useState<AppView>('landing');
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem('hp-theme');
    return (stored === 'dark' || stored === 'light') ? stored : 'light';
  });

  const [importedProject, setImportedProject] = useState<Project | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [deployUrl, setDeployUrl] = useState<string | undefined>(undefined);
  const [generatorId, setGeneratorId] = useState<string | undefined>(undefined);

  // On mount: apply theme + check if server already has a completed analysis
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    fetch(`${API}/api/analysis`)
      .then(r => r.json())
      .then((data: { status: string; project?: Project; generatorId?: string }) => {
        if (data.generatorId) setGeneratorId(data.generatorId);
        if (data.status === 'complete' && data.project) {
          setImportedProject(data.project);
          setView('dashboard');
        }
      })
      .catch(() => { /* server offline — stay on landing */ });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    localStorage.setItem('hp-theme', next);
  };

  // Reset to landing — clears server workspace
  const handleNewProject = async () => {
    try { await fetch(`${API}/api/reset`, { method: 'POST' }); } catch { /* server offline */ }
    setImportedProject(null);
    setUploadResult(null);
    setDeployUrl(undefined);
    setGeneratorId(undefined);
    setView('landing');
  };

  const handleImport = (result: UploadResult) => {
    setUploadResult(result);
    setView('analyzing');
  };

  const handleAnalysisComplete = (
    project?: Project,
    detection?: { generatorId?: string; generatorConfidence?: string; generatorNotice?: string }
  ) => {
    if (detection?.generatorId) setGeneratorId(detection.generatorId);
    if (project) {
      setImportedProject(project);
    }
    setView('dashboard');
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

  // Dashboard view
  const currentProject = importedProject!;

  return (
    <div className="flex h-screen w-screen flex-col bg-bg overflow-hidden">
      <TopBar
        projectName={currentProject.name}
        theme={theme}
        onThemeToggle={toggleTheme}
        onNewProject={handleNewProject}
      />
      <div className="flex flex-1 overflow-hidden">
        <ProjectDashboard
          project={currentProject}
          generatorId={generatorId}
          deployUrl={deployUrl}
          onDeployUrl={setDeployUrl}
        />
      </div>
    </div>
  );
}
