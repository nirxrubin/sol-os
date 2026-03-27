import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Plus,
  X,
  Settings,
  Trash2,
  Check,
  FileText,
  Users,
  Briefcase,
  FolderOpen,
  MessageSquare,
  HelpCircle,
  Image,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import type { ContentType, ContentItem, ContentField, ContentFieldType } from '../data/types';

interface CMSTableViewProps {
  contentTypes: ContentType[];
  activeType: ContentType;
  onTypeChange: (ct: ContentType) => void;
}

/* Map content-type icon strings (from sample data) to lucide components */
const iconMap: Record<string, React.ElementType> = {
  FileText,
  Users,
  Briefcase,
  FolderOpen,
  MessageSquare,
  MessageSquareQuote: MessageSquare,
  HelpCircle,
  Image,
};

function getIcon(ct: ContentType): React.ElementType {
  const iconName = (ct as ContentType & { icon?: string }).icon;
  return (iconName && iconMap[iconName]) || FileText;
}

function getColumns(ct: ContentType): string[] {
  const name = ct.name.toLowerCase();
  if (name.includes('blog')) {
    return ['title', 'author', 'date', 'excerpt'];
  }
  return ct.fields.slice(0, 4).map((f) => f.name.toLowerCase());
}

function formatDate(raw: string): string {
  try {
    return new Date(raw).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return raw;
  }
}

function cellValue(item: ContentItem, col: string): string {
  const val =
    (item.data[col] as string | undefined) ??
    (item as unknown as Record<string, unknown>)[col];
  if (val == null) return '—';
  if (typeof val === 'string' && col === 'date') return formatDate(val);
  if (typeof val === 'string') return val;
  return String(val);
}

function getItemTitle(item: ContentItem, fields: ContentField[]): string {
  // Try common title-like fields
  for (const key of ['title', 'name', 'heading', 'label']) {
    if (item.data[key] && typeof item.data[key] === 'string') {
      return item.data[key] as string;
    }
  }
  // Fall back to first text field
  const firstTextField = fields.find((f) => f.type === 'text');
  if (firstTextField) {
    const val = item.data[firstTextField.name.toLowerCase()];
    if (val && typeof val === 'string') return val;
  }
  return 'Untitled';
}

const FIELD_TYPE_OPTIONS: ContentFieldType[] = [
  'text',
  'richtext',
  'image',
  'date',
  'url',
  'number',
  'boolean',
  'select',
  'email',
];

