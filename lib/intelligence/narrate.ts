// Gaffer narration head — §6.1 with register, disambiguation, reception model,
// carries (Scope A), and shots (Scope B).
//
// Pure function — no React, no Zustand, no fetch, no side effects.
// Imports: lib/engine (possession authority) + lib/knowledge (dictionary).
// lib/engine and lib/knowledge must NEVER import from lib/intelligence.

import type { GafferDocument, PassAction, CarryAction, PlayerEntity } from '../engine/types';
import { resolvePosition } from '../engine/resolve';
import { ROLE_ENTRIES, roleToLine } from '../knowledge/roles';
import { classifyPassDirection, classifyReception, classifyCarryLateral } from '../knowledge/passDirection';
import type { PassDirection, ReceptionClassification } from '../knowledge/passDirection';
import type { NarrationClause, NarrationResult, CorrectionEvent } from './types';

// ── Public option types ────────────────────────────────────────────────────────

export interface NarrationOptions {
  /**
   * Label register for player names.
   * 'name'   — always uses full positional term: "the striker", "the left winger"
   * 'number' — uses the "the N" alias where available, falls back to name style
   * Default: 'name'
   */
  register?: 'name' | 'number';
}

// ── Role label resolution ──────────────────────────────────────────────────────

function getLabelForPlayer(
  entity: PlayerEntity,
  register: 'name' | 'number',
): { label: string; termId: string | null } {
  const display = entity.display;
  const posId = display?.positionId ?? display?.inferredPositionId;

  if (posId) {
    const entry = ROLE_ENTRIES.find((e) => e.positionId === posId);
    if (entry) {
      if (register === 'number') {
        const numberAlias = entry.aliases.find((a) => /^the \d+$/.test(a));
        return { label: numberAlias ?? `the ${entry.term.toLowerCase()}`, termId: entry.id };
      }
      return { label: `the ${entry.term.toLowerCase()}`, termId: entry.id };
    }
  }

  if (display?.roleName) return { label: display.roleName, termId: null };
  if (display?.drillLabel) return { label: `player ${display.drillLabel}`, termId: null };
  return { label: 'a player', termId: null };
}

// ── Duplicate-label disambiguation ────────────────────────────────────────────

/**
 * Build a final label map, qualifying colliding labels by flank.
 * Only players appearing in the ball story are considered.
 */
function buildFinalLabels(
  players: Map<string, PlayerEntity>,
  rawLabels: Map<string, { label: string; termId: string | null }>,
  attackDirOf: (teamId: string | undefined) => 'up' | 'down' | 'left' | 'right',
): Map<string, string> {
  const labelToIds = new Map<string, string[]>();
  rawLabels.forEach(({ label }, id) => {
    const group = labelToIds.get(label) ?? [];
    group.push(id);
    labelToIds.set(label, group);
  });

  const finalLabels = new Map<string, string>();

  labelToIds.forEach((ids, label) => {
    if (ids.length === 1) {
      finalLabels.set(ids[0], label);
      return;
    }

    // Collision: qualify by flank.
    // lower x = left for 'up'/'right' attacking; lower x = right for 'down'/'left'.
    const teamId    = players.get(ids[0])?.team;
    const attackDir = attackDirOf(teamId);
    const invertX   = attackDir === 'down' || attackDir === 'left';

    const sorted = ids
      .map((id) => ({ id, x: players.get(id)!.initial.x }))
      .sort((a, b) => invertX ? b.x - a.x : a.x - b.x);

    const baseLabel = label.replace(/^the /, '');
    if (sorted.length === 2) {
      finalLabels.set(sorted[0].id, `the left-sided ${baseLabel}`);
      finalLabels.set(sorted[1].id, `the right-sided ${baseLabel}`);
    } else {
      for (let i = 0; i < sorted.length; i++) {
        const q = i === 0 ? 'left-sided' : i === sorted.length - 1 ? 'right-sided' : 'central';
        finalLabels.set(sorted[i].id, `the ${q} ${baseLabel}`);
      }
    }
  });

  return finalLabels;
}

// ── Verb selection ────────────────────────────────────────────────────────────

function verbFor(reception: ReceptionClassification, outgoingDir: PassDirection): string {
  switch (reception) {
    case 'turn':      return 'turns and plays';
    case 'half-turn': return 'receives on the half turn and plays';
    case 'layoff':    return outgoingDir === 'backward' ? 'bounces it back to' : 'lays it off to';
    case 'plain':     return 'plays';
  }
}

// ── Main narration function ───────────────────────────────────────────────────

/**
 * Narrate a document's ball events as connected possession clauses.
 *
 * Handles: player-to-player passes, carries (Scope A), shots to goal/mini-goal (Scope B).
 * Applies: register consistency (FIX 1), duplicate-label disambiguation (FIX 2),
 * and the reception-orientation model (FIX 4).
 *
 * Never throws — degradation messages appear in result.notes.
 */
