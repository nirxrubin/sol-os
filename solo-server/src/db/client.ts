import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
}

// Service role client — server-side only, never exposed to browser
export const db = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

// ─── Project helpers ──────────────────────────────────────────────────────────

export async function createProject(data: {
  name: string;
  slug: string;
  projectRoot: string;
  workspaceId?: string;
}) {
  const { data: project, error } = await db
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
  const { error } = await db
    .from('projects')
    .update(updates)
    .eq('id', id);

  if (error) throw new Error(`Failed to update project: ${error.message}`);
}

export async function getProject(id: string) {
  const { data, error } = await db
    .from('projects')
    .select('*, content_types(*)')
    .eq('id', id)
    .single();

  if (error) throw new Error(`Failed to get project: ${error.message}`);
  return data;
}

export async function upsertContentTypes(projectId: string, contentTypes: {
  id: string;
  name: string;
  slug: string;
  sourceFile?: string;
  sourceVar?: string;
  fields: unknown[];
  items: unknown[];
}[]) {
  if (contentTypes.length === 0) return;

  const rows = contentTypes.map(ct => ({
    id: ct.id,
    project_id: projectId,
    name: ct.name,
    slug: ct.slug,
    source_file: ct.sourceFile ?? null,
    source_var: ct.sourceVar ?? null,
    fields: ct.fields,
    items: ct.items,
  }));

  const { error } = await db
    .from('content_types')
    .upsert(rows, { onConflict: 'id' });

  if (error) throw new Error(`Failed to upsert content types: ${error.message}`);
}

export async function createDeployRecord(data: {
  projectId: string;
  bundle: string;
  status: 'pending' | 'success' | 'failed';
  liveUrl?: string;
  error?: string;
}) {
  const { data: record, error } = await db
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
