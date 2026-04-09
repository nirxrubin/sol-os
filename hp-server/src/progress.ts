/**
 * Real-time progress tracking — dynamic log feed.
 * Each event from the autonomous agent is appended and broadcast via SSE.
 */

import { Router, type Response } from 'express';

export type LimitType =
  | 'rate_limit'
  | 'overloaded'
  | 'budget'
  | 'timeout'
  | 'context_window'
  | 'auth'
  | 'no_api_key'
  | 'unknown';

export interface LogEvent {
  id: number;
  type: 'tool_call' | 'insight' | 'info' | 'complete' | 'error';
  tool?: string;
  message: string;
  path?: string;
  timestamp: number; // ms since analysis started
  limitType?: LimitType; // set on error events caused by API/system limits
}

// ─── In-memory store ──────────────────────────────────────────────────

let logEvents: LogEvent[] = [];
let eventCounter = 0;
let startedAt = Date.now();
const clients = new Set<Response>();

// ─── Mutations ────────────────────────────────────────────────────────

export function resetProgress() {
  logEvents = [];
  eventCounter = 0;
  startedAt = Date.now();
  broadcast();
}

export function emitLog(event: Omit<LogEvent, 'id' | 'timestamp'> & { limitType?: LimitType }) {
  const full: LogEvent = {
    ...event,
    id: ++eventCounter,
    timestamp: Date.now() - startedAt,
  };
  logEvents.push(full);
  broadcast();
  return full;
}

export function getLogEvents(): LogEvent[] {
  return logEvents;
}

// ─── Backward-compat shims (used by upload.ts for extract step) ───────

export function stepStart(id: string, detail?: string) {
  emitLog({ type: 'info', message: detail ?? id });
}

export function stepDone(id: string, detail?: string) {
  emitLog({ type: 'info', message: detail ?? `${id} done` });
}

export function stepError(_id: string, error: string) {
  emitLog({ type: 'error', message: error });
}

export function stepSkip(_id: string, _reason?: string) {
  // silently dropped in new log system
}

// ─── SSE broadcast ────────────────────────────────────────────────────

function broadcast() {
  const data = JSON.stringify(logEvents);
  for (const client of clients) {
    try {
      client.write(`data: ${data}\n\n`);
    } catch {
      clients.delete(client);
    }
  }
}

// ─── SSE router ───────────────────────────────────────────────────────

export const progressRouter = Router();

progressRouter.get('/progress', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Send current state immediately on connect
  res.write(`data: ${JSON.stringify(logEvents)}\n\n`);

  clients.add(res);

  req.on('close', () => {
    clients.delete(res);
  });
});
