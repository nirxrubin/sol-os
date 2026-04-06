import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Lazy singleton — env vars are read at first call, not at import time
let _db: SupabaseClient | null = null;

function getDb(): SupabaseClient {
  if (_db) return _db;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  _db = createClient(url, key, { auth: { persistSession: false } });
  return _db;
}

// ─── Project helpers ──────────────────────────────────────────────────────────

export async function createProject(data: {
  name: string;
  slug: string;
  projectRoot: string;
  workspaceId?: string;
}) {
  const { data: project, error } = await getDb()
    .from('projects')
    .insert({
      workspace_id: data.workspaceId ?? null,
      name: data.name,
      slug: data.slug,
      status: 'analyzing',
      project_root: data.projectRoot,
      serve_path: data.projectRoot,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create project: ${error.message}`);
  return project;
}

export async function updateProject(id: string, updates: Record<string, unknown>) {
  const { error } = await getDb()
    .from('projects')
    .update(updates)
    .eq('id', id);

  if (error) throw new Error(`Failed to update project: ${error.message}`);
}

export async function getProject(id: string) {
  const { data, error } = await getDb()
    .from('projects')
    .select('*, content_types(*)')
    .eq('id', id)
    .single();

  if (error) throw new Error(`Failed to get project: ${error.message}`);
  return data;
}

export async function upsertContentTypes(projectId: string, contentTypes: {
  name: string;
  slug: string;
  sourceFile?: string;
  sourceVar?: string;
  fields: unknown[];
  items: unknown[];
}[]) {
  if (contentTypes.length === 0) return;

  // Delete existing content types for this project and re-insert
  await getDb().from('content_types').delete().eq('project_id', projectId);

  const rows = contentTypes.map(ct => ({
    project_id: projectId,
    name: ct.name,
    slug: ct.slug,
    source_file: ct.sourceFile ?? null,
    source_var: ct.sourceVar ?? null,
    fields: ct.fields,
    items: ct.items,
  }));

  const { error } = await getDb()
    .from('content_types')
    .insert(rows);

  if (error) throw new Error(`Failed to upsert content types: ${error.message}`);
}

export async function createDeployRecord(data: {
  projectId: string;
  bundle: string;
  status: 'pending' | 'success' | 'failed';
  liveUrl?: string;
  error?: string;
}) {
  const { data: record, error } = await getDb()
    .from('deploy_records')
    .insert({
      project_id: data.projectId,
      bundle: data.bundle,
      status: data.status,
      live_url: data.liveUrl ?? null,
      error: data.error ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create deploy record: ${error.message}`);
  return record;
}
