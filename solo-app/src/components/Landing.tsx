import { useState, useRef, useCallback } from 'react';
import { Upload, Globe, Shield, BarChart3, Sparkles, Loader2 } from 'lucide-react';
import SolLogo from './SolLogo';
import type { UploadResult } from '../data/types';

interface LandingProps {
  onImport: (result: UploadResult) => void;
}

const features = [
  { icon: Globe, label: '10 Sector Nodes' },
  { icon: Sparkles, label: 'AI Agents' },
  { icon: Shield, label: 'Security First' },
  { icon: BarChart3, label: 'Readiness Score' },
];

export default function Landing({ onImport }: LandingProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      setError('Please upload a .zip file');
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(data.error || 'Upload failed');
      }

      const result: UploadResult = await res.json();
      onImport(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setUploading(false);
    }
  }, [onImport]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  }, []);

  const handleClick = () => fileInputRef.current?.click();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

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
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={handleInputChange}
        />
        <button
          onClick={handleClick}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          disabled={uploading}
          className={`animate-fade-up-3 mt-12 flex w-full max-w-lg cursor-pointer flex-col items-center rounded-xl border-2 border-dashed p-12 transition-colors ${
            dragging
              ? 'border-accent bg-accent/5'
              : 'border-border bg-bg-card/50 hover:border-accent/50 hover:bg-bg-card'
          } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
        >
          {uploading ? (
            <Loader2 className="h-10 w-10 animate-spin text-accent" />
          ) : (
            <Upload className="h-10 w-10 text-text-muted" />
          )}
          <p className="mt-4 font-medium text-text">
            {uploading ? 'Uploading & extracting...' : 'Drop your project .zip here'}
          </p>
          <p className="mt-2 text-sm text-text-secondary">
            {uploading ? 'This may take a moment' : 'Or click to browse - static sites, built SPAs, exported projects'}
          </p>
        </button>

        {error && (
          <p className="mt-4 text-sm text-status-red">{error}</p>
        )}

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
