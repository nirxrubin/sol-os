import { useState, useRef, useCallback } from 'react';
import { Upload, Globe, Shield, Zap, Users, Loader2 } from 'lucide-react';
import HpLogo from './HpLogo';
import type { UploadResult } from '../data/types';

interface LandingProps {
  onImport: (result: UploadResult) => void;
}

const features = [
  { icon: Zap,    label: 'Deploy in seconds' },
  { icon: Globe,  label: 'Custom domain' },
  { icon: Shield, label: 'SSL included' },
  { icon: Users,  label: 'Client handoff' },
];

export default function Landing({ onImport }: LandingProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      setError('ZIP files only — export your project as a .zip and try again.');
      return;
    }
    if (file.size > 200 * 1024 * 1024) {
      setError('File too large — max 200 MB.');
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
        <HpLogo className="h-5 w-auto text-text" />
      </div>

      {/* Center content */}
      <div className="flex flex-1 flex-col items-center justify-center px-6">

        {/* Main headline */}
        <h1 className="animate-fade-up-1 text-center font-heading text-4xl font-light leading-tight text-text md:text-5xl lg:text-6xl">
          Your site.{' '}
          <span className="text-accent">Live.</span>
          <br />
          No accounts. No tabs.
        </h1>

        {/* Subtitle */}
        <p className="animate-fade-up-2 mx-auto mt-5 max-w-md text-center text-base text-text-secondary">
          Drop a .zip — we handle the build, the hosting, the domain, and the handoff.
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
          className={`animate-fade-up-3 mt-10 flex w-full max-w-lg cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed p-14 transition-all duration-200 ${
            dragging
              ? 'border-accent bg-accent/5 scale-[1.01]'
              : 'border-border bg-bg-card/50 hover:border-accent/50 hover:bg-bg-card'
          } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
        >
          {uploading ? (
            <Loader2 className="h-10 w-10 animate-spin text-accent" />
          ) : (
            <Upload className="h-10 w-10 text-text-muted" />
          )}

          <p className="mt-4 text-base font-medium text-text">
            {uploading ? 'Uploading…' : dragging ? 'Drop it.' : 'Drop your .zip here'}
          </p>

          {!uploading && (
            <>
              <p className="mt-1.5 text-sm text-text-secondary">or click to browse</p>
              <p className="mt-4 text-xs text-text-muted">ZIP files only · max 200 MB</p>
            </>
          )}

          {uploading && (
            <p className="mt-2 text-sm text-text-secondary">Hang tight…</p>
          )}
        </button>

        {error && (
          <p className="mt-4 max-w-lg text-center text-sm text-status-red">{error}</p>
        )}

        {/* Bottom feature pills */}
        <div className="animate-fade-up-4 mt-14 flex flex-wrap justify-center gap-8">
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
