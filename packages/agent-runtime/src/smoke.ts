#!/usr/bin/env tsx
/**
 * Smoke test: verifies @anthropic-ai/claude-agent-sdk can authenticate via
 * Claude Code's local OAuth and complete a one-shot call.
 *
 * Run: pnpm --filter @hostaposta/agent-runtime exec tsx src/smoke.ts
 */

import { callClaudeJson } from "./index.js";

interface PingResponse {
  ok: boolean;
  message: string;
}

async function main(): Promise<void> {
  console.log("[smoke] sending one-shot ping to Claude…");
  const result = await callClaudeJson<PingResponse>({
    tier: "haiku",
    system: "You are a smoke-test responder. Output JSON only.",
    user: 'Respond with exactly this JSON: {"ok": true, "message": "pong"}',
    trace: "smoke",
  });
  console.log("[smoke] response:", result);
  if (result.ok && result.message === "pong") {
    console.log("[smoke] ✓ pass");
    process.exit(0);
  }
  console.log("[smoke] ✗ unexpected response");
  process.exit(1);
}

main().catch((err) => {
  console.error("[smoke] ✗ failed:", err);
  process.exit(1);
});
