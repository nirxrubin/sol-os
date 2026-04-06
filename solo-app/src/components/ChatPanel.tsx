import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Send } from 'lucide-react';
import HpLogo from './HpLogo';
import type { ChatMessage } from '../data/types';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  onClose: () => void;
}

const promptChips = [
  'What should I do next?',
  'Summarize progress',
  'Show blockers',
];

export default function ChatPanel({ messages, onSend, onClose }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 250);
  }, []);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <motion.div
      initial={{ x: 380 }}
      animate={{ x: 0 }}
      exit={{ x: 380 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="flex h-full w-[380px] flex-col border-l border-border bg-bg-sidebar"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <HpLogo className="h-4 w-auto text-accent" />
          <span className="font-heading font-semibold text-text">HostaPosta AI</span>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-hover hover:text-text"
          aria-label="Close chat"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {messages.map((msg) => (
          <div key={msg.id}>
            {msg.role === 'user' ? (
              <div className="ml-12 rounded-xl rounded-br-sm bg-accent px-4 py-3">
                <p className="text-sm text-brand-950 whitespace-pre-wrap">{msg.content}</p>
              </div>
            ) : (
              <div className="mr-12 rounded-xl rounded-bl-sm border border-border bg-bg-card px-4 py-3">
                <p className="text-sm text-text-secondary whitespace-pre-wrap">{msg.content}</p>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Prompt Chips */}
      <div className="flex flex-wrap gap-1.5 px-5 pb-2">
        {promptChips.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => onSend(chip)}
            className="rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary transition-colors hover:border-accent hover:text-accent"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Input area */}
      <div className="border-t border-border bg-bg-card px-5 py-4">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask HostaPosta anything..."
            className="flex-1 rounded-xl border border-border bg-bg-elevated px-4 py-3 text-sm text-text placeholder:text-text-muted outline-none focus:border-accent/50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-brand-950 transition-opacity hover:opacity-90 disabled:opacity-30"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
