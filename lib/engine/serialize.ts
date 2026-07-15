import type { GafferDocument, Frame } from './types';

export function serializeDocument(doc: GafferDocument): string {
  return JSON.stringify(doc, null, 2);
}

/**
 * Build a Frame from an old document that predates the frame field.
 *
 * Migration rules (§3.6):
 * - team A attackingDirection = stage.direction, directionSource 'explicit'
 *   (the coach set this via the runtime toggle — treat it as intentional).
 * - team B (if present in stage.teams) gets the opposite direction, 'derived'.
 * - regime: any goal or mini-goal entity present → 'single-direction', else 'none'.
 * - scoringTargets, identificationMode: conservative defaults ('none', 'positional').
 * - fieldExtent: copied from stage.fieldExtent.
 */
function migrateFrame(obj: Record<string, unknown>): Frame {
  const stage = (obj['stage'] ?? {}) as Record<string, unknown>;
  const stageDirection = (stage['direction'] as 'up' | 'down') ?? 'up';
  const stageTeams = (stage['teams'] as Array<{ id: string; color: string }>) ?? [];
  const stageFieldExtent = (stage['fieldExtent'] as 'full' | 'half' | 'blank') ?? 'full';
  const entities = (obj['entities'] as Array<Record<string, unknown>>) ?? [];

  // Build per-team directions from stage state.
  const frameTeams: Frame['teams'] = stageTeams.map((t, i) => ({
    id: t.id,
    color: t.color,
    attackingDirection: i === 0 ? stageDirection : (stageDirection === 'up' ? 'down' : 'up'),
    directionSource: i === 0 ? 'explicit' : 'derived',
  }));

  // Regime: goal or mini-goal entity present → 'single-direction'.
  const hasGoalEntity = entities.some(
    (e) => e['kind'] === 'goal' || e['kind'] === 'minigoal',
  );

  return {
    regime: hasGoalEntity ? 'single-direction' : 'none',
    regimeSource: 'derived',
    teams: frameTeams,
    identificationMode: 'positional',
    identificationModeSource: 'derived',
    fieldExtent: stageFieldExtent,
    scoringTargets: 'none',
    scoringTargetsSource: 'derived',
  };
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

  // Migration: old documents without `frame` get one synthesized from stage.
  // New documents already carry frame in their JSON — no-op for them.
  if (!('frame' in obj)) {
    obj['frame'] = migrateFrame(obj);
  }

  // Integrity check: warn on duplicate action ids in persisted data.
  // Action ids are crypto.randomUUID() — duplicates indicate storage corruption.
  const actions = obj['actions'] as Array<{ id?: unknown }>;
  const actionIds = new Set<string>();
  for (const a of actions) {
    const id = typeof a['id'] === 'string' ? a['id'] : null;
    if (id !== null) {
      if (actionIds.has(id)) {
        console.warn(`[deserializeDocument] duplicate action id "${id}" in persisted document — possible data corruption.`);
      }
      actionIds.add(id);
    }
  }

  return obj as unknown as GafferDocument;
}
