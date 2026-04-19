import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type PageDetail, type PageEdit } from "../lib/api";
import { ArrowLeft, Save, RotateCcw, Check } from "lucide-react";

export default function PageEditor() {
  const params = useParams();
  const slug = params.slug ?? "";
  const routeParam = params["*"] ?? "";
  const route = routeParam === "" || routeParam === "/" ? "/" : "/" + routeParam.replace(/^\//, "");

  const navigate = useNavigate();
  const [page, setPage] = useState<PageDetail | null>(null);
  const [dirty, setDirty] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getPage(slug, route)
      .then(setPage)
      .catch((err) => setError(String(err)));
  }, [slug, route]);

  const dirtyCount = Object.keys(dirty).length;

  const mergedValueFor = useMemo(() => {
    return (edit: PageEdit): string => {
      if (edit.id in dirty) return dirty[edit.id]!;
      return edit.value ?? edit.current;
    };
  }, [dirty]);

  function setFieldValue(editId: string, value: string, original: string) {
    setDirty((prev) => {
      const next = { ...prev };
      if (value === original) {
        delete next[editId];
      } else {
        next[editId] = value;
      }
      return next;
    });
    setSaved(false);
  }

  async function onSave() {
    if (dirtyCount === 0) return;
    setSaving(true);
    setSaved(false);
    try {
      await api.saveEdits(slug, dirty);
      const fresh = await api.getPage(slug, route);
      setPage(fresh);
      setDirty({});
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function onRevert(edit: PageEdit) {
    setDirty((prev) => {
      const next = { ...prev };
      delete next[edit.id];
      return next;
    });
    if (edit.value !== null) {
      await api.clearEdit(slug, edit.id);
      const fresh = await api.getPage(slug, route);
      setPage(fresh);
    }
  }

  if (error) return <div className="p-8 text-[var(--color-status-red)]">{error}</div>;
  if (!page) return <div className="p-8 text-[var(--color-text-muted)]">Loading…</div>;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main editor column */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-8 max-w-3xl mx-auto">
          <button
            onClick={() => navigate(`/${encodeURIComponent(slug)}`)}
            className="mb-4 flex items-center gap-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
          >
            <ArrowLeft className="w-4 h-4" /> Back to pages
          </button>

          <div className="flex items-start justify-between gap-4 mb-8">
            <div>
              <div className="label-mono text-[var(--color-text-muted)] mb-1">Editing</div>
              <h1 className="font-heading text-3xl">{page.route}</h1>
              <div className="text-sm text-[var(--color-text-secondary)] mt-1">
                {page.edits.length} editable fields
              </div>
            </div>
            <button
              onClick={onSave}
              disabled={saving || dirtyCount === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-brand-950)] font-medium text-sm hover:bg-[var(--color-accent-hover)] disabled:opacity-40"
            >
              {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saving
                ? "Saving…"
                : saved
                  ? "Saved"
                  : dirtyCount > 0
                    ? `Save ${dirtyCount} change${dirtyCount > 1 ? "s" : ""}`
                    : "No changes"}
            </button>
          </div>

          {page.edits.length === 0 ? (
            <p className="text-[var(--color-text-muted)] text-sm italic">
              No editable fields were carved on this page.
            </p>
          ) : (
            <ul className="space-y-6">
              {page.edits.map((edit) => (
                <FieldEditor
                  key={edit.id}
                  edit={edit}
                  current={mergedValueFor(edit)}
                  onChange={(v) => setFieldValue(edit.id, v, edit.current)}
                  onRevert={() => onRevert(edit)}
                  dirty={edit.id in dirty}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Sidebar with page list */}
      <aside className="w-64 border-l border-[var(--color-border)] bg-[var(--color-bg-sidebar)] overflow-y-auto">
        <div className="p-4">
          <div className="label-mono text-[var(--color-text-muted)] mb-2">Tenant</div>
          <Link to={`/${encodeURIComponent(slug)}`} className="font-heading text-base hover:underline">
            {slug}
          </Link>
        </div>
      </aside>
    </div>
  );
}

// ── field editors ────────────────────────────────────────────────────────

interface FieldEditorProps {
  edit: PageEdit;
  current: string;
  dirty: boolean;
  onChange: (v: string) => void;
  onRevert: () => void;
}

function FieldEditor({ edit, current, dirty, onChange, onRevert }: FieldEditorProps) {
  const edited = edit.value !== null || dirty;

  const inputClass =
    "w-full px-3 py-2 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]";

  return (
    <li className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="label-mono text-[var(--color-text)]">
            {edit.label ?? edit.id}
          </span>
          <span className="label-mono text-[var(--color-text-muted)]">{edit.kind}</span>
          {edited && (
            <span className="label-mono bg-[var(--tint-info)] text-[var(--tint-info-text)] px-1.5 py-0.5 rounded">
              edited
            </span>
          )}
        </div>
        {edited && (
          <button
            onClick={onRevert}
            className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            title="Revert to source"
          >
            <RotateCcw className="w-3 h-3" /> revert
          </button>
        )}
      </div>

      {renderInput(edit, current, onChange, inputClass)}

      <div className="font-mono text-[11px] text-[var(--color-text-muted)]">
        {edit.id}
      </div>
    </li>
  );
}

function renderInput(
  edit: PageEdit,
  current: string,
  onChange: (v: string) => void,
  inputClass: string,
) {
  switch (edit.kind) {
    case "richtext":
      return (
        <textarea
          className={inputClass + " min-h-[120px] font-mono text-xs"}
          value={current}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "text":
      if (current.length > 80 || current.includes("\n")) {
        return (
          <textarea
            className={inputClass + " min-h-[80px]"}
            value={current}
            onChange={(e) => onChange(e.target.value)}
          />
        );
      }
      return (
        <input
          className={inputClass}
          value={current}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "url":
    case "link":
      return (
        <input
          type="url"
          className={inputClass + " font-mono"}
          value={current}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "image":
    case "background-image":
      return (
        <div className="space-y-2">
          <input
            className={inputClass + " font-mono text-xs"}
            value={current}
            onChange={(e) => onChange(e.target.value)}
            placeholder="/assets/images/..."
          />
          {current && (
            <div className="p-3 bg-[var(--color-bg-elevated)] rounded-lg flex items-center gap-3">
              <img
                src={current}
                alt=""
                className="w-16 h-16 object-contain bg-[var(--color-bg-card)] rounded"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.opacity = "0.25";
                }}
              />
              <div className="text-xs text-[var(--color-text-muted)] font-mono break-all">{current}</div>
            </div>
          )}
        </div>
      );
    default:
      return (
        <input
          className={inputClass}
          value={current}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}
