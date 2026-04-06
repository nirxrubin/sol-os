import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Rocket, X, CheckCircle2, Circle, ChevronDown, ChevronUp, Sparkles, Zap, Shield, ArrowRight, Search, Globe, SlidersHorizontal, ArrowLeft } from 'lucide-react';
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

type DeployStep = 'bundle' | 'custom-stack' | 'domain';

// Friendly sector labels for custom stack builder
const sectorLabels: Record<string, { question: string; description: string }> = {
  hosting: { question: 'Where should your site live?', description: 'This is where your website files are served from' },
  domain: { question: 'Domain & DNS', description: 'How visitors find your site' },
  database: { question: 'Need a database?', description: 'Store user data, content, and more' },
  security: { question: 'Security & SSL', description: 'Keep your site and visitors safe' },
  cms: { question: 'Content management', description: 'How you update your site content' },
  analytics: { question: 'Visitor analytics', description: 'Understand who visits your site' },
  seo: { question: 'Search visibility', description: 'Help people find you on Google' },
  aeo: { question: 'AI visibility', description: 'Help AI tools recommend your site' },
  assets: { question: 'Images & media', description: 'Optimize and serve your images' },
  legal: { question: 'Legal pages', description: 'Privacy policy, terms of service' },
};

// All available providers per sector for custom builder
const sectorProviders: Record<string, { name: string; price: string }[]> = {
  hosting: [
    { name: 'Netlify', price: 'Free' },
    { name: 'Vercel', price: '$20/mo' },
    { name: 'AWS Amplify', price: '$15/mo' },
  ],
  domain: [
    { name: 'Cloudflare', price: 'Free DNS' },
    { name: 'Route 53', price: '$0.50/zone' },
  ],
  database: [
    { name: 'None', price: 'Free' },
    { name: 'Supabase', price: 'Free tier' },
    { name: 'Supabase Pro', price: '$25/mo' },
  ],
  security: [
    { name: "Let's Encrypt", price: 'Free' },
    { name: 'Cloudflare SSL', price: 'Free' },
    { name: 'Cloudflare Pro', price: '$20/mo' },
  ],
  analytics: [
    { name: 'None', price: 'Free' },
    { name: 'Plausible', price: 'Free' },
    { name: 'PostHog', price: 'Free tier' },
  ],
  assets: [
    { name: 'Built-in CDN', price: 'Free' },
    { name: 'Cloudinary', price: 'Free tier' },
  ],
};

// Fake domain search results
const fakeDomainResults = [
  { domain: '', ext: '.com', available: true, price: '$12/yr' },
  { domain: '', ext: '.io', available: true, price: '$39/yr' },
  { domain: '', ext: '.co', available: false, price: '$25/yr' },
  { domain: '', ext: '.app', available: true, price: '$14/yr' },
  { domain: '', ext: '.dev', available: true, price: '$12/yr' },
];