export function narrate(doc: GafferDocument, opts?: NarrationOptions): NarrationResult {
  const register = opts?.register ?? 'name';
  const notes: string[] = [];
  const clauses: NarrationClause[] = [];

  // ── 0. Integrity check — defensive deduplication of action IDs ───────────
  // Action IDs come from crypto.randomUUID() and cannot collide at creation.
  // If duplicates appear in the document (e.g. corrupted persisted state),
  // React key collisions in the narration list UI produce concatenated text.
  // Deduplicate here; first occurrence wins.
  const seenActionIds = new Set<string>();
  const dedupedActions: typeof doc.actions = [];
  for (const a of doc.actions) {
    if (seenActionIds.has(a.id)) {
      notes.push(`Integrity: duplicate action id ${a.id} in doc.actions — skipped second occurrence.`);
    } else {
      seenActionIds.add(a.id);
      dedupedActions.push(a);
    }
  }

  // ── 1. Walk timeline and collect ball story items ─────────────────────────

  type PassItem  = { type: 'pass';  action: PassAction;  receiver: PlayerEntity; targetEntityId: string };
  type ShotItem  = { type: 'shot';  action: PassAction;  passer: PlayerEntity };
  type CarryItem = { type: 'carry'; action: CarryAction; carrier: PlayerEntity };
  type BallItem  = PassItem | ShotItem | CarryItem;

  const sortedActions = dedupedActions.sort((a, b) => a.start - b.start);
  const ballStory: BallItem[] = [];

  for (const action of sortedActions) {
    if (action.kind === 'pass') {
      if (!('entityId' in action.target)) {
        notes.push(`Pass ${action.id}: targets raw coordinates — skipped.`);
        continue;
      }

      const targetEntityId = action.target.entityId;
      const targetEntity   = doc.entities.find((e) => e.id === targetEntityId);

      if (!targetEntity) {
        notes.push(`Pass ${action.id}: target ${targetEntityId} not found — skipped.`);
        continue;
      }

      // SCOPE B — shot: pass directed at a goal or mini-goal entity
      if (targetEntity.kind === 'goal' || targetEntity.kind === 'minigoal') {
        const passer = doc.entities.find(
          (e): e is PlayerEntity => e.id === action.entityId && e.kind === 'player',
        );
        if (passer) {
          ballStory.push({ type: 'shot', action, passer });
        } else {
          notes.push(`Pass ${action.id}: passer ${action.entityId} not found for shot — skipped.`);
        }
        continue;
      }

      if (targetEntity.kind !== 'player') {
        notes.push(`Pass ${action.id}: target ${targetEntityId} is a ${targetEntity.kind} — skipped.`);
        continue;
      }

      ballStory.push({
        type: 'pass',
        action,
        receiver: targetEntity as PlayerEntity,
        targetEntityId,
      });

    } else if (action.kind === 'carry') {
      // SCOPE A — carry beat
      const carrier = doc.entities.find(
        (e): e is PlayerEntity => e.id === action.entityId && e.kind === 'player',
      );
      if (carrier) {
        ballStory.push({ type: 'carry', action, carrier });
      }
    }
    // run, mark, hold — skip silently
  }

  if (ballStory.length === 0) {
    notes.push('No ball events found in this document.');
    return { clauses, ok: false, notes };
  }

  // ── 2. Build label maps (raw + collision-disambiguated) ───────────────────

  const allPlayers = new Map<string, PlayerEntity>();

  for (const item of ballStory) {
    if (item.type === 'pass') {
      const passer = doc.entities.find(
        (e): e is PlayerEntity => e.id === item.action.entityId && e.kind === 'player',
      );
      if (passer) allPlayers.set(passer.id, passer);
      allPlayers.set(item.receiver.id, item.receiver);
    } else if (item.type === 'shot') {
      allPlayers.set(item.passer.id, item.passer);
    } else if (item.type === 'carry') {
      allPlayers.set(item.carrier.id, item.carrier);
    }
  }

  const rawLabels = new Map<string, { label: string; termId: string | null }>();
  allPlayers.forEach((entity, id) => {
    rawLabels.set(id, getLabelForPlayer(entity, register));
  });

  const attackDirOf = (teamId: string | undefined): 'up' | 'down' | 'left' | 'right' => {
    const frameTeam = doc.frame.teams.find((t) => t.id === teamId);
    return frameTeam?.attackingDirection ?? 'up';
  };

  const finalLabels = buildFinalLabels(allPlayers, rawLabels, attackDirOf);

  const labelOf = (id: string): string =>
    finalLabels.get(id) ?? rawLabels.get(id)?.label ?? 'a player';
  const termIdOf = (id: string): string | null =>
    rawLabels.get(id)?.termId ?? null;

  // ── 3. Emit one clause per ball story item ────────────────────────────────

  // Reception model: tracks the last pass direction arriving to each player.
  // A carry resets the carrier's entry (they reorient themselves).
  const lastIncomingDir = new Map<string, PassDirection>();

  let clauseIndex = 0;

  for (const item of ballStory) {

    // ── PASS ─────────────────────────────────────────────────────────────────
    if (item.type === 'pass') {
      const { action, targetEntityId } = item;

      const passer = doc.entities.find(
        (e): e is PlayerEntity => e.id === action.entityId && e.kind === 'player',
      );
      if (!passer) {
        notes.push(`Pass ${action.id}: passer ${action.entityId} not found — skipped.`);
        continue;
      }

      const passerPos   = resolvePosition(doc, action.entityId, action.start);
      const receiverPos = resolvePosition(doc, targetEntityId, action.start + action.duration);
      const atkDir      = attackDirOf(passer.team);

      const outgoingDir = classifyPassDirection(
        passerPos.x, passerPos.y,
        receiverPos.x, receiverPos.y,
        atkDir,
      );

      // Select verb using reception model; first ball event always uses "plays".
      let verb: string;
      let receptionKind: ReceptionClassification | null = null;

      const incomingDir = lastIncomingDir.get(action.entityId);
      if (clauseIndex === 0 || !incomingDir) {
        verb = 'plays';
      } else {
        const posId = passer.display?.positionId ?? passer.display?.inferredPositionId;
        const line  = posId ? roleToLine(posId) : 'unknown';
        receptionKind = classifyReception(incomingDir, outgoingDir, line);
        verb = verbFor(receptionKind, outgoingDir);
      }

      // Record outgoing direction so the receiver's next pass can apply reception model.
      lastIncomingDir.set(targetEntityId, outgoingDir);

      const termIds: string[] = [];
      const ptId = termIdOf(action.entityId);
      const rtId = termIdOf(targetEntityId);
      if (ptId) termIds.push(ptId);
      if (rtId) termIds.push(rtId);
      termIds.push(`direction.${outgoingDir}`);
      if (receptionKind) termIds.push(`reception.${receptionKind}`);

      clauses.push({
        text: `${labelOf(action.entityId)} ${verb} ${labelOf(targetEntityId)}`,
        beatIndex: clauseIndex,
        actionId: action.id,
        termIds,
        entityIds: [action.entityId, targetEntityId],
      });
      clauseIndex++;

    // ── SHOT (Scope B) ────────────────────────────────────────────────────────
    } else if (item.type === 'shot') {
      const { action, passer } = item;

      const termIds: string[] = [];
      const ptId = termIdOf(passer.id);
      if (ptId) termIds.push(ptId);
      termIds.push('event.shot');

      clauses.push({
        text: `${labelOf(passer.id)} shoots`,
        beatIndex: clauseIndex,
        actionId: action.id,
        termIds,
        entityIds: [passer.id],
      });
      clauseIndex++;

      // Possession ends after a shot — clear reception tracking.
      lastIncomingDir.clear();

    // ── CARRY (Scope A) ───────────────────────────────────────────────────────
    } else if (item.type === 'carry') {
      const { action, carrier } = item;

      // Two independent direction components:
      //   axialWord  — forward / back (attack axis); omitted when square
      //   lateralWord — wide / infield / across (touchline axis); omitted when null
      let axialWord:   string | null = null;
      let lateralWord: string | null = null;
      let axialTermId:   string | null = null;
      let lateralTermId: string | null = null;

      if (action.destination) {
        const carrierPos = resolvePosition(doc, action.entityId, action.start);
        const atkDir     = attackDirOf(carrier.team);

        const axialDir = classifyPassDirection(
          carrierPos.x, carrierPos.y,
          action.destination.x, action.destination.y,
          atkDir,
        );
        if (axialDir === 'forward') { axialWord = 'forward'; axialTermId = 'direction.forward'; }
        else if (axialDir === 'backward') { axialWord = 'back'; axialTermId = 'direction.backward'; }
        // 'square' axial → no axial word

        const lateral = classifyCarryLateral(carrierPos.x, action.destination.x);
        if (lateral) { lateralWord = lateral; lateralTermId = `lateral.${lateral}`; }
      }

      // Compose direction suffix: "forward and wide", "infield", "across", "back", etc.
      let dirSuffix: string;
      if (axialWord && lateralWord) dirSuffix = ` ${axialWord} and ${lateralWord}`;
      else if (axialWord)           dirSuffix = ` ${axialWord}`;
      else if (lateralWord)         dirSuffix = ` ${lateralWord}`;
      else                          dirSuffix = '';

      const termIds: string[] = [];
      const ctId = termIdOf(carrier.id);
      if (ctId)         termIds.push(ctId);
      termIds.push('event.carry');
      if (axialTermId)   termIds.push(axialTermId);
      if (lateralTermId) termIds.push(lateralTermId);

      clauses.push({
        text: `${labelOf(carrier.id)} carries${dirSuffix}`,
        beatIndex: clauseIndex,
        actionId: action.id,
        termIds,
        entityIds: [carrier.id],
      });
      clauseIndex++;

      // Carry resets the carrier's orientation — next pass uses "plays" not a turn/layoff.
      lastIncomingDir.delete(carrier.id);
    }
  }

  return { clauses, ok: clauses.length > 0, notes };
}

// ── Correction hook (§6.3 seam) ───────────────────────────────────────────────

/**
 * Log a coach correction against a narration clause.
 * The signature is the §6.3 contract; wiring a correction store comes later.
 */
export function logCorrection(event: CorrectionEvent): void {
  // eslint-disable-next-line no-console
  console.debug('[intelligence] correction', event);
}
