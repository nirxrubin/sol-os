#!/usr/bin/env tsx
/**
 * pnpm eval <command> [args]
 *
 * Commands:
 *   list                 Show accumulated cases + corpus health
 *   show <caseId>        Print a single case's summary (path to case.md)
 *   mark <caseId> <good|bad> [note]   Label a case; influences few-shot selection
 */

import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
loadEnv({ path: path.join(repoRoot, ".env") });

import { listCases, setLabel, summarizeCorpus } from "@hostaposta/eval";

const EVAL_DIR = path.join(repoRoot, ".eval");

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const cmd = args[0] ?? "list";

  if (cmd === "list") {
    await cmdList();
  } else if (cmd === "show") {
    const id = args[1];
    if (!id) return usage();
    await cmdShow(id);
  } else if (cmd === "mark") {
    const id = args[1];
    const label = args[2];
    if (!id || (label !== "good" && label !== "bad" && label !== "unlabeled")) return usage();
    const note = args.slice(3).join(" ") || undefined;
    await setLabel(EVAL_DIR, id, label, note);
    console.log(`[eval] ${id} → ${label}${note ? ` (${note})` : ""}`);
  } else {
    usage();
  }
}

function usage(): void {
  console.error("usage: pnpm eval <list | show <caseId> | mark <caseId> <good|bad|unlabeled> [note]>");
  process.exit(1);
}

async function cmdList(): Promise<void> {
  const cases = await listCases(EVAL_DIR);
  if (cases.length === 0) {
    console.log(`[eval] no cases yet. Run \`pnpm ingest <zip>\` to capture your first.`);
    return;
  }

  const summary = summarizeCorpus(cases);
  console.log(`\n[eval] corpus: ${summary.total} cases, avg quality ${(summary.avgQuality * 100).toFixed(0)}%`);
  console.log(`       labels: good=${summary.byLabel.good} bad=${summary.byLabel.bad} unlabeled=${summary.byLabel.unlabeled}`);
  console.log(`       archetypes: ${formatBucket(summary.byArchetype)}`);
  console.log(`       generators: ${formatBucket(summary.byGenerator)}`);
  console.log();

  console.log(pad("case", 60) + pad("label", 12) + pad("qual", 6) + pad("retry?", 7) + pad("entries", 9) + "  origin");
  console.log("─".repeat(110));
  for (const c of cases) {
    const entries = c.quality.avgExtractionConfidence > 0
      ? `${(c.quality.avgExtractionConfidence * 100).toFixed(0)}%`
      : "—";
    console.log(
      pad(c.caseId, 60) +
      pad(c.effectiveLabel, 12) +
      pad(`${(c.quality.score * 100).toFixed(0)}%`, 6) +
      pad(c.quality.detectorRetried ? "yes" : "no", 7) +
      pad(entries, 9) +
      `  ${c.origin}`,
    );
  }
  console.log();
  console.log(`hint: \`pnpm eval mark <caseId> good\`  to endorse a case as a few-shot reference`);
}

async function cmdShow(id: string): Promise<void> {
  const casePath = path.join(EVAL_DIR, "cases", id);
  console.log(`[eval] case dir: ${casePath}`);
  console.log(`      - case.md (human-readable summary)`);
  console.log(`      - snapshot.json (full machine-readable capture)`);
  console.log(`      - feedback.json (label + notes; edit to change)`);
}

function pad(s: string, n: number): string {
  return (s + " ".repeat(n)).slice(0, n);
}

function formatBucket(b: Record<string, number>): string {
  return Object.entries(b).map(([k, v]) => `${k}=${v}`).join(" ");
}

main().catch((err) => {
  console.error("[eval] fatal:", err);
  process.exit(1);
});
