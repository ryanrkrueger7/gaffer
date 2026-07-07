'use server';

import { createClient } from '@supabase/supabase-js';
import { deserializeDocument } from '@/lib/engine/serialize';
import type { GafferDocument } from '@/lib/engine/types';

const TABLE = 'documents';

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface DocSummary {
  id: string;
  doc_id: string;
  name: string;
  updated_at: string;
}

export async function saveDoc(doc: GafferDocument): Promise<{ error?: string }> {
  const { error } = await db()
    .from(TABLE)
    .upsert(
      {
        doc_id: doc.meta.id,
        name: doc.meta.name || 'Untitled',
        doc: doc as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'doc_id' },
    );
  return error ? { error: error.message } : {};
}

export async function listDocs(): Promise<DocSummary[]> {
  const { data, error } = await db()
    .from(TABLE)
    .select('id, doc_id, name, updated_at')
    .order('updated_at', { ascending: false });
  if (error) console.error('[Gaffer] listDocs failed:', error.message);
  return (data as DocSummary[]) ?? [];
}

export async function fetchDoc(id: string): Promise<GafferDocument | null> {
  const { data } = await db()
    .from(TABLE)
    .select('doc')
    .eq('id', id)
    .single();
  if (!data) return null;
  try {
    return deserializeDocument(JSON.stringify(data.doc));
  } catch {
    return null;
  }
}

/**
 * Rename a saved document.
 * Writes `name` column AND patches `doc->meta->name` inside the JSONB in one
 * update so the two are never out of sync — preventing a subsequent saveDoc
 * from reverting the name via the stale doc.meta.name it holds.
 */
export async function renameDoc(id: string, name: string): Promise<{ error?: string }> {
  const client = db();

  // Fetch the stored JSONB so we can patch meta.name inside it.
  const { data, error: fetchErr } = await client
    .from(TABLE)
    .select('doc')
    .eq('id', id)
    .single();
  if (fetchErr || !data) return { error: fetchErr?.message ?? 'document not found' };

  const stored = data.doc as Record<string, unknown>;
  const patchedDoc = {
    ...stored,
    meta: { ...(stored.meta as Record<string, unknown>), name },
  };

  const { error } = await client
    .from(TABLE)
    .update({ name, doc: patchedDoc, updated_at: new Date().toISOString() })
    .eq('id', id);
  return error ? { error: error.message } : {};
}

export async function deleteDoc(id: string): Promise<{ error?: string }> {
  const { error } = await db().from(TABLE).delete().eq('id', id);
  return error ? { error: error.message } : {};
}