export default function LaunchReadiness({
  sectors,
  readinessScore,
  onClose,
  onDeploy,
}: LaunchReadinessProps) {
  const [selectedBundle, setSelectedBundle] = useState<BundleTier>('pro');
  const [expandedBundle, setExpandedBundle] = useState<BundleTier | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [step, setStep] = useState<DeployStep>('bundle');

  // Domain state
  const [domainQuery, setDomainQuery] = useState('');
  const [domainSearched, setDomainSearched] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [useExisting, setUseExisting] = useState(false);
  const [existingDomain, setExistingDomain] = useState('');

  // Custom stack state
  const [customSelections, setCustomSelections] = useState<Record<string, string>>({
    hosting: 'Vercel',
    domain: 'Cloudflare',
    database: 'None',
    security: 'Cloudflare SSL',
    analytics: 'PostHog',
    assets: 'Cloudinary',
  });

  const handleDeploy = () => {
    setDeploying(true);
    setTimeout(() => {
      onDeploy();
    }, 1500);
  };

  const activeBundle = deployBundles.find(b => b.id === selectedBundle)!;

  const handleDomainSearch = () => {
    if (domainQuery.trim()) {
      setDomainSearched(true);
    }
  };

  // -- DOMAIN STEP --
  if (step === 'domain') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-bg-card shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-8 py-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setStep('bundle')}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-hover hover:text-text"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div>
                <h2 className="font-heading text-xl font-semibold text-text">Choose your website address</h2>
                <p className="text-sm text-text-secondary">Search for a domain or connect one you own</p>
              </div>
            </div>
            <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-hover hover:text-text" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-8 py-6 space-y-6">
            {/* Free subdomain note */}
            <div className="rounded-xl bg-status-green/5 border border-status-green/20 px-5 py-3">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-status-green" />
                <p className="text-sm text-text">
                  Your site is already live at <span className="font-mono font-medium text-status-green">yourproject.hostaposta.app</span>
                </p>
              </div>
            </div>

            {/* Toggle: search vs connect existing */}
            <div className="flex gap-2">
              <button
                onClick={() => setUseExisting(false)}
                className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                  !useExisting ? 'border-accent bg-accent/5 text-accent' : 'border-border text-text-secondary hover:border-accent/40'
                }`}
              >
                Get a new domain
              </button>
              <button
                onClick={() => setUseExisting(true)}
                className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                  useExisting ? 'border-accent bg-accent/5 text-accent' : 'border-border text-text-secondary hover:border-accent/40'
                }`}
              >
                I already own a domain
              </button>
            </div>

            {!useExisting ? (
              <>
                {/* Domain search */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                    <input
                      type="text"
                      value={domainQuery}
                      onChange={(e) => { setDomainQuery(e.target.value); setDomainSearched(false); }}
                      onKeyDown={(e) => e.key === 'Enter' && handleDomainSearch()}
                      placeholder="Search for a domain name..."
                      className="w-full rounded-lg border border-border bg-bg py-2.5 pl-10 pr-4 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={handleDomainSearch}
                    disabled={!domainQuery.trim()}
                    className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-brand-950 transition-colors hover:bg-accent-hover disabled:opacity-40"
                  >
                    Search
                  </button>
                </div>

                {/* Results */}
                {domainSearched && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-2"
                  >
                    {fakeDomainResults.map(({ ext, available, price }) => {
                      const full = domainQuery.replace(/\..+$/, '') + ext;
                      const isSelected = selectedDomain === full;
                      return (
                        <button
                          key={ext}
                          disabled={!available}
                          onClick={() => setSelectedDomain(isSelected ? null : full)}
                          className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors ${
                            isSelected
                              ? 'border-accent bg-accent/5'
                              : available
                                ? 'border-border hover:border-accent/40'
                                : 'border-border opacity-50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {isSelected ? (
                              <CheckCircle2 className="h-4 w-4 text-accent" />
                            ) : available ? (
                              <Circle className="h-4 w-4 text-text-muted" />
                            ) : (
                              <X className="h-4 w-4 text-status-red" />
                            )}
                            <span className={`text-sm font-medium ${available ? 'text-text' : 'text-text-muted line-through'}`}>
                              {full}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-text-secondary">{price}</span>
                            {available ? (
                              <span className="text-[10px] font-medium text-status-green">Available</span>
                            ) : (
                              <span className="text-[10px] font-medium text-status-red">Taken</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </>
            ) : (
              /* Connect existing domain */
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text">Your domain</label>
                  <input
                    type="text"
                    value={existingDomain}
                    onChange={(e) => setExistingDomain(e.target.value)}
                    placeholder="example.com"
                    className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
                  />
                </div>

                {existingDomain.trim() && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-border bg-bg-elevated p-5 space-y-3"
                  >
                    <p className="text-sm font-medium text-text">Connect in 2 minutes</p>
                    <p className="text-xs text-text-secondary">
                      Go to your domain registrar and update the nameservers to:
                    </p>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 rounded-md bg-bg px-3 py-2 font-mono text-xs text-text">
                        <span className="text-text-muted">NS1:</span> ada.ns.cloudflare.com
                      </div>
                      <div className="flex items-center gap-2 rounded-md bg-bg px-3 py-2 font-mono text-xs text-text">
                        <span className="text-text-muted">NS2:</span> bob.ns.cloudflare.com
                      </div>
                    </div>
                    <p className="text-[11px] text-text-muted">
                      Changes usually take effect within a few minutes. HostaPosta will handle SSL and all DNS settings automatically.
                    </p>
                  </motion.div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border px-8 py-5">
            <div className="flex items-center justify-between">
              <p className="text-xs text-text-muted">
                {selectedDomain
                  ? `Selected: ${selectedDomain}`
                  : useExisting && existingDomain.trim()
                    ? `Connecting: ${existingDomain}`
                    : 'You can always add a domain later'}
              </p>
              <button
                onClick={() => setStep('bundle')}
                className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-brand-950 transition-all hover:bg-accent-hover"
              >
                <span>{selectedDomain || (useExisting && existingDomain.trim()) ? 'Continue' : 'Skip for now'}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // -- CUSTOM STACK STEP --
  if (step === 'custom-stack') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-bg-card shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-8 py-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setStep('bundle')}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-hover hover:text-text"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div>
                <h2 className="font-heading text-xl font-semibold text-text">Build your own setup</h2>
                <p className="text-sm text-text-secondary">Pick the tools that work best for you</p>
              </div>
            </div>
            <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-hover hover:text-text" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-8 py-6 space-y-5">
            {Object.entries(sectorProviders).map(([sectorId, providers]) => {
              const labels = sectorLabels[sectorId] ?? { question: sectorId, description: '' };
              const selected = customSelections[sectorId] ?? providers[0].name;
              return (
                <div key={sectorId}>
                  <div className="mb-2">
                    <p className="text-sm font-medium text-text">{labels.question}</p>
                    <p className="text-xs text-text-muted">{labels.description}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {providers.map((p) => (
                      <button
                        key={p.name}
                        onClick={() => setCustomSelections(prev => ({ ...prev, [sectorId]: p.name }))}
                        className={`rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors ${
                          selected === p.name
                            ? 'border-accent bg-accent/5 text-accent'
                            : 'border-border text-text-secondary hover:border-accent/40'
                        }`}
                      >
                        {p.name} <span className="text-text-muted ml-1">{p.price}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Explainer */}
          <div className="mx-8 mb-4 rounded-xl bg-accent/5 border border-accent/20 px-5 py-3">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <p className="text-xs text-text-secondary">
                HostaPosta manages every tool you pick. No accounts to create, no setup to do. Just choose and deploy.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border px-8 py-5">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep('bundle')}
                className="text-sm text-text-secondary hover:text-text transition-colors"
              >
                Back to bundles
              </button>
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
                    <span>Publish with custom setup</span>
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

  // -- BUNDLE SELECTION STEP (default) --
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
              <h2 className="font-heading text-xl font-semibold text-text">Publish your site</h2>
              <p className="text-sm text-text-secondary">
                Choose your stack — HostaPosta handles everything else
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

        {/* Domain + HostaPosta info row */}
        <div className="px-8 mt-6 flex gap-4">
          {/* Domain CTA */}
          <button
            onClick={() => setStep('domain')}
            className="flex-1 flex items-center gap-3 rounded-xl border border-border px-5 py-3.5 text-left transition-colors hover:border-accent/40 hover:bg-accent/5"
          >
            <Globe className="h-4 w-4 shrink-0 text-accent" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text">
                {selectedDomain
                  ? selectedDomain
                  : useExisting && existingDomain.trim()
                    ? existingDomain
                    : 'Choose a domain'}
              </p>
              <p className="text-xs text-text-muted truncate">
                {selectedDomain || (useExisting && existingDomain.trim())
                  ? 'Click to change'
                  : 'Get a new one or connect yours'}
              </p>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-text-muted" />
          </button>

          {/* HostaPosta explainer */}
          <div className="flex-1 rounded-xl bg-accent/5 border border-accent/20 px-5 py-3.5">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <div>
                <p className="text-sm font-medium text-text">HostaPosta manages everything</p>
                <p className="text-xs text-text-muted">
                  No accounts to create. Pick a bundle and deploy.
                </p>
              </div>
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

        {/* Custom stack link */}
        <div className="px-8 pt-2 pb-1">
          <button
            onClick={() => setStep('custom-stack')}
            className="flex items-center gap-2 text-xs text-text-muted hover:text-accent transition-colors"
          >
            <SlidersHorizontal className="h-3 w-3" />
            <span>Want to pick your own tools? Build a custom setup</span>
          </button>
        </div>

        {/* Selected bundle summary + deploy */}
        <div className="mx-8 mt-3 mb-6 rounded-xl border border-border bg-bg-elevated p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-heading text-sm font-semibold text-text">
                  {activeBundle.name} Bundle
                </span>
                <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-[10px] font-medium text-accent">
                  {activeBundle.providers.length} services managed by HostaPosta
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
                  <span>Publish Now</span>
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
