import type { GafferDocument } from './types';

export function serializeDocument(doc: GafferDocument): string {
  return JSON.stringify(doc, null, 2);
}

export function deserializeDocument(json: string): GafferDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('deserializeDocument: invalid JSON');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('deserializeDocument: expected a JSON object');
  }

  const obj = parsed as Record<string, unknown>;

  if (obj['schemaVersion'] !== 1) {
    throw new Error(
      `deserializeDocument: unsupported schemaVersion "${String(obj['schemaVersion'])}"`
    );
  }

  const requiredFields = ['meta', 'stage', 'entities', 'actions', 'beats', 'annotations', 'markup'];
  for (const field of requiredFields) {
    if (!(field in obj)) {
      throw new Error(`deserializeDocument: missing required field "${field}"`);
    }
  }

  const arrayFields = ['entities', 'actions', 'beats', 'annotations', 'markup'];
  for (const field of arrayFields) {
    if (!Array.isArray(obj[field])) {
      throw new Error(`deserializeDocument: "${field}" must be an array`);
    }
  }

  return obj as unknown as GafferDocument;
}
