import { Upload, Globe, Shield, BarChart3, Sparkles } from 'lucide-react';
import SolLogo from './SolLogo';

interface LandingProps {
  onImport: () => void;
}

const features = [
  { icon: Globe, label: '10 Sector Nodes' },
  { icon: Sparkles, label: 'AI Agents' },
  { icon: Shield, label: 'Security First' },
  { icon: BarChart3, label: 'Readiness Score' },
];

export default function Landing({ onImport }: LandingProps) {
  return (
    <div className="flex h-full w-full flex-col bg-bg">
      {/* Top-left logo */}
      <div className="px-8 pt-6">
        <div className="flex items-center gap-2">
          <SolLogo className="h-6 w-auto text-text" />
        </div>
      </div>

      {/* Center content */}
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        {/* Pill chip */}
        <div className="animate-fade-up flex items-center gap-2 rounded-full border border-border px-4 py-1.5">
          <span className="text-[13px] text-text-secondary">AI-Native Launch Platform</span>
        </div>

        {/* Main headline */}
        <h1 className="animate-fade-up-1 mt-8 text-center font-heading text-4xl font-light leading-tight text-text md:text-5xl lg:text-6xl">
          From prototype to
          <br />
          <span className="text-accent">production</span>, intelligently.
        </h1>

        {/* Subtitle */}
        <p className="animate-fade-up-2 mx-auto mt-5 max-w-xl text-center text-base text-text-secondary">
          Upload your project. Get an intelligent launch canvas with every sector analyzed,
          configured, and ready for deployment.
        </p>

        {/* Upload area */}
        <button
          onClick={onImport}
          className="animate-fade-up-3 mt-12 flex w-full max-w-lg cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-border bg-bg-card/50 p-12 transition-colors hover:border-accent/50 hover:bg-bg-card"
        >
          <Upload className="h-10 w-10 text-text-muted" />
          <p className="mt-4 font-medium text-text">Drop your project files here</p>
          <p className="mt-2 text-sm text-text-secondary">
            Prototypes, exports, designs, sitemaps, screenshots, or content
          </p>
        </button>

        {/* Bottom feature pills */}
        <div className="animate-fade-up-4 mt-16 flex flex-wrap justify-center gap-8">
          {features.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 text-sm text-text-muted">
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
