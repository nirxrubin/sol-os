import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, Send, Sparkles, Lock } from 'lucide-react';
import HpLogo from './HpLogo';
import type { TechSector } from '../data/types';
import { deployBundles } from '../data/bundles';

interface TechDetailViewProps {
  sector: TechSector;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const statusConfig: Record<
  TechSector['status'],
  { label: string; dotClass: string }
> = {
  connected: { label: 'Connected', dotClass: 'bg-status-green' },
  ready: { label: 'Ready', dotClass: 'bg-status-green' },
  'needs-setup': { label: 'Needs Setup', dotClass: 'bg-status-orange' },
  'not-started': { label: 'Not Started', dotClass: 'bg-status-red' },
};

const suggestedPrompts = [
  'Set up automatically',
  'What does this do?',
  'Check requirements',
];

export default function TechDetailView({ sector }: TechDetailViewProps) {
  const status = statusConfig[sector.status];
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: `I'm your ${sector.name} agent. I can help you understand and configure ${sector.name.toLowerCase()} for your project. HostaPosta manages all provider accounts — just pick your publish bundle and I'll handle the rest.`,
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Get provider assignments from each bundle for this sector
  const bundleAssignments = deployBundles.map(bundle => ({
    bundleName: bundle.name,
    bundleTier: bundle.id,
    price: bundle.price + bundle.priceNote,
    provider: bundle.providers.find(p => p.sectorId === sector.id),
  })).filter(b => b.provider);

  // Reset state when sector changes
  useEffect(() => {
    setMessages([
      {
        role: 'assistant',
        content: `I'm your ${sector.name} agent. I can help you understand and configure ${sector.name.toLowerCase()} for your project. HostaPosta manages all provider accounts — just pick your publish bundle and I'll handle the rest.`,
      },
    ]);
    setInputValue('');
  }, [sector.id, sector.name]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addMessage = (msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  };

  const handleSendMessage = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    addMessage({ role: 'user', content: trimmed });
    setInputValue('');

    setTimeout(() => {
      addMessage({
        role: 'assistant',
        content: `I understand you'd like to "${trimmed.toLowerCase()}". Let me look into that for ${sector.name.toLowerCase()}. I'll analyze the current configuration and get back to you with recommendations.`,
      });
    }, 1000);
  };

  const handleSuggestedPrompt = (prompt: string) => {
    addMessage({ role: 'user', content: prompt });

    setTimeout(() => {
      if (prompt === 'Set up automatically') {
        addMessage({
          role: 'assistant',
          content: `${sector.name} will be configured automatically when you deploy. HostaPosta manages the provider account and handles all setup steps — no action needed from you.\n\nJust click "Publish" in the top bar and choose your bundle. Each bundle includes a ${sector.name.toLowerCase()} provider optimized for that tier.`,
        });
      } else if (prompt === 'What does this do?') {
        const providerList = bundleAssignments
          .map(b => `• ${b.bundleName}: ${b.provider!.providerName} - ${b.provider!.description}`)
          .join('\n');
        addMessage({
          role: 'assistant',
          content: `${sector.description}\n\nHere's what's included in each bundle:\n\n${providerList || 'No providers configured yet.'}\n\nHostaPosta manages all accounts — you never need to sign up with any provider directly.`,
        });
      } else if (prompt === 'Check requirements') {
        const completed = sector.tasks.filter((t) => t.completed).length;
        addMessage({
          role: 'assistant',
          content: `${sector.name} status: ${completed}/${sector.tasks.length} tasks completed.\n\n${sector.tasks.map((t) => `${t.completed ? '✓' : '○'} ${t.label}`).join('\n')}\n\nAll auto tasks will be handled during publishing. No manual action required — HostaPosta takes care of it.`,
        });
      }
    }, 1000);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  return (
    <div className="flex h-full w-full gap-6 p-8">
      {/* Left Column - Sector Info, Tasks, Bundle Providers */}
      <div className="flex flex-1 flex-col overflow-y-auto pr-2">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-2xl font-semibold text-text">{sector.name}</h1>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                sector.status === 'connected' || sector.status === 'ready'
                  ? 'bg-status-green/20 text-status-green'
                  : sector.status === 'needs-setup'
                    ? 'bg-status-orange/20 text-status-orange'
                    : 'bg-bg-elevated text-text-muted'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${status.dotClass}`}
              />
              {status.label}
            </span>
            <span className="rounded-full bg-bg-elevated px-3 py-1 text-xs capitalize text-text-muted">
              {sector.automation}
            </span>
          </div>
          <p className="mt-2 text-sm text-text-secondary">
            {sector.description}
          </p>
        </div>

        {/* Managed by Sol badge */}
        <div className="mb-6 flex items-center gap-2 rounded-lg bg-accent/5 border border-accent/15 px-4 py-3">
          <Lock className="h-3.5 w-3.5 text-accent" />
          <p className="text-xs text-text-secondary">
            <span className="font-medium text-accent">Managed by HostaPosta</span>
            {' '}- Provider account and configuration handled automatically
          </p>
        </div>

        {/* Tasks Card */}
        <div className="mb-6 rounded-xl border border-border bg-bg-card p-5">
          <h2 className="font-heading mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
            Setup Tasks
          </h2>
          <div className="divide-y divide-border-subtle">
            {sector.tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-3 py-4 first:pt-0 last:pb-0"
              >
                {task.completed ? (
                  <CheckCircle2
                    size={15}
                    className="shrink-0 text-status-green"
                  />
                ) : (
                  <Circle size={15} className="shrink-0 text-text-muted" />
                )}
                <span
                  className={`flex-1 text-sm ${
                    task.completed
                      ? 'text-text-secondary line-through'
                      : 'text-text'
                  }`}
                >
                  {task.label}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    task.automation === 'auto'
                      ? 'bg-accent/10 text-accent'
                      : 'bg-bg-elevated text-text-muted'
                  }`}
                >
                  {task.automation === 'auto' ? 'Sol handles it' : 'manual'}
                </span>
              </div>
            ))}
            {sector.tasks.length === 0 && (
              <p className="py-4 text-center text-sm text-text-muted">
                No tasks configured yet.
              </p>
            )}
          </div>
        </div>

        {/* Bundle Provider Assignments */}
        <div>
          <h2 className="font-heading mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
            Provider by Bundle
          </h2>
          <div className="space-y-2.5">
            {bundleAssignments.map((assignment) => (
              <div
                key={assignment.bundleTier}
                className={`rounded-xl border p-4 ${
                  assignment.bundleTier === 'pro'
                    ? 'border-accent/30 bg-accent/5'
                    : 'border-border bg-bg-card'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      assignment.bundleTier === 'pro' ? 'bg-accent/15 text-accent' :
                      assignment.bundleTier === 'scale' ? 'bg-bg-elevated text-text-secondary' :
                      'bg-bg-elevated text-text-muted'
                    }`}>
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text">{assignment.provider!.providerName}</span>
                        {assignment.bundleTier === 'pro' && (
                          <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-medium text-accent">
                            Recommended
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-text-muted">{assignment.provider!.description}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-xs font-medium text-text">{assignment.bundleName}</span>
                    <span className="text-[11px] text-text-muted">{assignment.price}</span>
                  </div>
                </div>
              </div>
            ))}

            {bundleAssignments.length === 0 && (
              <div className="rounded-xl border border-border-subtle bg-bg-card p-4 text-center">
                <p className="text-sm text-text-muted">
                  Not included in current bundles - available as add-on
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Column - Agent Chat Panel */}
      <div className="flex w-[380px] shrink-0 flex-col rounded-xl border border-border bg-bg-card">
        {/* Chat Header */}
        <div className="flex items-center gap-3 rounded-t-xl border-b border-border bg-bg-card px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
            <HpLogo className="h-4 w-auto text-accent" />
          </div>
          <div>
            <h3 className="font-heading text-sm font-semibold text-text">
              {sector.name} Agent
            </h3>
            <p className="text-[11px] text-text-muted">Managed by HostaPosta</p>
          </div>
        </div>

        {/* Messages Area */}
        <div
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto p-4 space-y-3"
        >
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={
                    msg.role === 'user'
                      ? 'ml-8 rounded-xl rounded-br-sm bg-accent px-4 py-2.5 text-sm text-brand-950'
                      : 'mr-8 rounded-xl rounded-bl-sm bg-bg-elevated px-4 py-2.5 text-sm text-text-secondary'
                  }
                >
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Prompts */}
        <div className="flex flex-wrap gap-1.5 border-t border-border-subtle px-3 pt-2.5 pb-1">
          {suggestedPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => handleSuggestedPrompt(prompt)}
              className="cursor-pointer rounded-full border border-border px-2.5 py-1 text-[11px] text-text-secondary transition-colors hover:border-accent hover:text-accent"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Input Area */}
        <div className="flex items-center gap-2 border-t border-border p-3">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask about ${sector.name.toLowerCase()}...`}
            className="flex-1 rounded-xl border border-border bg-bg-elevated px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSendMessage}
            disabled={!inputValue.trim()}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-accent text-brand-950 transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
