# Design: Autonomous Analysis Engine

**Date:** 2026-04-03
**Status:** Approved

## Summary

Replace the current multi-agent swarm (7 specialized agents, fixed SSE steps, heuristic-based) with a single autonomous Claude session that explores the uploaded project freely using tool use, then emits a structured analysis when it is confident it understands the project completely.

---

## Architecture

One Claude session. System prompt defines SOL's analysis engine. The AI calls tools freely until it understands the project, then calls `write_analysis(json)` to finish. SSE reflects every real tool call in real-time.

```
POST /api/upload
  → extract zip
  → start autonomous agent session
    → AI calls list_files, read_file, search_in_file freely
    → SSE emits every tool call as it happens
    → AI calls write_analysis(json) when confident
  → write .sol-analysis.json
  → send email notification
  → GET /api/analysis returns result
```

---

## System Prompt

The system prompt is the brain of the engine. It encodes SOL-specific rules and trusts the model's existing knowledge of frameworks, routing patterns, and code structures.

**The prompt covers six areas:**

### 1. Identity and Mission
"You are SOL's analysis engine — a senior web developer exploring an unfamiliar codebase. Your job is to understand this project deeply enough that SOL can: (1) show a live CMS editor for every editable content collection, (2) display a pixel-perfect iframe preview of every page, (3) generate a deploy pipeline tailored to the tech stack."

### 2. Exploration Strategy
Prioritized reading order the AI must follow:
1. `list_files()` — understand the project shape
2. `package.json` — detect framework, bundler, dependencies
3. Entry point — `index.html`, `main.js`, `main.ts`, `App.tsx`, `app.js`
4. Router file — wherever routes are defined. **Never skip this.**
5. Page/component files — at least one per route
6. Data/content files — JS arrays, JSON files, markdown directories

"Do not read every file. But do not call `write_analysis` before reading at least one page component and verifying the routing mechanism."

### 3. `navigateTo` Derivation Rules
Hard rules for the most critical field in the output:
- Hash routing (`location.hash`, `hashchange`, `HashRouter`) → `"#/routename"`
- History routing (`pushState`, `BrowserRouter`, Next.js, Astro) → `"/routename"`
- Multi-page HTML → `"/page.html"` or `"/page"` (match actual file path)
- Never return a bare word (`"home"`, `"about"`) — always include `#` or leading `/`
- Derive from the **actual router code**, never from the filename

### 4. Content Recognition Rules
An array is CMS-worthy when:
- It contains 3+ items
- Each item has a consistent object shape
- Fields include at least one of: `title`, `name`, `description`, `image`, `date`, `body`, `excerpt`

Where to look: JS data files (e.g., `blog-data.js`, `team.js`), JSON files, markdown content directories, inline arrays inside page components.

### 5. Completion Criteria
"You understand the project when you can answer all of:
- What is this project? (type, framework, purpose)
- How does navigation work? (routing mechanism, router file)
- What pages exist? (name, path, exact `navigateTo` for each)
- Where is the editable content? (file, variable name, item count for each collection)

Do not call `write_analysis` until you can answer all four."

### 6. Failure Modes to Avoid
Explicit prohibitions:
- Do not infer `navigateTo` from the filename alone
- Do not skip the router file
- Do not assume a framework from file extensions alone — read `package.json` first
- Do not call `write_analysis` if you have only read the file tree and `package.json`
- Do not list a page without a valid `navigateTo`

---

## Tools

Four tools. The AI uses the first three freely; `write_analysis` ends the session.

| Tool | Signature | Purpose |
|------|-----------|---------|
| `list_files` | `(dir?: string)` | Returns file tree as indented string. AI starts here. |
| `read_file` | `(path: string)` | Returns file content. Core exploration tool. |
| `search_in_file` | `(path: string, pattern: string)` | Grep within a file. Fast for large files. |
| `write_analysis` | `(schema: AnalysisOutput)` | Terminal tool — ends session, writes result. |

**Budget:** max 40 tool calls · 10-minute hard timeout · model: `claude-sonnet-4-6`

---

## Output Schema (`write_analysis` argument)

