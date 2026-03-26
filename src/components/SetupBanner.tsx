import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronDown, ChevronUp, ChevronRight, Check, ArrowRight, Send, Sparkles } from 'lucide-react';

interface SetupBannerProps {
  onDismiss: () => void;
  onComplete: () => void;
}

interface StepOption {
  label: string;
  description: string;
  recommended?: boolean;
}

interface StepConfig {
  title: string;
  subtitle: string;
  options: StepOption[];
}

const steps: StepConfig[] = [
  {
    title: 'Where should your site live?',
    subtitle: "We'll handle the technical setup automatically.",
    options: [
      { label: 'Fast & Free', description: 'Great for most sites' },
      { label: 'Recommended', description: 'Best balance of speed & control', recommended: true },
      { label: 'High Traffic', description: 'For 100k+ monthly visitors' },
    ],
  },
  {
    title: 'Do you have a domain name?',
    subtitle: 'Like "yoursite.com". We\'ll connect it automatically.',
    options: [
      { label: 'Yes, I have one', description: 'Connect your existing domain' },
      { label: 'Get one for me', description: "We'll suggest available names", recommended: true },
      { label: 'Not yet', description: 'Skip for now, decide later' },
    ],
  },
  {
    title: 'How do you want to track visitors?',
    subtitle: "Know who's visiting and what they're doing.",
    options: [
      { label: 'Simple & Private', description: 'No cookies, GDPR-friendly' },
      { label: 'Full Insights', description: 'Everything including conversions', recommended: true },
      { label: 'Skip for now', description: 'Add analytics later' },
    ],
  },
];

const TOTAL_STEPS = 4;

interface AgentMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
}

const AGENT_AUTO_MESSAGES: AgentMessage[] = [
  { id: 'a1', role: 'agent', content: 'Starting auto-integration based on your selections...' },
  { id: 'a2', role: 'agent', content: '✓ Hosting provider configured — deploying to Vercel.' },
  { id: 'a3', role: 'agent', content: '✓ Domain DNS records prepared. Connect when ready.' },
  { id: 'a4', role: 'agent', content: '✓ Analytics snippet installed — privacy-first mode.' },
  { id: 'a5', role: 'agent', content: 'All integrations are set up! Your site is ready to launch. 🚀' },
];

