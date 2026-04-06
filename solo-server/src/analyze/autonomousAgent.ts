import Anthropic from '@anthropic-ai/sdk';
import type { Message, MessageParam, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages.js';
import { SYSTEM_PROMPT, buildArchetypeContext } from './systemPrompt.js';
import { ALL_TOOLS, executeTool } from './tools.js';
import { WRITE_ANALYSIS_TOOL, type AIAnalysisOutput } from './outputSchema.js';
import { isLocalMode, askLocalClaude, collectProjectFiles, buildAnalysisPrompt } from './localClaude.js';
import type { DetectionResult } from './detector.js';

// ─── Event types emitted during analysis ─────────────────────────────

export type AgentEventType = 'tool_call' | 'insight' | 'info' | 'complete' | 'error';

export interface AgentEvent {
  type: AgentEventType;
  tool?: string;
  message: string;
  path?: string;
}

export type EmitFn = (event: AgentEvent) => void;

// ─── Main agent runner ────────────────────────────────────────────────

const MAX_TOOL_CALLS = 50;
const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

const PRIMARY_MODEL   = 'claude-sonnet-4-6';
const FALLBACK_MODEL  = 'claude-3-5-haiku-20241022';

// Retryable Anthropic status codes (transient server-side issues)
const RETRYABLE_STATUSES = new Set([429, 529]);
const MAX_RETRIES = 4;

function isRetryable(err: unknown): boolean {
  return RETRYABLE_STATUSES.has((err as any)?.status);
}

async function callWithRetry(
  fn: () => Promise<Message>,
  emit: EmitFn,
): Promise<Message> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const status: number | undefined = err?.status;
      if (status && RETRYABLE_STATUSES.has(status)) {
        // Exponential backoff: 5s, 10s, 20s, 40s
        const delayMs = Math.min(5_000 * Math.pow(2, attempt), 60_000);
        const label = status === 429 ? 'Rate limit' : 'API overloaded';
        emit({
          type: 'info',
          message: `${label} — retrying in ${delayMs / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})…`,
        });
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      throw err; // non-retryable — bubble up immediately
    }
  }
  throw lastErr;
}

// ─── Local mode: single-shot analysis via claude CLI ─────────────────
// When USE_LOCAL_CLAUDE=true, skips multi-turn tool-use loop.
// Reads key project files, passes them inline, asks for full JSON output.
// Uses Claude subscription auth (no API credits consumed).

async function runLocalAnalysis(
  projectRoot: string,
  fileTree: string[],
  emit: EmitFn,
): Promise<AIAnalysisOutput> {
  emit({ type: 'info', message: 'Local mode: collecting project files for single-shot analysis…' });

  const files = await collectProjectFiles(projectRoot, fileTree);
  emit({ type: 'info', message: `Collected ${files.length} key files (${Math.round(files.reduce((s, f) => s + f.content.length, 0) / 1024)}KB)` });

  const prompt = buildAnalysisPrompt(fileTree, files);

  emit({ type: 'info', message: 'Calling local Claude CLI (subscription auth, no API credits)…' });

  const raw = await askLocalClaude(prompt, {
    model: 'sonnet',
    systemPrompt: SYSTEM_PROMPT.slice(0, 2000), // trim for local mode
    timeoutMs: 180_000,
  });

  // Parse JSON — handle markdown fences or raw JSON
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) throw new Error('Local Claude did not return valid JSON');

  const result: AIAnalysisOutput = JSON.parse(jsonMatch[1] ?? jsonMatch[0]);

  emit({ type: 'complete', tool: 'write_analysis', message: 'Local analysis complete' });
  return result;
}

// ─── Main agent runner ────────────────────────────────────────────────