```typescript
interface AnalysisOutput {
  projectName: string;
  projectType: 'hash-spa' | 'history-spa' | 'nextjs' | 'astro' | 'multi-page-html' | 'other';
  framework: string;           // "vanilla-js" | "react" | "vue" | "nextjs" | "astro" | etc.
  entryPoint: string;          // "index.html" | "src/main.tsx" etc.
  routerFile?: string;         // path to the file where routes are defined
  navigationMechanism: string; // human-readable: "Hash SPA — hashchange events in js/router.js"

  pages: Array<{
    name: string;              // "Home" | "Blog" | "Calculator"
    path: string;              // "/" | "/blog" | "/calculator"
    navigateTo: string;        // "#/" | "#/blog" | "/blog" | "/blog.html"
    sourceFile: string;        // file to write CMS edits to
    seoTitle?: string;
    seoDescription?: string;
    seoStatus: 'complete' | 'partial' | 'missing';
    sections: Array<{
      id: string;
      type: string;            // "hero" | "features" | "testimonials" | "footer" etc.
      label: string;
    }>;
  }>;

  contentCollections: Array<{
    name: string;              // "blogPosts" | "teamMembers"
    file: string;              // "js/blog-data.js"
    varName: string;           // "blogPosts"
    type: string;              // "blog" | "team" | "testimonials" | "faq" | "other"
    itemCount: number;
    fields: Array<{
      name: string;
      type: 'text' | 'longtext' | 'image' | 'date' | 'url' | 'boolean';
    }>;
  }>;

  techStack: Array<{
    category: string;          // "Frontend" | "Styling" | "CMS" | "Database"
    name: string;
    detected: boolean;
    confidence: 'certain' | 'likely' | 'inferred';
  }>;

  readiness: {
    score: number;             // 0–100
    items: Array<{
      label: string;
      status: 'complete' | 'missing' | 'partial';
    }>;
  };
}
```

---

## SSE — Dynamic Feed

Instead of fixed 7 steps, every tool call the AI makes becomes an SSE event:

```
{ type: "tool_call", tool: "list_files",    message: "Scanning project structure..." }
{ type: "tool_call", tool: "read_file",     message: "Reading package.json",       path: "package.json" }
{ type: "tool_call", tool: "read_file",     message: "Reading js/router.js",        path: "js/router.js" }
{ type: "insight",                          message: "Hash SPA detected — 7 routes found" }
{ type: "tool_call", tool: "read_file",     message: "Reading js/pages/blog.js",    path: "js/pages/blog.js" }
{ type: "tool_call", tool: "write_analysis",message: "Analysis complete — writing result" }
{ type: "complete",                         message: "Done" }
```

The frontend renders each event as a log line. No progress bar — just a live feed of what the AI is doing.

---

## Files Changed

### Removed
```
solo-server/src/analyze/swarm.ts
solo-server/src/analyze/agents/understand.ts
solo-server/src/analyze/agents/pages.ts
solo-server/src/analyze/agents/content.ts
solo-server/src/analyze/agents/tech.ts
solo-server/src/analyze/agents/launch.ts
solo-server/src/analyze/agents/callAI.ts
solo-server/src/progress.ts  (fixed 7-step version)
```

### Added
```
solo-server/src/analyze/autonomousAgent.ts  — runs the Claude session, emits SSE
solo-server/src/analyze/tools.ts            — tool definitions (list_files, read_file, etc.)
solo-server/src/analyze/systemPrompt.ts     — the full system prompt
solo-server/src/analyze/outputSchema.ts     — AnalysisOutput type + JSON schema for write_analysis
solo-server/src/progress.ts                 — dynamic SSE feed (replaces fixed-step version)
```

### Updated
```
solo-server/src/analyze/index.ts   — calls autonomousAgent instead of swarm
solo-server/src/upload.ts          — passes SSE emitter to analyze()
solo-app/src/components/AnalysisView.tsx — renders dynamic SSE feed instead of fixed steps
```

---

## Email Notification

When `write_analysis` is called (analysis complete), send an email via Resend:
- To: user's email (captured at upload time)
- Subject: "Your project analysis is ready — [projectName]"
- Body: summary of what was found (page count, content collections, readiness score)

This solves the UX problem of variable analysis time without a spinner.

---

## Constraints

- **Max 40 tool calls** — enforced in `autonomousAgent.ts`; if budget exceeded, call `write_analysis` with whatever is known
- **10-minute hard timeout** — `Promise.race` with a timeout that forces completion
- **Token cost** scales with project size — accepted trade-off for accuracy
- **Model** — `claude-sonnet-4-6` (fast mode) for most projects; can be upgraded to opus for deep analysis
