import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Rocket, X, CheckCircle2, Circle, ChevronDown, ChevronUp, Sparkles, Zap, Shield, ArrowRight } from 'lucide-react';
import type { TechSector, DeployBundle, BundleTier } from '../data/types';
import { deployBundles } from '../data/bundles';

interface LaunchReadinessProps {
  sectors: TechSector[];
  readinessScore: number;
  onClose: () => void;
  onDeploy: () => void;
}

const tierIcons: Record<BundleTier, React.ReactNode> = {
  starter: <Zap className="h-5 w-5" />,
  pro: <Sparkles className="h-5 w-5" />,
  scale: <Shield className="h-5 w-5" />,
};

export default function LaunchReadiness({
  sectors,
  readinessScore,
  onClose,
  onDeploy,
}: LaunchReadinessProps) {
  const [selectedBundle, setSelectedBundle] = useState<BundleTier>('pro');
  const [expandedBundle, setExpandedBundle] = useState<BundleTier | null>(null);
  const [deploying, setDeploying] = useState(false);

  const handleDeploy = () => {
    setDeploying(true);
    // Simulate deploy initiation
    setTimeout(() => {
      onDeploy();
    }, 1500);
  };

  const activeBundle = deployBundles.find(b => b.id === selectedBundle)!;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-border bg-bg-card shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-8 py-6">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10">
              <Rocket className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h2 className="font-heading text-xl font-semibold text-text">Deploy to Production</h2>
              <p className="text-sm text-text-secondary">
                Choose your stack - Sol OS handles everything else
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-hover hover:text-text"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Sol OS middleman explainer */}
        <div className="mx-8 mt-6 rounded-xl bg-accent/5 border border-accent/20 px-5 py-4">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <div>
              <p className="text-sm font-medium text-text">Sol OS manages everything for you</p>
              <p className="mt-1 text-xs text-text-secondary leading-relaxed">
                No need to create accounts with Vercel, Cloudflare, or any provider.
                Sol OS connects all services through a single managed account - you just pick your bundle and deploy.
              </p>
            </div>
          </div>
        </div>

        {/* Bundle Cards */}
        <div className="grid grid-cols-3 gap-4 px-8 pt-6 pb-2">
          {deployBundles.map((bundle) => {
            const isSelected = selectedBundle === bundle.id;
            const isExpanded = expandedBundle === bundle.id;

            return (
              <div
                key={bundle.id}
                className="flex flex-col"
              >
                {/* Bundle Card */}
                <button
                  type="button"
                  onClick={() => setSelectedBundle(bundle.id)}
                  className={`relative flex flex-col rounded-xl border p-5 text-left transition-all duration-200 ${
                    isSelected
                      ? 'border-accent bg-accent/5 shadow-lg shadow-accent/5'
                      : 'border-border bg-bg-card hover:border-accent/40'
                  }`}
                >
                  {bundle.recommended && (
                    <span className="absolute -top-2.5 right-4 rounded-full bg-accent px-3 py-0.5 text-[10px] font-semibold text-brand-950">
                      Recommended
                    </span>
                  )}

                  <div className="flex items-center gap-2.5 mb-2">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      isSelected ? 'bg-accent/20 text-accent' : 'bg-bg-elevated text-text-muted'
                    }`}>
                      {tierIcons[bundle.id]}
                    </div>
                    <h3 className="font-heading text-lg font-semibold text-text">{bundle.name}</h3>
                  </div>

                  <p className="text-xs text-text-secondary mb-4">{bundle.tagline}</p>

                  <div className="flex items-baseline gap-1 mb-4">
                    <span className="font-heading text-3xl font-bold text-text">{bundle.price}</span>
                    <span className="text-sm text-text-muted">{bundle.priceNote}</span>
                  </div>

                  {/* Provider list (compact) */}
                  <div className="space-y-1.5 mb-3">
                    {bundle.providers.slice(0, 4).map((p) => (
                      <div key={p.sectorId} className="flex items-center gap-2">
                        <CheckCircle2 className={`h-3 w-3 shrink-0 ${isSelected ? 'text-accent' : 'text-text-muted'}`} />
                        <span className="text-xs text-text-secondary truncate">
                          <span className="text-text font-medium">{p.providerName}</span>
                          {' '}· {p.sectorName}
                        </span>
                      </div>
                    ))}
                    {bundle.providers.length > 4 && (
                      <div className="flex items-center gap-2">
                        <Circle className="h-3 w-3 shrink-0 text-text-muted" />
                        <span className="text-xs text-text-muted">
                          +{bundle.providers.length - 4} more services
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Expand toggle */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedBundle(isExpanded ? null : bundle.id);
                    }}
                    className="mt-auto flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors"
                  >
                    {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {isExpanded ? 'Less details' : 'View all details'}
                  </button>
                </button>

                {/* Expanded details */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 rounded-xl border border-border bg-bg-elevated p-4 space-y-3">
                        {/* Full provider list */}
                        <div>
                          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">
                            Included Services
                          </h4>
                          <div className="space-y-2">
                            {bundle.providers.map((p) => (
                              <div key={p.sectorId} className="flex items-start gap-2">
                                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-accent" />
                                <div>
                                  <span className="text-xs font-medium text-text">{p.providerName}</span>
                                  <p className="text-[11px] text-text-muted">{p.description}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Features */}
                        <div className="border-t border-border-subtle pt-3">
                          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">
                            Features
                          </h4>
                          <div className="space-y-1">
                            {bundle.features.map((f) => (
                              <div key={f} className="flex items-center gap-2">
                                <span className="h-1 w-1 rounded-full bg-accent shrink-0" />
                                <span className="text-xs text-text-secondary">{f}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* Selected bundle summary + deploy */}
        <div className="mx-8 mt-4 mb-6 rounded-xl border border-border bg-bg-elevated p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-heading text-sm font-semibold text-text">
                  {activeBundle.name} Bundle
                </span>
                <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-[10px] font-medium text-accent">
                  {activeBundle.providers.length} services managed by Sol
                </span>
              </div>
              <p className="mt-1 text-xs text-text-secondary">
                {activeBundle.price}{activeBundle.priceNote} · All infrastructure provisioned automatically
              </p>
            </div>

            <button
              onClick={handleDeploy}
              disabled={deploying}
              className="flex items-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-brand-950 transition-all hover:bg-accent-hover disabled:opacity-60"
            >
              {deploying ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="h-4 w-4 rounded-full border-2 border-brand-950/30 border-t-brand-950"
                  />
                  <span>Deploying...</span>
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4" />
                  <span>Deploy Now</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
