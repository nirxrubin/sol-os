/**
 * API client for the HostaPosta control-plane server.
 * Vite dev proxy forwards /api → http://localhost:4000.
 */

export interface TenantInfo {
  slug: string;
  siteName: string;
  lang: string;
  dir: "ltr" | "rtl";
  routes: string[];
  hasCarveMap: boolean;
  hasEdits: boolean;
}

export interface PageInfo {
  route: string;
  totalEdits: number;
  editedCount: number;
}

export interface PageEdit {
  id: string;
  kind: string;
  label?: string;
  current: string;
  selector: string;
  attribute?: string;
  value: string | null;
}

export interface PageDetail {
  route: string;
  title?: string;
  edits: PageEdit[];
  notes: string[];
}

export interface RebuildResult {
  ok: boolean;
  durationMs: number;
  log?: string;
  error?: string;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errMsg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error) errMsg = body.error;
    } catch { /* ignore */ }
    throw new Error(errMsg);
  }
  return (await res.json()) as T;
}

export const api = {
  async listTenants(): Promise<TenantInfo[]> {
    const { tenants } = await json<{ tenants: TenantInfo[] }>(
      await fetch("/api/tenants"),
    );
    return tenants;
  },

  async getTenant(slug: string): Promise<TenantInfo> {
    const { tenant } = await json<{ tenant: TenantInfo }>(
      await fetch(`/api/tenants/${encodeURIComponent(slug)}`),
    );
    return tenant;
  },

  async listPages(slug: string): Promise<PageInfo[]> {
    const { pages } = await json<{ pages: PageInfo[] }>(
      await fetch(`/api/tenants/${encodeURIComponent(slug)}/pages`),
    );
    return pages;
  },

  async getPage(slug: string, route: string): Promise<PageDetail> {
    const qs = new URLSearchParams({ route });
    const { page } = await json<{ page: PageDetail }>(
      await fetch(`/api/tenants/${encodeURIComponent(slug)}/page?${qs}`),
    );
    return page;
  },

  async saveEdits(slug: string, patch: Record<string, string>): Promise<void> {
    await json(
      await fetch(`/api/tenants/${encodeURIComponent(slug)}/edits`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }),
    );
  },

  async clearEdit(slug: string, editId: string): Promise<void> {
    await json(
      await fetch(
        `/api/tenants/${encodeURIComponent(slug)}/edits/${encodeURIComponent(editId)}`,
        { method: "DELETE" },
      ),
    );
  },

  async rebuild(slug: string): Promise<RebuildResult> {
    const { result } = await json<{ result: RebuildResult }>(
      await fetch(`/api/tenants/${encodeURIComponent(slug)}/rebuild`, { method: "POST" }),
    );
    return result;
  },
};