export default function SetupBanner({ onDismiss, onComplete }: SetupBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [selections, setSelections] = useState<Record<number, number>>({});
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [agentInput, setAgentInput] = useState('');
  const [agentDone, setAgentDone] = useState(false);
  const agentEndRef = useRef<HTMLDivElement>(null);

  const completedSteps = Object.keys(selections).length;
  const progressPercent = Math.round((completedSteps / TOTAL_STEPS) * 100);

  const handleSelect = (optionIndex: number) => {
    setSelections(prev => ({ ...prev, [currentStep]: optionIndex }));
  };

  const handleNext = () => {
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleStepClick = (step: number) => {
    if (step <= completedSteps + 1) {
      setCurrentStep(step);
    }
  };

  const handleFinish = () => {
    setSelections(prev => ({ ...prev, [TOTAL_STEPS]: 0 }));
    onComplete();
  };

  const isLastStep = currentStep === TOTAL_STEPS;
  const canAdvance = currentStep in selections;

  // Auto-play agent messages when step 4 is reached
  useEffect(() => {
    if (currentStep !== TOTAL_STEPS) return;
    if (agentMessages.length > 0) return; // already started
    let index = 0;
    const timer = setInterval(() => {
      if (index < AGENT_AUTO_MESSAGES.length) {
        setAgentMessages((prev) => [...prev, AGENT_AUTO_MESSAGES[index]]);
        index++;
      } else {
        clearInterval(timer);
        setAgentDone(true);
      }
    }, 800);
    return () => clearInterval(timer);
  }, [currentStep, agentMessages.length]);

  // Auto-scroll agent chat
  useEffect(() => {
    agentEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agentMessages]);

  const handleAgentSend = () => {
    const trimmed = agentInput.trim();
    if (!trimmed) return;
    const userMsg: AgentMessage = { id: `u-${Date.now()}`, role: 'user', content: trimmed };
    setAgentInput('');
    setAgentMessages((prev) => [...prev, userMsg]);
    setTimeout(() => {
      const reply: AgentMessage = { id: `r-${Date.now()}`, role: 'agent', content: `Got it — I'll handle "${trimmed}" for you. Configuration updated.` };
      setAgentMessages((prev) => [...prev, reply]);
    }, 1000);
  };

  return (
    <motion.div
      initial={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0, overflow: 'hidden' }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
    >
      {/* Collapsed header bar */}
      <div className="flex items-center justify-between border-b border-border bg-bg-card px-4 py-3">
        {/* Left: Dots + message + progress */}
        <button
          type="button"
          className="flex items-center gap-3 cursor-pointer bg-transparent border-none p-0"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-accent" />
            <span className="h-2 w-2 rounded-full bg-accent/70" />
            <span className="h-2 w-2 rounded-full bg-accent/40" />
          </div>
          <span className="text-sm text-text">
            Set up your site &mdash; takes 2 minutes
          </span>
          <span className="text-xs text-text-secondary">
            {completedSteps} of {TOTAL_STEPS} steps done
          </span>
          <span className="bg-accent/20 text-accent text-xs rounded-full px-2 py-0.5">
            {progressPercent}% complete
          </span>
        </button>

        {/* Right: Expand toggle + dismiss */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-bg-hover hover:text-text transition-colors"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <button
            onClick={onDismiss}
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-bg-hover hover:text-text transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Expanded wizard content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden border-b border-border bg-bg-sidebar"
          >
            <div className="px-6 py-6">
              {/* Step indicators */}
              <div className="flex items-center gap-2 mb-6">
                {Array.from({ length: TOTAL_STEPS }, (_, i) => {
                  const step = i + 1;
                  const isCompleted = step in selections && step !== currentStep;
                  const isCurrent = step === currentStep;

                  return (
                    <button
                      key={step}
                      type="button"
                      onClick={() => handleStepClick(step)}
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                        isCompleted
                          ? 'bg-accent text-brand-950 cursor-pointer'
                          : isCurrent
                            ? 'border-2 border-accent bg-accent text-brand-950'
                            : 'bg-bg-elevated text-text-muted'
                      } ${step <= completedSteps + 1 ? 'cursor-pointer' : 'cursor-default'}`}
                      disabled={step > completedSteps + 1}
                    >
                      {isCompleted ? <Check className="h-4 w-4" /> : step}
                    </button>
                  );
                })}
              </div>

              {/* Step content with animation */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  {currentStep <= 3 ? (
                    <>
                      {/* Step title + subtitle */}
                      <h3 className="font-heading text-lg font-semibold text-text mb-1">
                        {steps[currentStep - 1].title}
                      </h3>
                      <p className="text-sm text-text-secondary mb-5">
                        {steps[currentStep - 1].subtitle}
                      </p>

                      {/* Option cards */}
                      <div className="grid grid-cols-3 gap-4 mb-6">
                        {steps[currentStep - 1].options.map((option, idx) => {
                          const isSelected = selections[currentStep] === idx;
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleSelect(idx)}
                              className={`relative text-left bg-bg-card border rounded-xl p-5 transition-colors ${
                                isSelected
                                  ? 'border-accent bg-accent/5'
                                  : 'border-border hover:border-accent'
                              }`}
                            >
                              {option.recommended && (
                                <span className="absolute -top-2.5 left-4 bg-accent text-brand-950 text-xs font-semibold rounded-full px-2 py-0.5">
                                  Recommended
                                </span>
                              )}
                              <div className="text-sm font-medium text-text mb-1">
                                {option.label}
                              </div>
                              <div className="text-xs text-text-secondary">
                                {option.description}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Step 4: Agentic Auto-Integration */}
                      <h3 className="font-heading text-lg font-semibold text-text mb-1">
                        <Sparkles className="inline h-4 w-4 text-accent mr-1.5 -mt-0.5" />
                        Agent is setting up your site
                      </h3>
                      <p className="text-sm text-text-secondary mb-4">
                        Our AI agent is auto-integrating your choices. You can chat with it below.
                      </p>

                      {/* Agent chat area */}
                      <div className="rounded-xl border border-border bg-bg-card mb-4">
                        <div className="max-h-[180px] overflow-y-auto px-4 py-3 space-y-2.5">
                          {agentMessages.map((msg) => (
                            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                                msg.role === 'user'
                                  ? 'bg-accent text-brand-950 rounded-br-sm'
                                  : 'bg-bg-elevated text-text-secondary rounded-bl-sm'
                              }`}>
                                {msg.content}
                              </div>
                            </div>
                          ))}
                          {!agentDone && agentMessages.length > 0 && agentMessages.length < AGENT_AUTO_MESSAGES.length && (
                            <div className="flex justify-start">
                              <div className="rounded-xl bg-bg-elevated px-3 py-2 text-sm text-text-muted">
                                <span className="animate-pulse">●●●</span>
                              </div>
                            </div>
                          )}
                          <div ref={agentEndRef} />
                        </div>
                        <div className="border-t border-border px-3 py-2 flex items-center gap-2">
                          <input
                            type="text"
                            value={agentInput}
                            onChange={(e) => setAgentInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleAgentSend(); }}
                            placeholder="Ask the agent anything..."
                            className="flex-1 bg-transparent text-sm text-text placeholder:text-text-muted outline-none"
                          />
                          <button
                            onClick={handleAgentSend}
                            disabled={!agentInput.trim()}
                            className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-brand-950 transition-opacity disabled:opacity-30"
                          >
                            <Send className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Navigation buttons */}
                  <div className="flex items-center justify-between">
                    <div>
                      {currentStep > 1 && (
                        <button
                          type="button"
                          onClick={handleBack}
                          className="text-sm text-text-secondary hover:text-text transition-colors"
                        >
                          &larr; Back
                        </button>
                      )}
                    </div>
                    <div>
                      {isLastStep ? (
                        <button
                          type="button"
                          onClick={handleFinish}
                          className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-brand-950 rounded-lg px-5 py-2 text-sm font-medium transition-colors"
                        >
                          Finish Setup
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleNext}
                          disabled={!canAdvance}
                          className={`flex items-center gap-2 bg-bg-elevated border border-border rounded-lg px-5 py-2 text-sm font-medium transition-colors ${
                            canAdvance
                              ? 'text-text hover:bg-bg-hover cursor-pointer'
                              : 'text-text-muted cursor-not-allowed opacity-50'
                          }`}
                        >
                          Next
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
