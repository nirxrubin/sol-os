/**
 * HostaPosta on-canvas editor runtime.
 *
 * Architecture:
 *   - Editor chrome (toolbar, sidebar, modals, status toast) lives inside a
 *     CLOSED SHADOW ROOT so tenant CSS can't reach it and ours can't leak out.
 *   - Only .hp-editable hover/edit decoration styles live in light DOM, since
 *     those must style the tenant's own content nodes in-place.
 *
 * Activation: ?hp-edit=1 or localStorage hp-edit=true.
 * Config: window.__HOSTAPOSTA__ = { slug, apiUrl } — set by OnCanvasEditor.astro.
 *
 * Vanilla ES2017. No bundler, no framework.
 */

(function () {
  "use strict";

  const cfg = window.__HOSTAPOSTA__ || {};
  const slug = cfg.slug;
  const apiUrl = (cfg.apiUrl || "http://localhost:4000").replace(/\/+$/, "");

  if (!slug) {
    console.warn("[hp-editor] window.__HOSTAPOSTA__.slug not set — editor disabled");
    return;
  }

  // ── Activation ─────────────────────────────────────────────────────────
  const urlParams = new URLSearchParams(location.search);
  const urlToggle = urlParams.get("hp-edit");
  if (urlToggle === "0" || urlToggle === "false") {
    localStorage.removeItem("hp-edit");
    return;
  }
  const active = urlToggle === "1" || urlToggle === "true" || localStorage.getItem("hp-edit") === "true";
  if (!active) return;
  localStorage.setItem("hp-edit", "true");

  // ── State ──────────────────────────────────────────────────────────────
  let pageDetail = null;
  let saveInFlight = 0;
  let root = null;        // shadow root for editor chrome
  let sidebarTab = "pages";
  let statusTimer = null;
  let mediaCache = null;

  // ── Boot ───────────────────────────────────────────────────────────────
  // Schedule via microtask so `const SHADOW_CSS` at file bottom is
  // initialized before init() reads it. Otherwise a sync init() call here
  // (when DOM is already ready) hits SHADOW_CSS in its temporal dead zone.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    queueMicrotask(init);
  }

  async function init() {
    injectEditableStyles();
    ensureShadow();
    injectToolbar();
    try {
      await loadPage();
    } catch (err) {
      status("editor failed to load — " + err.message, "error");
      console.error("[hp-editor]", err);
      return;
    }
    applyUnrenderedEdits();
    decorate();
    status("editor ready — click any highlighted element to edit", "info");
  }

  async function loadPage() {
    const route = normalizeRoute(location.pathname);
    const r = await fetch(
      `${apiUrl}/api/tenants/${encodeURIComponent(slug)}/page?route=${encodeURIComponent(route)}`,
      { credentials: "omit" },
    );
    if (r.status === 404) {
      pageDetail = { route, edits: [], notes: [`page "${route}" isn't carved yet`] };
      status(`no editable fields on "${route}" (not carved)`, "info");
      return;
    }
    if (!r.ok) throw new Error(`page ${route}: ${r.status}`);
    const body = await r.json();
    pageDetail = body.page;
  }

  function applyUnrenderedEdits() {
    if (!pageDetail?.edits) return;
    for (const e of pageDetail.edits) {
      if (e.value === null || e.value === undefined) continue;
      if (e.value === e.current) continue;
      const node = safeQuery(e.selector);
      if (!node) continue;
      writeValue(node, e, e.value);
    }
  }

  function decorate() {
    if (!pageDetail?.edits) return;
    let wired = 0;
    const missed = [];
    for (const e of pageDetail.edits) {
      const node = safeQuery(e.selector);
      if (!node) {
        missed.push(`${e.id} (${e.selector})`);
        continue;
      }
      node.setAttribute("data-hp-id", e.id);
      node.setAttribute("data-hp-kind", e.kind);
      node.setAttribute("data-hp-label", e.label || "");
      node.classList.add("hp-editable");
      node.addEventListener("click", (ev) => onEditableClick(ev, e));
      wired += 1;
    }
    console.log(`[hp-editor] decorated ${wired} / ${pageDetail.edits.length} fields on ${pageDetail.route}`);
    if (missed.length > 0) {
      console.warn(`[hp-editor] ${missed.length} selectors didn't match:`);
      for (const m of missed) console.warn("  ·", m);
    }
    if (wired === 0 && pageDetail.edits.length > 0) {
      status(`0 / ${pageDetail.edits.length} fields matched — check console`, "error");
    }
  }

  function onEditableClick(ev, editDef) {
    const node = ev.currentTarget;
    if (node.getAttribute("data-hp-editing") === "true") return;
    ev.preventDefault();
    ev.stopPropagation();
    switch (editDef.kind) {
      case "text":
      case "richtext":
        beginTextEdit(node, editDef);
        break;
      case "image":
      case "background-image":
        beginImageEdit(node, editDef);
        break;
      case "url":
      case "link":
        beginUrlEdit(node, editDef);
        break;
      default:
        status(`unsupported edit kind: ${editDef.kind}`, "error");
    }
  }

  function beginTextEdit(node, editDef) {
    node.setAttribute("data-hp-editing", "true");
    node.contentEditable = "true";
    node.focus();
    const range = document.createRange();
    range.selectNodeContents(node);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    const original = readValue(node, editDef);
    node.addEventListener("blur", finish, { once: true });
    node.addEventListener("keydown", onKey);

    function onKey(ev) {
      if (ev.key === "Enter" && !ev.shiftKey && editDef.kind === "text") {
        ev.preventDefault();
        node.blur();
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        writeValue(node, editDef, original);
        node.blur();
      }
    }
    function finish() {
      node.removeEventListener("keydown", onKey);
      node.contentEditable = "false";
      node.removeAttribute("data-hp-editing");
      const next = readValue(node, editDef);
      if (next !== original) saveEdit(editDef.id, next);
    }
  }

  function beginImageEdit(node, editDef) {
    const current = readValue(node, editDef);
    openMediaPicker({
      title: editDef.label || editDef.id,
      current,
      onSelect: (url) => {
        if (url === current) return;
        writeValue(node, editDef, url);
        saveEdit(editDef.id, url);
      },
    });
  }

  function beginUrlEdit(node, editDef) {
    const current = readValue(node, editDef);
    const next = window.prompt(`Link URL (${editDef.label || editDef.id})`, current);
    if (next == null) return;
    if (next !== current) {
      writeValue(node, editDef, next);
      saveEdit(editDef.id, next);
    }
  }

  function readValue(node, editDef) {
    if (editDef.kind === "text") return node.innerText.trim();
    if (editDef.kind === "richtext") return node.innerHTML.trim();
    if (editDef.kind === "image" || editDef.kind === "background-image") {
      const attr = editDef.attribute || "src";
      return node.getAttribute(attr) || "";
    }
    if (editDef.kind === "url" || editDef.kind === "link") {
      const attr = editDef.attribute || "href";
      return node.getAttribute(attr) || "";
    }
    return node.innerText;
  }

  function writeValue(node, editDef, value) {
    switch (editDef.kind) {
      case "text":
        node.innerText = value;
        break;
      case "richtext":
        node.innerHTML = value;
        break;
      case "image":
        node.setAttribute(editDef.attribute || "src", value);
        break;
      case "background-image": {
        const style = node.getAttribute("style") || "";
        const patched = style.replace(/url\((['"]?)[^)'"]*\1\)/, `url("${value}")`);
        node.setAttribute("style", patched);
        break;
      }
      case "url":
      case "link":
        node.setAttribute(editDef.attribute || "href", value);
        break;
    }
  }

  async function saveEdit(editId, value) {
    saveInFlight += 1;
    status("saving…", "pending");
    try {
      const res = await fetch(
        `${apiUrl}/api/tenants/${encodeURIComponent(slug)}/edits`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ [editId]: value }),
        },
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status} ${text.slice(0, 120)}`);
      }
      if (pageDetail?.edits) {
        const match = pageDetail.edits.find((e) => e.id === editId);
        if (match) match.value = value;
      }
      saveInFlight -= 1;
      if (saveInFlight === 0) status("saved", "ok");
    } catch (err) {
      saveInFlight -= 1;
      console.error("[hp-editor] save failed", err);
      status("save failed — " + err.message, "error");
    }
  }

  // ── Shadow root setup ──────────────────────────────────────────────────

  function ensureShadow() {
    if (root) return root;
    const host = document.createElement("div");
    host.id = "hp-host";
    host.style.cssText =
      "position:fixed;inset:0;z-index:2147483646;pointer-events:none;";
    document.body.appendChild(host);
    root = host.attachShadow({ mode: "closed" });
    const s = document.createElement("style");
    s.textContent = SHADOW_CSS;
    root.appendChild(s);
    const slots = document.createElement("div");
    slots.innerHTML = `
      <div data-slot="bar"></div>
      <div data-slot="sidebar"></div>
      <div data-slot="modals"></div>
      <div data-slot="status"></div>
    `;
    while (slots.firstChild) root.appendChild(slots.firstChild);
    return root;
  }

  function qs(sel) { return root ? root.querySelector(sel) : null; }
  function qsa(sel) { return root ? Array.from(root.querySelectorAll(sel)) : []; }
  function slot(name) { return root.querySelector(`[data-slot="${name}"]`); }

  // ── Toolbar ────────────────────────────────────────────────────────────

  function injectToolbar() {
    const bar = document.createElement("div");
    bar.id = "hp-bar";
    bar.className = "hp-bar";
    bar.innerHTML = `
      <span class="hp-bar-dot"></span>
      <span class="hp-bar-title">HostaPosta</span>
      <span class="hp-bar-slug">${escapeHtml(slug)}</span>
      <div class="hp-bar-spacer"></div>
      <button class="hp-bar-btn" data-hp-sidebar>Site</button>
      <button class="hp-bar-btn hp-bar-btn--primary" data-hp-publish>Publish</button>
      <button class="hp-bar-btn hp-bar-btn--ghost" data-hp-exit>Exit</button>
    `;
    slot("bar").appendChild(bar);

    bar.querySelector("[data-hp-exit]").addEventListener("click", () => {
      localStorage.removeItem("hp-edit");
      const url = new URL(location.href);
      url.searchParams.delete("hp-edit");
      location.href = url.toString();
    });
    bar.querySelector("[data-hp-publish]").addEventListener("click", publish);
    bar.querySelector("[data-hp-sidebar]").addEventListener("click", toggleSidebar);
  }

  async function publish() {
    const btn = qs("[data-hp-publish]");
    if (!btn || btn.hasAttribute("disabled")) return;
    btn.setAttribute("disabled", "true");
    btn.textContent = "Publishing…";
    status("rebuilding site…", "pending");
    try {
      const res = await fetch(
        `${apiUrl}/api/tenants/${encodeURIComponent(slug)}/rebuild`,
        { method: "POST" },
      );
      const body = await res.json();
      const r = body.result;
      if (!r || !r.ok) throw new Error((r && r.error) || `HTTP ${res.status}`);
      status(`published · ${r.durationMs}ms`, "ok");
    } catch (err) {
      status("publish failed — " + err.message, "error");
      console.error("[hp-editor]", err);
    } finally {
      btn.removeAttribute("disabled");
      btn.textContent = "Publish";
    }
  }

  // ── Sidebar ────────────────────────────────────────────────────────────

  function toggleSidebar() {
    const host = slot("sidebar");
    let sb = host.querySelector(".hp-sidebar");
    if (sb) {
      sb.classList.toggle("hp-sidebar--open");
      return;
    }
    sb = document.createElement("div");
    sb.className = "hp-sidebar hp-sidebar--open";
    sb.innerHTML = `
      <div class="hp-sidebar-head">
        <div class="hp-sidebar-title">Site</div>
        <button class="hp-icon-btn" data-hp-sidebar-close aria-label="Close">×</button>
      </div>
      <div class="hp-sidebar-tabs" role="tablist">
        <button class="hp-sidebar-tab hp-sidebar-tab--active" data-hp-tab="pages" role="tab">Pages</button>
        <button class="hp-sidebar-tab" data-hp-tab="collections" role="tab">Collections</button>
      </div>
      <div class="hp-sidebar-body" data-hp-sidebar-body>
        <div class="hp-sidebar-loading">Loading…</div>
      </div>
    `;
    host.appendChild(sb);

    sb.querySelector("[data-hp-sidebar-close]").addEventListener("click", () =>
      sb.classList.remove("hp-sidebar--open"),
    );
    sb.querySelectorAll("[data-hp-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        sidebarTab = btn.getAttribute("data-hp-tab");
        sb.querySelectorAll("[data-hp-tab]").forEach((b) =>
          b.classList.toggle("hp-sidebar-tab--active", b === btn),
        );
        renderSidebar();
      });
    });
    renderSidebar();
  }

  async function renderSidebar() {
    const body = qs("[data-hp-sidebar-body]");
    if (!body) return;
    body.innerHTML = `<div class="hp-sidebar-loading">Loading…</div>`;
    try {
      if (sidebarTab === "pages") {
        const { pages } = await fetchJson(`/api/tenants/${encodeURIComponent(slug)}/pages`);
        body.innerHTML = renderPagesTab(pages || []);
        wirePageRows(body);
      } else {
        const { collections } = await fetchJson(`/api/tenants/${encodeURIComponent(slug)}/collections`);
        body.innerHTML = renderCollectionsTab(collections || {});
        wireCollectionRows(body, collections || {});
      }
    } catch (err) {
      console.error("[hp-editor] sidebar fetch failed:", err);
      body.innerHTML = `<div class="hp-sidebar-empty">Failed to load — ${escapeHtml(err.message)}</div>`;
    }
  }

  function renderPagesTab(pages) {
    if (pages.length === 0) {
      return `<div class="hp-sidebar-empty">No pages carved yet.</div>`;
    }
    const currentRoute = normalizeRoute(location.pathname);
    const rows = pages.map((p) => {
      const active = p.route === currentRoute;
      return `
        <li class="hp-row ${active ? "hp-row--active" : ""}">
          <div class="hp-row-main">
            <span class="hp-row-name" dir="auto">${escapeHtml(p.route)}</span>
            ${active ? `<span class="hp-tag">here</span>` : ""}
          </div>
          <div class="hp-row-actions">
            <button class="hp-btn hp-btn--ghost" data-hp-open="${escapeAttr(p.route)}" title="Open page">Open</button>
            <button class="hp-btn" data-hp-meta="${escapeAttr(p.route)}" title="SEO / meta">Meta</button>
          </div>
        </li>`;
    }).join("");
    return `<ul class="hp-list">${rows}</ul>`;
  }

  function wirePageRows(container) {
    container.querySelectorAll("[data-hp-open]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const route = btn.getAttribute("data-hp-open");
        const url = new URL(location.origin + route);
        url.searchParams.set("hp-edit", "1");
        location.href = url.toString();
      });
    });
    container.querySelectorAll("[data-hp-meta]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const route = btn.getAttribute("data-hp-meta");
        openMetaEditor(route);
      });
    });
  }

  function renderCollectionsTab(collections) {
    const kinds = [
      { slug: "blog",        label: "Blog",         titleKey: "title" },
      { slug: "testimonial", label: "Testimonials", titleKey: "quote" },
      { slug: "team",        label: "Team",         titleKey: "name"  },
      { slug: "service",     label: "Services",     titleKey: "name"  },
      { slug: "product",     label: "Products",     titleKey: "name"  },
    ];
    const nonEmpty = kinds.filter((k) =>
      Array.isArray(collections[k.slug]) && collections[k.slug].length > 0,
    );
    if (nonEmpty.length === 0) {
      return `<div class="hp-sidebar-empty">No collections enabled for this tenant.</div>`;
    }
    return nonEmpty.map((k) => {
      const items = collections[k.slug];
      return `
        <section class="hp-section">
          <header class="hp-section-head">
            <span class="hp-section-label">${k.label}</span>
            <span class="hp-section-count">${items.length}</span>
          </header>
          <ul class="hp-list hp-list--nested">
            ${items.map((item, idx) => {
              const title = String(item[k.titleKey] || item.title || item.name || item.slug || "(untitled)").slice(0, 90);
              const secondary = item.role || item.author || item.company || item.publishDate || "";
              const entrySlug = typeof item.slug === "string" ? item.slug : "";
              return `
                <li class="hp-row hp-row--clickable"
                    data-hp-collection="${escapeAttr(k.slug)}"
                    data-hp-entry="${escapeAttr(entrySlug)}"
                    data-hp-index="${idx}">
                  <div class="hp-row-main">
                    <div class="hp-row-name" dir="auto">${escapeHtml(title)}</div>
                    ${secondary ? `<div class="hp-row-sub" dir="auto">${escapeHtml(String(secondary).slice(0, 60))}</div>` : ""}
                  </div>
                  <div class="hp-row-actions">
                    ${entrySlug
                      ? `<span class="hp-btn hp-btn--ghost">Edit</span>`
                      : `<span class="hp-tag hp-tag--muted" title="No slug — can't edit">read-only</span>`}
                  </div>
                </li>`;
            }).join("")}
          </ul>
        </section>`;
    }).join("");
  }

  function wireCollectionRows(container, collections) {
    container.querySelectorAll("[data-hp-collection]").forEach((row) => {
      row.addEventListener("click", () => {
        const kind = row.getAttribute("data-hp-collection");
        const entrySlug = row.getAttribute("data-hp-entry");
        const idx = Number(row.getAttribute("data-hp-index"));
        if (!entrySlug) {
          status("this entry has no slug — can't edit yet", "error");
          return;
        }
        const entry = collections[kind]?.[idx];
        if (!entry) return;
        openCollectionEditor(kind, entrySlug, entry);
      });
    });
  }

  // ── Meta editor modal ──────────────────────────────────────────────────

  async function openMetaEditor(route) {
    let current = {};
    try {
      const r = await fetchJson(
        `/api/tenants/${encodeURIComponent(slug)}/meta?route=${encodeURIComponent(route)}`,
      );
      current = r.meta || {};
    } catch (err) {
      console.warn("[hp-editor] meta fetch failed", err);
    }
    const schemaStr = current.schema
      ? JSON.stringify(current.schema, null, 2)
      : "";
    openModal({
      title: `Page meta · ${route}`,
      eyebrow: "SEO",
      body: `
        <div class="hp-form">
          <label class="hp-field">
            <span class="hp-field-label">Title</span>
            <input type="text" name="title" class="hp-input" maxlength="160" value="${escapeAttr(current.title || "")}" />
            <span class="hp-field-help">Shown in browser tab + search results.</span>
          </label>
          <label class="hp-field">
            <span class="hp-field-label">Description</span>
            <textarea name="description" class="hp-input hp-input--area" rows="3" maxlength="320">${escapeHtml(current.description || "")}</textarea>
            <span class="hp-field-help">~160 characters. Used for <code>&lt;meta name="description"&gt;</code>.</span>
          </label>
          <label class="hp-field">
            <span class="hp-field-label">Open Graph image</span>
            <div class="hp-input-row">
              <input type="text" name="ogImage" class="hp-input" value="${escapeAttr(current.ogImage || "")}" placeholder="/uploads/og.jpg" />
              <button type="button" class="hp-btn" data-hp-pick-og>Pick…</button>
            </div>
            <span class="hp-field-help">1200×630 recommended. Shown on social shares.</span>
          </label>
          <label class="hp-field">
            <span class="hp-field-label">Schema (JSON-LD)</span>
            <textarea name="schema" class="hp-input hp-input--code" rows="8" placeholder='{ "@context": "https://schema.org", ... }'>${escapeHtml(schemaStr)}</textarea>
            <span class="hp-field-help">Paste raw JSON. Validated on save.</span>
          </label>
        </div>
      `,
      primary: { label: "Save", kind: "primary" },
      onSubmit: async (modalRoot) => {
        const title = modalRoot.querySelector("[name=title]").value.trim();
        const description = modalRoot.querySelector("[name=description]").value.trim();
        const ogImage = modalRoot.querySelector("[name=ogImage]").value.trim();
        const schemaRaw = modalRoot.querySelector("[name=schema]").value.trim();
        let schema;
        if (schemaRaw) {
          try { schema = JSON.parse(schemaRaw); }
          catch (e) { throw new Error("Schema JSON is invalid — " + e.message); }
        }
        const meta = {};
        if (title) meta.title = title;
        if (description) meta.description = description;
        if (ogImage) meta.ogImage = ogImage;
        if (schema !== undefined) meta.schema = schema;
        const res = await fetch(
          `${apiUrl}/api/tenants/${encodeURIComponent(slug)}/meta?route=${encodeURIComponent(route)}`,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ meta }),
          },
        );
        if (!res.ok) {
          const t = await res.text();
          throw new Error(`${res.status} ${t.slice(0, 120)}`);
        }
      },
      onMount: (modalRoot) => {
        modalRoot.querySelector("[data-hp-pick-og]")?.addEventListener("click", () => {
          const input = modalRoot.querySelector("[name=ogImage]");
          openMediaPicker({
            title: "Open Graph image",
            current: input.value,
            onSelect: (url) => { input.value = url; },
          });
        });
      },
    });
  }

  // ── Collection entry editor modal ──────────────────────────────────────

  function openCollectionEditor(kind, entrySlug, entry) {
    const fields = buildCollectionFields(kind, entry);
    const body = `
      <div class="hp-form">
        <div class="hp-form-meta">
          <span class="hp-tag">${escapeHtml(kind)}</span>
          <code class="hp-tag hp-tag--muted">${escapeHtml(entrySlug)}</code>
        </div>
        ${fields.map((f) => renderFieldInput(f)).join("")}
      </div>
    `;
    openModal({
      title: String(entry.name || entry.title || entrySlug),
      eyebrow: "Edit entry",
      body,
      primary: { label: "Save", kind: "primary" },
      onSubmit: async (modalRoot) => {
        const patch = {};
        for (const f of fields) {
          const el = modalRoot.querySelector(`[name="${cssEsc(f.key)}"]`);
          if (!el) continue;
          const val = el.value;
          if (f.type === "number") {
            patch[f.key] = val === "" ? null : Number(val);
          } else {
            patch[f.key] = val;
          }
        }
        const res = await fetch(
          `${apiUrl}/api/tenants/${encodeURIComponent(slug)}/collections/${encodeURIComponent(kind)}/${encodeURIComponent(entrySlug)}`,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(patch),
          },
        );
        if (!res.ok) {
          const t = await res.text();
          throw new Error(`${res.status} ${t.slice(0, 160)}`);
        }
      },
      onMount: (modalRoot) => {
        modalRoot.querySelectorAll("[data-hp-pick-field]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const target = modalRoot.querySelector(`[name="${cssEsc(btn.getAttribute("data-hp-pick-field"))}"]`);
            if (!target) return;
            openMediaPicker({
              title: btn.getAttribute("data-hp-pick-label") || "Image",
              current: target.value,
              onSelect: (url) => { target.value = url; },
            });
          });
        });
      },
    });
  }

  /**
   * Turn an entry object into a list of editable fields. We only surface
   * string/number scalars — nested arrays/objects (features, pricing) are
   * shown as JSON for power users but editable as raw JSON text.
   */
  function buildCollectionFields(kind, entry) {
    const out = [];
    const order = fieldOrderForKind(kind);
    const keys = Object.keys(entry);
    const ordered = [...order.filter((k) => keys.includes(k)), ...keys.filter((k) => !order.includes(k))];
    for (const key of ordered) {
      if (key === "slug") continue; // slug is the identity, not editable here
      const val = entry[key];
      const label = humanize(key);
      if (typeof val === "string") {
        const type = key.toLowerCase().includes("description") || key.toLowerCase().includes("body") || key.toLowerCase().includes("quote")
          ? "textarea"
          : key.toLowerCase().includes("image") || key.toLowerCase().includes("icon") || key.toLowerCase().includes("photo") || key.toLowerCase().includes("avatar")
            ? "image"
            : "text";
        out.push({ key, label, type, value: val });
      } else if (typeof val === "number") {
        out.push({ key, label, type: "number", value: String(val) });
      } else if (val == null) {
        out.push({ key, label, type: "text", value: "" });
      } else {
        // arrays/objects → JSON string textarea (read-only for now)
        out.push({ key, label, type: "json", value: JSON.stringify(val, null, 2), readOnly: true });
      }
    }
    return out;
  }

  function fieldOrderForKind(kind) {
    switch (kind) {
      case "blog":        return ["title", "author", "publishDate", "excerpt", "body", "heroImage"];
      case "testimonial": return ["quote", "name", "role", "company", "photo"];
      case "team":        return ["name", "role", "bio", "photo"];
      case "service":     return ["name", "description", "icon"];
      case "product":     return ["name", "price", "currency", "image", "description", "category", "inStock"];
      default:            return [];
    }
  }

  function renderFieldInput(f) {
    const readonly = f.readOnly ? "readonly" : "";
    if (f.type === "textarea") {
      return `
        <label class="hp-field">
          <span class="hp-field-label">${escapeHtml(f.label)}</span>
          <textarea name="${escapeAttr(f.key)}" class="hp-input hp-input--area" rows="4" ${readonly}>${escapeHtml(f.value)}</textarea>
        </label>`;
    }
    if (f.type === "json") {
      return `
        <label class="hp-field">
          <span class="hp-field-label">${escapeHtml(f.label)} <span class="hp-tag hp-tag--muted">json</span></span>
          <textarea name="${escapeAttr(f.key)}" class="hp-input hp-input--code" rows="5" ${readonly}>${escapeHtml(f.value)}</textarea>
          <span class="hp-field-help">Nested data — edit the source file for now.</span>
        </label>`;
    }
    if (f.type === "image") {
      return `
        <label class="hp-field">
          <span class="hp-field-label">${escapeHtml(f.label)}</span>
          <div class="hp-input-row">
            <input type="text" name="${escapeAttr(f.key)}" class="hp-input" value="${escapeAttr(f.value)}" />
            <button type="button" class="hp-btn" data-hp-pick-field="${escapeAttr(f.key)}" data-hp-pick-label="${escapeAttr(f.label)}">Pick…</button>
          </div>
        </label>`;
    }
    if (f.type === "number") {
      return `
        <label class="hp-field">
          <span class="hp-field-label">${escapeHtml(f.label)}</span>
          <input type="number" name="${escapeAttr(f.key)}" class="hp-input" value="${escapeAttr(f.value)}" />
        </label>`;
    }
    return `
      <label class="hp-field">
        <span class="hp-field-label">${escapeHtml(f.label)}</span>
        <input type="text" name="${escapeAttr(f.key)}" class="hp-input" value="${escapeAttr(f.value)}" />
      </label>`;
  }

  function humanize(key) {
    return key
      .replace(/([A-Z])/g, " $1")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^./, (c) => c.toUpperCase());
  }

  // ── Generic modal ──────────────────────────────────────────────────────

  function openModal({ title, eyebrow, body, primary, onSubmit, onMount }) {
    const host = slot("modals");
    const overlay = document.createElement("div");
    overlay.className = "hp-overlay";
    overlay.innerHTML = `
      <div class="hp-modal" role="dialog" aria-modal="true">
        <header class="hp-modal-head">
          <div>
            ${eyebrow ? `<div class="hp-modal-eyebrow">${escapeHtml(eyebrow)}</div>` : ""}
            <div class="hp-modal-title" dir="auto">${escapeHtml(title)}</div>
          </div>
          <button class="hp-icon-btn" data-hp-modal-close aria-label="Close">×</button>
        </header>
        <div class="hp-modal-body"></div>
        <footer class="hp-modal-foot">
          <div class="hp-modal-status" aria-live="polite"></div>
          <div class="hp-modal-actions">
            <button class="hp-btn hp-btn--ghost" data-hp-modal-cancel>Cancel</button>
            <button class="hp-btn hp-btn--${primary?.kind || "primary"}" data-hp-modal-submit>${escapeHtml(primary?.label || "Save")}</button>
          </div>
        </footer>
      </div>
    `;
    host.appendChild(overlay);
    const modalRoot = overlay.querySelector(".hp-modal");
    modalRoot.querySelector(".hp-modal-body").innerHTML = body;

    function close() {
      overlay.classList.add("hp-overlay--closing");
      setTimeout(() => overlay.remove(), 140);
    }

    overlay.querySelector("[data-hp-modal-close]").addEventListener("click", close);
    overlay.querySelector("[data-hp-modal-cancel]").addEventListener("click", close);
    overlay.addEventListener("click", (ev) => { if (ev.target === overlay) close(); });

    const submitBtn = overlay.querySelector("[data-hp-modal-submit]");
    const statusEl = overlay.querySelector(".hp-modal-status");
    submitBtn.addEventListener("click", async () => {
      if (!onSubmit) { close(); return; }
      submitBtn.setAttribute("disabled", "true");
      statusEl.textContent = "Saving…";
      statusEl.removeAttribute("data-kind");
      try {
        await onSubmit(modalRoot);
        statusEl.textContent = "Saved";
        statusEl.setAttribute("data-kind", "ok");
        setTimeout(close, 450);
      } catch (err) {
        console.error("[hp-editor] modal submit failed", err);
        statusEl.textContent = err.message || "Failed";
        statusEl.setAttribute("data-kind", "error");
        submitBtn.removeAttribute("disabled");
      }
    });

    if (onMount) onMount(modalRoot);
    return { close };
  }

  // ── Media picker ───────────────────────────────────────────────────────

  async function openMediaPicker({ title, current, onSelect }) {
    const host = slot("modals");
    const overlay = document.createElement("div");
    overlay.className = "hp-overlay";
    overlay.innerHTML = `
      <div class="hp-modal hp-modal--wide" role="dialog" aria-modal="true">
        <header class="hp-modal-head">
          <div>
            <div class="hp-modal-eyebrow">Select image</div>
            <div class="hp-modal-title" dir="auto">${escapeHtml(title)}</div>
          </div>
          <div class="hp-modal-head-actions">
            <label class="hp-btn hp-btn--primary hp-picker-upload">
              Upload
              <input type="file" accept="image/*" hidden />
            </label>
            <button class="hp-icon-btn" data-hp-modal-close aria-label="Close">×</button>
          </div>
        </header>
        <div class="hp-picker-status" aria-live="polite"></div>
        <div class="hp-picker-grid" aria-busy="true">
          <div class="hp-picker-empty">Loading…</div>
        </div>
      </div>
    `;
    host.appendChild(overlay);

    const gridEl = overlay.querySelector(".hp-picker-grid");
    const statusEl = overlay.querySelector(".hp-picker-status");
    const fileInput = overlay.querySelector(".hp-picker-upload input");

    function close() {
      overlay.classList.add("hp-overlay--closing");
      setTimeout(() => overlay.remove(), 140);
    }
    overlay.querySelector("[data-hp-modal-close]").addEventListener("click", close);
    overlay.addEventListener("click", (ev) => { if (ev.target === overlay) close(); });

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      statusEl.textContent = `uploading ${file.name}…`;
      try {
        const asset = await uploadMedia(file);
        statusEl.textContent = `uploaded · ${(asset.bytes / 1024).toFixed(0)} KB`;
        mediaCache = null;
        onSelect(asset.url);
        close();
      } catch (err) {
        statusEl.textContent = `upload failed — ${err.message}`;
      }
    });

    async function render() {
      const assets = await listMedia();
      if (assets.length === 0) {
        gridEl.innerHTML = `<div class="hp-picker-empty">No images yet — upload to get started.</div>`;
        gridEl.setAttribute("aria-busy", "false");
        return;
      }
      const uploads = assets.filter((a) => a.uploaded);
      const source = assets.filter((a) => !a.uploaded);
      gridEl.innerHTML = [
        uploads.length ? renderPickerSection("Uploads", uploads, current) : "",
        source.length ? renderPickerSection("Source assets", source, current) : "",
      ].join("");
      gridEl.setAttribute("aria-busy", "false");
      gridEl.querySelectorAll("[data-hp-pick]").forEach((btn) => {
        btn.addEventListener("click", () => {
          onSelect(btn.getAttribute("data-hp-pick"));
          close();
        });
      });
    }
    render();
  }

  function renderPickerSection(label, assets, currentUrl) {
    return `
      <div class="hp-picker-section">
        <div class="hp-picker-section-label">${label} · ${assets.length}</div>
        <div class="hp-picker-tiles">
          ${assets.map((a) => {
            const sel = a.url === currentUrl ? " hp-tile--selected" : "";
            return `
              <button type="button" class="hp-tile${sel}" data-hp-pick="${escapeAttr(a.url)}" title="${escapeAttr(a.filename)}">
                <span class="hp-tile-img" style="background-image:url('${escapeAttr(a.url)}')"></span>
                <span class="hp-tile-meta">
                  <span class="hp-tile-name">${escapeHtml(a.filename)}</span>
                  <span class="hp-tile-size">${(a.bytes / 1024).toFixed(0)} KB</span>
                </span>
              </button>`;
          }).join("")}
        </div>
      </div>`;
  }

  async function listMedia() {
    if (mediaCache) return mediaCache;
    const res = await fetch(`${apiUrl}/api/tenants/${encodeURIComponent(slug)}/media`);
    if (!res.ok) throw new Error(`media list: ${res.status}`);
    const body = await res.json();
    mediaCache = (body.assets || []).filter((a) => a.kind === "image");
    return mediaCache;
  }

  async function uploadMedia(file) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${apiUrl}/api/tenants/${encodeURIComponent(slug)}/media`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`upload: ${res.status} ${t.slice(0, 120)}`);
    }
    const body = await res.json();
    return body.asset;
  }

  // ── Status toast ───────────────────────────────────────────────────────

  function status(msg, kind) {
    const host = slot("status");
    let el = host.querySelector(".hp-toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "hp-toast";
      host.appendChild(el);
    }
    el.textContent = msg;
    el.setAttribute("data-kind", kind || "info");
    el.classList.add("hp-toast--show");
    if (statusTimer) clearTimeout(statusTimer);
    if (kind !== "pending") {
      statusTimer = setTimeout(() => el.classList.remove("hp-toast--show"), 2400);
    }
  }

  // ── Light-DOM styles for .hp-editable decoration ───────────────────────

  function injectEditableStyles() {
    if (document.getElementById("hp-editable-styles")) return;
    const style = document.createElement("style");
    style.id = "hp-editable-styles";
    style.textContent = `
      .hp-editable {
        box-shadow: 0 0 0 0 transparent;
        transition: box-shadow 120ms ease, background-color 120ms ease;
        cursor: text !important;
        position: relative;
      }
      .hp-editable:hover {
        box-shadow: 0 0 0 2px rgba(0, 102, 255, 0.55), 0 0 0 4px rgba(0, 102, 255, 0.15);
        background-color: rgba(0, 102, 255, 0.035);
      }
      .hp-editable[data-hp-editing="true"] {
        box-shadow: 0 0 0 2px #0066FF, 0 0 0 5px rgba(0, 102, 255, 0.2);
        background-color: rgba(0, 102, 255, 0.05);
      }
      .hp-editable[data-hp-kind="image"],
      .hp-editable[data-hp-kind="background-image"],
      .hp-editable[data-hp-kind="url"],
      .hp-editable[data-hp-kind="link"] { cursor: pointer !important; }
    `;
    document.head.appendChild(style);
  }

  // ── Utilities ──────────────────────────────────────────────────────────

  function normalizeRoute(pathname) {
    let p = pathname.replace(/\/index\.html?$/i, "");
    p = p.replace(/\.html?$/i, "");
    if (p.length > 1) p = p.replace(/\/+$/, "");
    return p || "/";
  }

  async function fetchJson(pathStr) {
    const res = await fetch(apiUrl + pathStr);
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  }

  function safeQuery(selector) {
    try { return document.querySelector(selector); }
    catch (err) { console.warn("[hp-editor] bad selector:", selector, err); return null; }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  }
  function escapeAttr(s) { return escapeHtml(s); }
  function cssEsc(s) {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  // ── Shadow CSS ─────────────────────────────────────────────────────────

  const SHADOW_CSS = `
    :host, * {
      box-sizing: border-box;
    }
    :host {
      all: initial;
      contain: layout style;
    }

    /* Every element inside the shadow root starts from defined defaults.
       Inside shadow DOM tenant CSS can't reach us, but shadow DOM still
       inherits some computed properties from the host. Lock them down. */
    * {
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
      font-size: 14px;
      line-height: 1.4;
      color: #1C1917;
      box-sizing: border-box;
    }

    button {
      font: inherit;
      color: inherit;
      background: none;
      border: none;
      padding: 0;
      margin: 0;
      cursor: pointer;
    }

    input, textarea {
      font: inherit;
      color: inherit;
    }

    /* ── Top bar ─────────────────────────────────────────────────────── */
    .hp-bar {
      pointer-events: auto;
      position: fixed;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      background: #18181B;
      color: #FAF9F7;
      padding: 6px 8px 6px 14px;
      border-radius: 999px;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 6px 20px rgba(0,0,0,0.18);
      user-select: none;
      max-width: calc(100vw - 32px);
    }
    .hp-bar * { color: inherit; }
    .hp-bar-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: #16A34A; box-shadow: 0 0 0 3px rgba(22,163,74,0.25);
    }
    .hp-bar-title {
      font-weight: 600; font-size: 13px;
    }
    .hp-bar-slug {
      font: 500 10px/1 ui-monospace, SFMono-Regular, monospace;
      letter-spacing: 0.04em;
      color: rgba(255,255,255,0.55);
      padding-left: 8px;
      border-left: 1px solid rgba(255,255,255,0.15);
    }
    .hp-bar-spacer { width: 2px; }
    .hp-bar-btn {
      background: rgba(255,255,255,0.08);
      color: #FAF9F7;
      border: 1px solid rgba(255,255,255,0.1);
      padding: 5px 11px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 500;
      transition: background 120ms, opacity 120ms;
    }
    .hp-bar-btn:hover { background: rgba(255,255,255,0.16); }
    .hp-bar-btn[disabled] { opacity: 0.55; cursor: wait; }
    .hp-bar-btn--primary {
      background: #16A34A;
      border-color: transparent;
      font-weight: 600;
    }
    .hp-bar-btn--primary:hover { background: #15803D; }
    .hp-bar-btn--primary[disabled] { background: #15803D; }
    .hp-bar-btn--ghost {
      background: transparent;
      border-color: rgba(255,255,255,0.2);
    }

    /* ── Icon button ──────────────────────────────────────────────── */
    .hp-icon-btn {
      width: 28px; height: 28px;
      display: inline-flex;
      align-items: center; justify-content: center;
      border: 1px solid #D4CFC8;
      border-radius: 50%;
      color: #292524;
      font-size: 18px;
      line-height: 1;
      transition: background 120ms;
    }
    .hp-icon-btn:hover { background: #F5F3F0; }

    /* ── Sidebar ─────────────────────────────────────────────────────── */
    .hp-sidebar {
      pointer-events: auto;
      position: fixed;
      top: 0; right: 0; bottom: 0;
      width: 380px;
      max-width: 92vw;
      background: #FAFAF8;
      color: #1C1917;
      border-left: 1px solid #E2DFDB;
      box-shadow: -10px 0 30px rgba(0,0,0,0.10);
      display: flex;
      flex-direction: column;
      transform: translateX(100%);
      transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    .hp-sidebar--open { transform: translateX(0); }

    .hp-sidebar-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 18px;
      border-bottom: 1px solid #E2DFDB;
      flex: 0 0 auto;
    }
    .hp-sidebar-title {
      font-size: 15px;
      font-weight: 600;
      color: #18181B;
      letter-spacing: -0.01em;
    }

    .hp-sidebar-tabs {
      display: flex;
      gap: 4px;
      padding: 8px 10px 0;
      background: #F5F3F0;
      border-bottom: 1px solid #E2DFDB;
      flex: 0 0 auto;
    }
    .hp-sidebar-tab {
      flex: 1 1 auto;
      padding: 10px 12px;
      font-size: 13px;
      font-weight: 500;
      color: #57534E;
      border-bottom: 2px solid transparent;
      transition: color 120ms, border-color 120ms;
      margin-bottom: -1px;
    }
    .hp-sidebar-tab:hover { color: #292524; }
    .hp-sidebar-tab--active {
      color: #18181B;
      border-bottom-color: #18181B;
    }

    .hp-sidebar-body {
      flex: 1 1 auto;
      overflow-y: auto;
      padding: 8px 0 24px;
    }
    .hp-sidebar-loading,
    .hp-sidebar-empty {
      padding: 28px 16px;
      color: #78716C;
      font-size: 13px;
      text-align: center;
    }

    /* ── Rows / list ────────────────────────────────────────────────── */
    .hp-list {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .hp-list--nested { padding: 0 6px; }

    .hp-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      border-bottom: 1px solid #EDE9E4;
    }
    .hp-row:last-child { border-bottom: none; }
    .hp-row--active { background: rgba(24,24,27,0.04); }
    .hp-row--clickable { cursor: pointer; }
    .hp-row--clickable:hover { background: #F5F3F0; }

    .hp-row-main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .hp-row-name {
      font: 500 13px/1.3 ui-monospace, SFMono-Regular, monospace;
      color: #292524;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .hp-row-sub {
      font-size: 11px;
      color: #78716C;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .hp-row-actions {
      display: flex;
      gap: 6px;
      flex-shrink: 0;
    }

    .hp-section { padding: 6px 0 10px; }
    .hp-section + .hp-section {
      border-top: 1px solid #E2DFDB;
      margin-top: 6px;
    }
    .hp-section-head {
      display: flex;
      justify-content: space-between;
      padding: 12px 16px 6px;
    }
    .hp-section-label {
      font: 600 10px/1 ui-monospace, SFMono-Regular, monospace;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #78716C;
    }
    .hp-section-count {
      font: 600 10px/1 ui-monospace, monospace;
      color: #A8A29E;
    }

    .hp-tag {
      font: 500 10px/1 ui-monospace, SFMono-Regular, monospace;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      padding: 3px 6px;
      border-radius: 4px;
      background: rgba(37,99,235,0.1);
      color: #1D4ED8;
    }
    .hp-tag--muted {
      background: #EDE9E4;
      color: #57534E;
    }

    /* ── Button (generic) ──────────────────────────────────────────── */
    .hp-btn {
      padding: 5px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      background: #18181B;
      color: #FAFAF8;
      border: 1px solid transparent;
      transition: background 120ms, color 120ms, opacity 120ms;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
    }
    .hp-btn:hover { background: #09090B; }
    .hp-btn[disabled] { opacity: 0.55; cursor: wait; }
    .hp-btn--ghost {
      background: transparent;
      color: #292524;
      border-color: #D4CFC8;
    }
    .hp-btn--ghost:hover {
      background: #F5F3F0;
    }
    .hp-btn--primary {
      background: #16A34A;
    }
    .hp-btn--primary:hover { background: #15803D; }

    /* ── Overlay / modal ───────────────────────────────────────────── */
    .hp-overlay {
      pointer-events: auto;
      position: fixed;
      inset: 0;
      background: rgba(12,10,9,0.5);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      animation: hp-fade-in 140ms ease forwards;
      z-index: 10;
    }
    .hp-overlay--closing { animation: hp-fade-out 140ms ease forwards; }
    @keyframes hp-fade-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes hp-fade-out { from { opacity: 1; } to { opacity: 0; } }

    .hp-modal {
      background: #FAFAF8;
      color: #1C1917;
      width: min(560px, 100%);
      max-height: min(88vh, 720px);
      border-radius: 14px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 24px 48px rgba(0,0,0,0.28);
    }
    .hp-modal--wide {
      width: min(900px, 100%);
      max-height: min(88vh, 720px);
    }

    .hp-modal-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 18px 20px 14px;
      border-bottom: 1px solid #E2DFDB;
      flex: 0 0 auto;
    }
    .hp-modal-head > div:first-child { min-width: 0; flex: 1; }
    .hp-modal-eyebrow {
      font: 500 10px/1 ui-monospace, SFMono-Regular, monospace;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #78716C;
      margin-bottom: 6px;
    }
    .hp-modal-title {
      font-size: 16px;
      font-weight: 600;
      letter-spacing: -0.01em;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .hp-modal-head-actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .hp-modal-body {
      flex: 1 1 auto;
      overflow-y: auto;
      padding: 18px 20px 20px;
    }
    .hp-modal-foot {
      padding: 12px 20px;
      border-top: 1px solid #E2DFDB;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex: 0 0 auto;
    }
    .hp-modal-status {
      font-size: 12px;
      color: #78716C;
      min-height: 16px;
    }
    .hp-modal-status[data-kind="ok"] { color: #15803D; }
    .hp-modal-status[data-kind="error"] { color: #B91C1C; }
    .hp-modal-actions { display: flex; gap: 8px; }

    /* ── Form ──────────────────────────────────────────────────────── */
    .hp-form {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .hp-form-meta {
      display: flex;
      gap: 6px;
      margin-bottom: 2px;
    }
    .hp-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .hp-field-label {
      font-size: 12px;
      font-weight: 500;
      color: #44403C;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .hp-field-help {
      font-size: 11px;
      color: #A8A29E;
    }
    .hp-field-help code {
      background: #F5F3F0;
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 10px;
    }
    .hp-input {
      width: 100%;
      padding: 8px 10px;
      border: 1px solid #D4CFC8;
      border-radius: 6px;
      background: #FFFFFF;
      color: #1C1917;
      font-size: 13px;
      outline: none;
      transition: border-color 120ms, box-shadow 120ms;
      resize: vertical;
    }
    .hp-input:focus {
      border-color: #18181B;
      box-shadow: 0 0 0 3px rgba(24,24,27,0.08);
    }
    .hp-input--area { font-family: inherit; min-height: 72px; }
    .hp-input--code {
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-size: 12px;
      min-height: 140px;
    }
    .hp-input-row {
      display: flex;
      gap: 6px;
    }
    .hp-input-row .hp-input { flex: 1; }
    .hp-input[readonly] { background: #F5F3F0; color: #57534E; }

    /* ── Media picker ──────────────────────────────────────────────── */
    .hp-picker-status {
      min-height: 20px;
      padding: 6px 20px;
      font-size: 12px;
      color: #78716C;
      border-bottom: 1px solid #EDE9E4;
      background: #F5F3F0;
    }
    .hp-picker-status:empty { display: none; }
    .hp-picker-grid {
      flex: 1;
      overflow-y: auto;
      padding: 16px 20px;
    }
    .hp-picker-empty {
      text-align: center;
      color: #78716C;
      padding: 48px 0;
    }
    .hp-picker-section + .hp-picker-section { margin-top: 24px; }
    .hp-picker-section-label {
      font: 500 10px/1 ui-monospace, monospace;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      color: #78716C;
      margin-bottom: 10px;
    }
    .hp-picker-tiles {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 12px;
    }
    .hp-tile {
      display: flex;
      flex-direction: column;
      gap: 6px;
      background: #FFFFFF;
      border: 1px solid #E2DFDB;
      border-radius: 8px;
      padding: 6px;
      cursor: pointer;
      text-align: left;
      transition: border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease;
    }
    .hp-tile:hover {
      border-color: #18181B;
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }
    .hp-tile--selected {
      border-color: #0066FF;
      box-shadow: 0 0 0 3px rgba(0,102,255,0.2);
    }
    .hp-tile-img {
      display: block;
      width: 100%;
      aspect-ratio: 4/3;
      background: #F5F3F0 center/contain no-repeat;
      border-radius: 4px;
    }
    .hp-tile-meta {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 0 2px;
    }
    .hp-tile-name {
      font: 12px/1.2 ui-monospace, SFMono-Regular, monospace;
      color: #292524;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .hp-tile-size {
      font: 11px/1 ui-monospace, monospace;
      color: #A8A29E;
    }
    .hp-picker-upload { cursor: pointer; }

    /* ── Status toast ──────────────────────────────────────────────── */
    .hp-toast {
      pointer-events: none;
      position: fixed;
      bottom: 16px;
      right: 16px;
      background: #18181B;
      color: #FAF9F7;
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 500;
      box-shadow: 0 6px 20px rgba(0,0,0,0.2);
      max-width: 320px;
      opacity: 0;
      transform: translateY(4px);
      transition: opacity 140ms ease, transform 140ms ease;
    }
    .hp-toast--show { opacity: 1; transform: translateY(0); }
    .hp-toast[data-kind="error"] { background: #B91C1C; }
    .hp-toast[data-kind="ok"] { background: #15803D; }
    .hp-toast[data-kind="pending"] { background: #57534E; }
  `;
})();
