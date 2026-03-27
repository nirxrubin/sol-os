import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, Send } from 'lucide-react';
import SolLogo from './SolLogo';
import type { TechSector } from '../data/types';

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
  'Compare providers',
  'Check requirements',
];

export default function TechDetailView({ sector }: TechDetailViewProps) {
  const status = statusConfig[sector.status];
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: `I'm your ${sector.name} agent. I can help you configure ${sector.name.toLowerCase()} for your project. Click a provider to start integration, or ask me anything.`,
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Reset state when sector changes
  useEffect(() => {
    setSelectedProvider(null);
    setMessages([
      {
        role: 'assistant',
        content: `I'm your ${sector.name} agent. I can help you configure ${sector.name.toLowerCase()} for your project. Click a provider to start integration, or ask me anything.`,
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

  const handleProviderClick = (provider: typeof sector.providers[0]) => {
    setSelectedProvider(provider.id);

    const userMsg = `Connect ${provider.name} for ${sector.name}. ${provider.description}. Price: ${provider.price}`;
    addMessage({ role: 'user', content: userMsg });

    setTimeout(() => {
      addMessage({
        role: 'assistant',
        content: `Starting ${provider.name} integration for ${sector.name}...\n\n✓ Checking compatibility\n✓ Preparing configuration\n⟳ Connecting to ${provider.name}...`,
      });
    }, 1000);

    setTimeout(() => {
      addMessage({
        role: 'assistant',
        content: `${provider.name} integration initiated. I'll handle the setup automatically. You can monitor progress in the tasks section.`,
      });
    }, 3000);
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
          content: `I can automatically configure ${sector.name.toLowerCase()} for your project. I'll select the best provider based on your project requirements and handle all the setup steps. Would you like me to proceed?`,
        });
      } else if (prompt === 'Compare providers') {
        const providerList = sector.providers
          .map(
            (p) =>
              `• ${p.name} (${p.tier}) — ${p.price}${p.recommended ? ' ★ Recommended' : ''}`
          )
          .join('\n');
        addMessage({
          role: 'assistant',
          content: `Here's a comparison of available providers for ${sector.name}:\n\n${providerList || 'No providers available yet.'}\n\nWould you like more details on any of these?`,
        });
      } else if (prompt === 'Check requirements') {
        const completed = sector.tasks.filter((t) => t.completed).length;
        addMessage({
          role: 'assistant',
          content: `${sector.name} requirements status: ${completed}/${sector.tasks.length} tasks completed.\n\n${sector.tasks.map((t) => `${t.completed ? '✓' : '○'} ${t.label}`).join('\n')}\n\nWould you like me to help with any incomplete tasks?`,
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
      {/* Left Column — Sector Info, Tasks, Providers */}
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

        {/* Info Card wrapping Tasks */}
        <div className="mb-6 rounded-xl border border-border bg-bg-card p-5">
          <h2 className="font-heading mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
            Tasks
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
                  className={`rounded-full px-2 py-0.5 text-xs capitalize ${
                    task.automation === 'auto'
                      ? 'bg-status-green/20 text-status-green'
                      : 'bg-bg-elevated text-text-muted'
                  }`}
                >
                  {task.automation}
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

        {/* Providers Section */}
        <div>
          <h2 className="font-heading mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
            Providers
          </h2>
          <div className="space-y-3">
            {sector.providers.map((provider) => {
              const isSelected = selectedProvider === provider.id;
              return (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => handleProviderClick(provider)}
                  className={`w-full cursor-pointer rounded-xl border p-4 text-left transition-colors hover:border-accent ${
                    isSelected
                      ? 'border-accent bg-accent/5'
                      : 'border-border bg-bg-card'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-text">
                          {provider.name}
                        </p>
                        {provider.recommended && (
                          <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-medium text-accent">
                            Recommended
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-text-muted">
                        {provider.description}
                      </p>
                    </div>
                    <div className="ml-4 flex flex-col items-end gap-1">
                      <span className="text-sm font-medium text-text">
                        {provider.price}
                      </span>
                      <span className="rounded bg-bg-hover px-2 py-0.5 text-[10px] capitalize text-text-muted">
                        {provider.tier}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
            {sector.providers.length === 0 && (
              <p className="py-4 text-center text-sm text-text-muted">
                No providers available.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Right Column — Agent Chat Panel */}
      <div className="flex w-[380px] shrink-0 flex-col rounded-xl border border-border bg-bg-card">
        {/* Chat Header */}
        <div className="flex items-center gap-3 rounded-t-xl border-b border-border bg-bg-card px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
            <SolLogo className="h-4 w-auto text-accent" />
          </div>
          <div>
            <h3 className="font-heading text-sm font-semibold text-text">
              Ask the {sector.name} Agent
            </h3>
            <p className="text-[11px] text-text-muted">Online</p>
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