export default function CMSTableView({
  contentTypes,
  activeType,
  onTypeChange,
}: CMSTableViewProps) {
  const [search, setSearch] = useState('');
  const [localItems, setLocalItems] = useState<Record<string, ContentItem[]>>({});
  const [localFields, setLocalFields] = useState<Record<string, ContentField[]>>({});
  const [editingItem, setEditingItem] = useState<ContentItem | null>(null);
  const [editFormData, setEditFormData] = useState<Record<string, unknown>>({});
  const [editStatus, setEditStatus] = useState<'published' | 'draft'>('draft');
  const [showFieldManager, setShowFieldManager] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<ContentFieldType>('text');
  const [newFieldRequired, setNewFieldRequired] = useState(false);

  // Get items/fields with local overrides
  const currentItems = localItems[activeType.id] ?? activeType.items;
  const currentFields = localFields[activeType.id] ?? activeType.fields;

  const columns = getColumns({ ...activeType, fields: currentFields });

  const filtered = currentItems.filter((item) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return columns.some((col) => cellValue(item, col).toLowerCase().includes(q));
  });

  // ── Item Editor Handlers ──────────────────────────────────
  function openEditor(item: ContentItem) {
    setEditingItem(item);
    setEditFormData({ ...item.data });
    setEditStatus(item.status);
  }

  function closeEditor() {
    setEditingItem(null);
    setEditFormData({});
  }

  function handleAddNew() {
    const now = new Date().toISOString();
    const newItem: ContentItem = {
      id: `item-${Date.now()}`,
      data: {},
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    };
    const updated = [...currentItems, newItem];
    setLocalItems((prev) => ({ ...prev, [activeType.id]: updated }));
    openEditor(newItem);
  }

  function handleSave() {
    if (!editingItem) return;
    const now = new Date().toISOString();
    const updatedItem: ContentItem = {
      ...editingItem,
      data: { ...editFormData },
      status: editStatus,
      updatedAt: now,
    };
    const updatedItems = currentItems.map((item) =>
      item.id === editingItem.id ? updatedItem : item,
    );
    setLocalItems((prev) => ({ ...prev, [activeType.id]: updatedItems }));
    setEditingItem(updatedItem);
  }

  function handleDelete() {
    if (!editingItem) return;
    const updatedItems = currentItems.filter((item) => item.id !== editingItem.id);
    setLocalItems((prev) => ({ ...prev, [activeType.id]: updatedItems }));
    closeEditor();
  }

  function handleFieldChange(fieldName: string, value: unknown) {
    setEditFormData((prev) => ({ ...prev, [fieldName.toLowerCase()]: value }));
  }

  // ── Field Manager Handlers ────────────────────────────────
  function handleAddField() {
    if (!newFieldName.trim()) return;
    const newField: ContentField = {
      id: `field-${Date.now()}`,
      name: newFieldName.trim(),
      type: newFieldType,
      required: newFieldRequired,
    };
    const updated = [...currentFields, newField];
    setLocalFields((prev) => ({ ...prev, [activeType.id]: updated }));
    setNewFieldName('');
    setNewFieldType('text');
    setNewFieldRequired(false);
  }

  function handleRemoveField(fieldId: string) {
    const updated = currentFields.filter((f) => f.id !== fieldId);
    setLocalFields((prev) => ({ ...prev, [activeType.id]: updated }));
  }

  function handleToggleFieldRequired(fieldId: string) {
    const updated = currentFields.map((f) =>
      f.id === fieldId ? { ...f, required: !f.required } : f,
    );
    setLocalFields((prev) => ({ ...prev, [activeType.id]: updated }));
  }

  // ── Render field input ────────────────────────────────────
  function renderFieldInput(field: ContentField) {
    const key = field.name.toLowerCase();
    const value = editFormData[key];
    const inputClasses =
      'w-full rounded-lg border border-border bg-bg-elevated px-4 py-2.5 text-sm text-text focus:border-accent focus:outline-none';

    switch (field.type) {
      case 'text':
        return (
          <input
            type="text"
            value={(value as string) ?? ''}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            className={inputClasses}
          />
        );
      case 'richtext':
        return (
          <textarea
            rows={4}
            value={(value as string) ?? ''}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            className={inputClasses + ' resize-none'}
          />
        );
      case 'image':
        return (
          <div className="relative">
            <Image
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              type="text"
              placeholder="Image URL..."
              value={(value as string) ?? ''}
              onChange={(e) => handleFieldChange(field.name, e.target.value)}
              className={inputClasses + ' pl-10'}
            />
          </div>
        );
      case 'date':
        return (
          <input
            type="date"
            value={(value as string) ?? ''}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            className={inputClasses}
          />
        );
      case 'url':
        return (
          <input
            type="url"
            placeholder="https://..."
            value={(value as string) ?? ''}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            className={inputClasses}
          />
        );
      case 'number':
        return (
          <input
            type="number"
            value={(value as number) ?? ''}
            onChange={(e) =>
              handleFieldChange(field.name, e.target.value ? Number(e.target.value) : '')
            }
            className={inputClasses}
          />
        );
      case 'boolean':
        return (
          <button
            type="button"
            onClick={() => handleFieldChange(field.name, !value)}
            className="flex items-center gap-2"
          >
            {value ? (
              <ToggleRight size={32} className="text-accent" />
            ) : (
              <ToggleLeft size={32} className="text-text-muted" />
            )}
            <span className="text-sm text-text-secondary">
              {value ? 'Yes' : 'No'}
            </span>
          </button>
        );
      case 'select':
        return (
          <select
            value={(value as string) ?? ''}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            className={inputClasses}
          >
            <option value="">Select...</option>
            <option value="option-1">Option 1</option>
            <option value="option-2">Option 2</option>
            <option value="option-3">Option 3</option>
          </select>
        );
      case 'email':
        return (
          <input
            type="email"
            placeholder="email@example.com"
            value={(value as string) ?? ''}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            className={inputClasses}
          />
        );
      default:
        return (
          <input
            type="text"
            value={(value as string) ?? ''}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            className={inputClasses}
          />
        );
    }
  }

  return (
    <div className="relative flex h-full w-full flex-col p-8">
      {/* ── Header + Toolbar ───────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-3">
          <h2 className="font-heading text-lg font-semibold text-text">{activeType.name}</h2>
          <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs text-accent">
            {currentItems.length}
          </span>
          <button
            onClick={() => setShowFieldManager(true)}
            className="flex items-center gap-1.5 ml-2 text-xs text-text-muted transition-colors hover:text-text-secondary"
          >
            <Settings size={13} />
            <span>Fields</span>
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="relative max-w-sm flex-1">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${activeType.name}...`}
            className="w-full rounded-lg border border-border bg-bg-card py-2 pl-9 pr-3 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
        </div>
        <button
          onClick={handleAddNew}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-brand-950 transition-colors hover:bg-accent-hover"
        >
          <Plus size={15} />
          <span>Add new</span>
        </button>
      </div>

      {/* ── Data table ─────────────────────────────────────────── */}
      <div className="mt-6 flex-1 overflow-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  className="pb-4 pr-6 text-[11px] font-semibold uppercase tracking-wider text-text-muted"
                >
                  {col}
                </th>
              ))}
              <th className="pb-4 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr
                key={item.id}
                onClick={() => openEditor(item)}
                className="cursor-pointer border-b border-border-subtle transition-colors hover:bg-bg-card/50"
              >
                {columns.map((col, idx) => {
                  const val = cellValue(item, col);
                  const isTitle = idx === 0;
                  return (
                    <td
                      key={col}
                      className={`py-4.5 pr-6 text-sm max-w-[220px] truncate ${
                        isTitle
                          ? 'font-medium text-accent hover:text-accent-hover max-w-[180px]'
                          : 'text-text-secondary'
                      }`}
                      title={val}
                    >
                      {val}
                    </td>
                  );
                })}
                <td className="py-4.5">
                  {item.status === 'published' ? (
                    <span className="rounded-full bg-badge-published/20 px-2.5 py-0.5 text-xs text-status-green">
                      Published
                    </span>
                  ) : (
                    <span className="rounded-full bg-badge-draft/20 px-2.5 py-0.5 text-xs text-text-muted">
                      Draft
                    </span>
                  )}
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="py-12 text-center text-sm text-text-muted"
                >
                  No items found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Item Editor Slide-over ─────────────────────────────── */}
      <AnimatePresence>
        {editingItem && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-bg/80 backdrop-blur"
              onClick={closeEditor}
            />

            {/* Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 z-50 flex h-full w-[520px] flex-col rounded-l-xl border-l border-border bg-bg-card shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <div className="flex items-center gap-3">
                  <h2 className="font-heading text-base font-semibold text-text">
                    Edit {getItemTitle(editingItem, currentFields)}
                  </h2>
                  {editStatus === 'published' ? (
                    <span className="rounded-full bg-badge-published/20 px-3 py-1 text-xs text-status-green">
                      Published
                    </span>
                  ) : (
                    <span className="rounded-full bg-badge-draft/20 px-3 py-1 text-xs text-text-secondary">
                      Draft
                    </span>
                  )}
                </div>
                <button
                  onClick={closeEditor}
                  className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-hover hover:text-text"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body - scrollable */}
              <div className="flex-1 overflow-y-auto px-6 py-5">
                {currentFields.map((field) => (
                  <div key={field.id} className="mb-5">
                    <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
                      {field.name}
                      {field.required && (
                        <span className="ml-1 text-red-400">*</span>
                      )}
                    </label>
                    {renderFieldInput(field)}
                  </div>
                ))}
                {currentFields.length === 0 && (
                  <p className="text-sm text-text-muted">
                    No fields defined. Use "Manage Fields" to add some.
                  </p>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-border px-6 py-4">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditStatus('draft')}
                    className={`rounded-l-lg px-3 py-2 text-xs font-medium transition-colors ${
                      editStatus === 'draft'
                        ? 'bg-bg-elevated text-text'
                        : 'bg-bg-card text-text-muted hover:text-text-secondary'
                    }`}
                  >
                    Draft
                  </button>
                  <button
                    onClick={() => setEditStatus('published')}
                    className={`rounded-r-lg px-3 py-2 text-xs font-medium transition-colors ${
                      editStatus === 'published'
                        ? 'bg-badge-published/20 text-status-green'
                        : 'bg-bg-card text-text-muted hover:text-text-secondary'
                    }`}
                  >
                    Published
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm text-red-400 transition-colors hover:bg-red-400/10"
                  >
                    <Trash2 size={14} />
                    <span>Delete</span>
                  </button>
                  <button
                    onClick={handleSave}
                    className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-brand-950 transition-colors hover:bg-accent-hover"
                  >
                    <Check size={14} />
                    <span>Save Changes</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Field Manager Modal ────────────────────────────────── */}
      <AnimatePresence>
        {showFieldManager && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-bg/80 backdrop-blur"
              onClick={() => setShowFieldManager(false)}
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-bg-card p-6 shadow-2xl"
            >
              {/* Modal Header */}
              <div className="mb-5 flex items-center justify-between">
                <h2 className="font-heading text-base font-semibold text-text">
                  Manage Fields — {activeType.name}
                </h2>
                <button
                  onClick={() => setShowFieldManager(false)}
                  className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-hover hover:text-text"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Field List */}
              <div className="mb-5 max-h-[320px] space-y-2 overflow-y-auto">
                {currentFields.map((field) => (
                  <div
                    key={field.id}
                    className="flex items-center justify-between rounded-lg border border-border-subtle bg-bg-card px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-text">
                        {field.name}
                      </span>
                      <span className="rounded-md bg-bg-elevated px-2 py-0.5 text-[11px] font-medium text-text-secondary">
                        {field.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleToggleFieldRequired(field.id)}
                        className="flex items-center gap-1.5 text-xs text-text-muted transition-colors hover:text-text-secondary"
                      >
                        {field.required ? (
                          <ToggleRight size={20} className="text-accent" />
                        ) : (
                          <ToggleLeft size={20} className="text-text-muted" />
                        )}
                        <span>Required</span>
                      </button>
                      <button
                        onClick={() => handleRemoveField(field.id)}
                        className="rounded p-1 text-text-muted transition-colors hover:bg-red-400/10 hover:text-red-400"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                {currentFields.length === 0 && (
                  <p className="py-4 text-center text-sm text-text-muted">
                    No fields yet. Add one below.
                  </p>
                )}
              </div>

              {/* Add Field Form */}
              <div className="rounded-lg border border-border bg-bg-card p-4">
                <p className="mb-3 text-xs font-medium uppercase tracking-wider text-text-muted">
                  Add Field
                </p>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={newFieldName}
                      onChange={(e) => setNewFieldName(e.target.value)}
                      placeholder="Field name"
                      className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
                    />
                  </div>
                  <div>
                    <select
                      value={newFieldType}
                      onChange={(e) => setNewFieldType(e.target.value as ContentFieldType)}
                      className="rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
                    >
                      {FIELD_TYPE_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <input
                      type="checkbox"
                      checked={newFieldRequired}
                      onChange={(e) => setNewFieldRequired(e.target.checked)}
                      className="rounded border-border"
                    />
                    Req
                  </label>
                  <button
                    onClick={handleAddField}
                    className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-brand-950 transition-colors hover:bg-accent-hover"
                  >
                    <Plus size={14} />
                    <span>Add</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
