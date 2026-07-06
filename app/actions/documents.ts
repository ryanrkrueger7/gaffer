'use server';

import { createClient } from '@supabase/supabase-js';
import { deserializeDocument } from '@/lib/engine/serialize';
import type { GafferDocument } from '@/lib/engine/types';

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
    .from('documents')
    .upsert(
      {
        doc_id: doc.meta.id,
        name: doc.meta.name,
        doc: doc as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'doc_id' },
    );
  return error ? { error: error.message } : {};
}

export async function listDocs(): Promise<DocSummary[]> {
  const { data } = await db()
    .from('documents')
    .select('id, doc_id, name, updated_at')
    .order('updated_at', { ascending: false });
  return (data as DocSummary[]) ?? [];
}

export async function fetchDoc(id: string): Promise<GafferDocument | null> {
  const { data } = await db()
    .from('documents')
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

export async function renameDoc(id: string, name: string): Promise<{ error?: string }> {
  const { error } = await db()
    .from('documents')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', id);
  return error ? { error: error.message } : {};
}

export async function deleteDoc(id: string): Promise<{ error?: string }> {
  const { error } = await db().from('documents').delete().eq('id', id);
  return error ? { error: error.message } : {};
}