export async function runAutonomousAgent(
  projectRoot: string,
  fileTree: string[],
  emit: EmitFn,
  detection?: DetectionResult,
): Promise<AIAnalysisOutput> {
  // Local mode: single-shot via claude CLI (uses subscription, no API credits)
  if (isLocalMode()) {
    return runLocalAnalysis(projectRoot, fileTree, emit);
  }

  const client = new Anthropic();

  // Build system prompt — prepend archetype context when available
  const systemPrompt = detection
    ? buildArchetypeContext(detection.archetype, detection.generator) + '\n\n' + SYSTEM_PROMPT
    : SYSTEM_PROMPT;

  // Build initial user message — skip structural steps when archetype is known
  const strategySteps = detection
    ? `Strategy (archetype already known — skip framework/build discovery):
1. list_files() to understand the overall shape
2. Find and read the entry point + router/pages (routing pattern: ${detection.archetype.routing.type})
3. Read page/component files — section structure, content patterns, SEO
4. Find and read data files — extract ALL items from every CMS-worthy local array, noting sourceFile and sourceType
5. Scan for environment variables (process.env.*, import.meta.env.*)

Call write_analysis() when you have: pages with valid navigateTo, content collections with source mapping, business summary, and readiness score.`
    : `Strategy:
1. list_files() to understand the shape
2. Classify the archetype (landing-page / marketing-site / spa-with-collections / etc.)
3. Read package.json for framework and build config
4. Find and read the router file — derive every navigateTo from actual route definitions
5. Read page/component files to understand section structure and content patterns
6. Find and read data files — extract EVERY item from every CMS-worthy local array
7. Scan for environment variables

Call write_analysis() when all five completion criteria are met.`;

  const initialMessage = `Here is the project you need to analyze.

File tree (${fileTree.length} files):
${fileTree.join('\n')}

Analyze this project. Your tools are read-only: list_files, read_file, search_in_file.
Source injection is handled separately by a deterministic engine after you complete.

${strategySteps}`;

  const messages: MessageParam[] = [
    { role: 'user', content: initialMessage },
  ];

  let toolCallCount = 0;
  let result: AIAnalysisOutput | null = null;
  let currentModel = PRIMARY_MODEL;
  let usingFallback = false;

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Analysis timeout after 10 minutes')), TIMEOUT_MS)
  );

  const agentLoop = async (): Promise<AIAnalysisOutput> => {
    while (toolCallCount < MAX_TOOL_CALLS) {
      let response: Message;
      try {
        response = await callWithRetry(
          () => client.messages.create({
            model: currentModel,
            max_tokens: 8096,
            system: systemPrompt,
            tools: [...ALL_TOOLS, WRITE_ANALYSIS_TOOL],
            messages,
          }),
          emit,
        );
      } catch (err) {
        // All retries exhausted — if primary model was the problem, drop to Haiku
        if (isRetryable(err) && !usingFallback) {
          usingFallback = true;
          currentModel = FALLBACK_MODEL;
          emit({
            type: 'info',
            message: `Sonnet still unavailable after ${MAX_RETRIES} retries — switching to Haiku (fallback model). Analysis continues…`,
          });
          continue; // retry this turn with Haiku, same conversation state
        }
        throw err; // fallback also failed, or non-retryable error
      }

      // Add assistant turn to conversation
      messages.push({ role: 'assistant', content: response.content });

      // If no tool calls, the AI is done (possibly without calling write_analysis)
      if (response.stop_reason === 'end_turn') {
        emit({ type: 'error', message: 'Agent finished without calling write_analysis — forcing completion with partial data' });
        throw new Error('Agent ended without calling write_analysis');
      }

      if (response.stop_reason !== 'tool_use') {
        throw new Error(`Unexpected stop reason: ${response.stop_reason}`);
      }

      // Collect all tool uses from this response
      const toolUses = response.content.filter(block => block.type === 'tool_use');
      const toolResults: ToolResultBlockParam[] = [];

      for (const block of toolUses) {
        if (block.type !== 'tool_use') continue;

        toolCallCount++;

        // Terminal tool — write_analysis ends the session
        if (block.name === 'write_analysis') {
          emit({ type: 'complete', tool: 'write_analysis', message: 'Analysis complete — writing result' });
          result = block.input as AIAnalysisOutput;
          return result;
        }

        // Emit SSE event for this tool call
        const eventMessage = formatToolMessage(block.name, block.input as Record<string, unknown>);
        emit({
          type: 'tool_call',
          tool: block.name,
          message: eventMessage,
          path: (block.input as Record<string, unknown>).path as string | undefined,
        });

        // Execute the tool
        const toolOutput = await executeTool(
          block.name,
          block.input as Record<string, unknown>,
          projectRoot,
          fileTree,
        );

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: toolOutput,
        });

        // Emit insight if the output is short enough to summarize
        const insight = extractInsight(block.name, block.input as Record<string, unknown>, toolOutput);
        if (insight) {
          emit({ type: 'insight', message: insight });
        }
      }

      // Add all tool results as the next user turn
      messages.push({ role: 'user', content: toolResults });

      // Budget warning — give the AI one last chance to wrap up
      if (toolCallCount >= MAX_TOOL_CALLS - 3) {
        messages.push({
          role: 'user',
          content: `You are approaching the tool call budget (${toolCallCount}/${MAX_TOOL_CALLS}). If you can answer all five completion criteria (project type, navigation, pages, content collections with all items, env vars), call write_analysis() now. Otherwise make your most important remaining reads and then call write_analysis(). Do not skip write_analysis — it ends the session.`,
        });
      }
    }

    throw new Error(`Exceeded tool call budget of ${MAX_TOOL_CALLS}`);
  };

  return Promise.race([agentLoop(), timeoutPromise]);
}

// ─── Helpers ──────────────────────────────────────────────────────────

function formatToolMessage(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'list_files':
      return input.dir ? `Listing files in ${input.dir}/` : 'Scanning project structure';
    case 'read_file':
      return `Reading ${input.path}`;
    case 'search_in_file':
      return `Searching "${input.pattern}" in ${input.path}`;
    case 'write_file': {
      const p = input.path as string;
      return `Injecting SOL bindings → ${p}`;
    }
    default:
      return toolName;
  }
}

function extractInsight(toolName: string, input: Record<string, unknown>, output: string): string | null {
  if (toolName === 'read_file') {
    const path = (input.path as string) ?? '';

    // Package.json insights
    if (path.endsWith('package.json')) {
      const frameworks = ['react', 'vue', 'svelte', 'astro', 'next', 'nuxt', 'remix', 'solid'];
      for (const f of frameworks) {
        if (output.toLowerCase().includes(`"${f}`)) {
          return `${f.charAt(0).toUpperCase() + f.slice(1)} project detected`;
        }
      }
    }

    // Router file insights
    if (path.toLowerCase().includes('router') || path.toLowerCase().includes('routes')) {
      const hashMatch = output.match(/['"`](#\/[a-zA-Z0-9_/-]+)/g);
      const historyMatch = output.match(/path:\s*['"`](\/[a-zA-Z0-9_/-]+)/g);
      if (hashMatch && hashMatch.length > 1) {
        return `Hash router — ${hashMatch.length} routes found`;
      }
      if (historyMatch && historyMatch.length > 1) {
        return `History router — ${historyMatch.length} routes found`;
      }
    }
  }

  if (toolName === 'list_files') {
    const count = output.match(/^(\d+) files/)?.[1];
    if (count) return `${count} project files found`;
  }

  return null;
}
