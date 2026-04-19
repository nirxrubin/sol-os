/**
 * Shared Claude harness used by every HostaPosta skill / agent.
 *
 * Uses @anthropic-ai/claude-agent-sdk so calls bill against the user's
 * logged-in Claude account (Max plan / Pro / API key — whatever Claude Code
 * has configured locally).
 *
 * Provides:
 *   - Configurable model tiering via AI_MODEL env var (haiku|sonnet|opus)
 *   - JSON-mode helper that retries on malformed output once
 *   - Trace logging hook
 *
 * Design choices:
 *   - `tools: []` — disables built-in tools so we get a pure one-shot text
 *     response (no Bash, Read, Edit, etc.). These skills don't need tools.
 *   - `settingSources: []` — SDK isolation mode. We don't want skills to
 *     pick up the user's CLAUDE.md or project settings.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";

export type ModelTier = "haiku" | "sonnet" | "opus";

/** Model aliases the Agent SDK accepts. */
const TIER_TO_MODEL: Record<ModelTier, string> = {
  haiku: "haiku",
  sonnet: "sonnet",
  opus: "opus",
};

function pickModel(tier: ModelTier): string {
  const override = process.env.AI_MODEL;
  if (override === "haiku" || override === "sonnet" || override === "opus") {
    return TIER_TO_MODEL[override];
  }
  return TIER_TO_MODEL[tier];
}

export interface CallOptions {
  /** Tier picks the default model; AI_MODEL env var overrides. */
  tier?: ModelTier;
  /** System prompt — agent identity, rules, output contract. */
  system: string;
  /** User prompt — the task input. */
  user: string;
  /** Per-call trace label for logging. */
  trace?: string;
  /** Optional max-tokens hint (Agent SDK doesn't expose this directly; reserved for future). */
  maxTokens?: number;
  /** Called if callClaudeJson had to retry due to malformed JSON. Use this to track
   *  quality signal (e.g. for eval scoring). */
  onJsonRetry?: () => void;
}

export class AgentCallError extends Error {
  constructor(message: string, public readonly subtype?: string) {
    super(message);
    this.name = "AgentCallError";
  }
}

export async function callClaude(opts: CallOptions): Promise<string> {
  const model = pickModel(opts.tier ?? "sonnet");
  const startedAt = Date.now();
  const trace = opts.trace ?? "claude";

  let result = "";
  let resultErrors: string[] = [];

  const q = query({
    prompt: opts.user,
    options: {
      systemPrompt: opts.system,
      model,
      tools: [],
      settingSources: [],
    },
  });

  for await (const msg of q) {
    if (msg.type !== "result") continue;
    if (msg.subtype === "success") {
      result = msg.result;
    } else {
      // error_during_execution / error_max_turns / etc.
      resultErrors = msg.errors ?? [];
      const ms = Date.now() - startedAt;
      console.log(`[${trace}] model=${model} ms=${ms} ERROR ${msg.subtype}`);
      throw new AgentCallError(
        `Agent SDK returned ${msg.subtype}${resultErrors.length ? ": " + resultErrors.join("; ") : ""}`,
        msg.subtype,
      );
    }
  }

  const ms = Date.now() - startedAt;
  console.log(`[${trace}] model=${model} ms=${ms}`);
  return result;
}

/**
 * Call Claude with the expectation of structured JSON output. Strips a
 * leading ```json fence if present. Retries once on parse failure.
 */
export async function callClaudeJson<T>(opts: CallOptions): Promise<T> {
  const raw = await callClaude(opts);
  try {
    return JSON.parse(stripCodeFence(raw)) as T;
  } catch {
    opts.onJsonRetry?.();
    const raw2 = await callClaude({
      ...opts,
      user: opts.user + "\n\nReminder: respond with valid JSON only — no prose, no code fences.",
      trace: (opts.trace ?? "claude") + ":retry",
    });
    return JSON.parse(stripCodeFence(raw2)) as T;
  }
}

function stripCodeFence(s: string): string {
  return s
    .trim()
    .replace(/^```(?:json)?\s*\n?/, "")
    .replace(/\n?```$/, "")
    .trim();
}
