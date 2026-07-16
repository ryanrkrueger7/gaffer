// Gaffer narration head — §6.1 with register, disambiguation, reception model,
// carries (Scope A), shots (Scope B), and run-term integration (Phase 1C).
//
// Pure function — no React, no Zustand, no fetch, no side effects.
// Imports: lib/engine (possession authority) + lib/knowledge (dictionary).
// lib/engine and lib/knowledge must NEVER import from lib/intelligence.

import type { GafferDocument, PassAction, CarryAction, RunAction, PlayerEntity } from '../engine/types';
import { resolvePosition } from '../engine/resolve';
import { ROLE_ENTRIES, roleToLine } from '../knowledge/roles';
import { classifyPassDirection, classifyReception, classifyCarryLateral } from '../knowledge/passDirection';
import type { PassDirection, ReceptionClassification } from '../knowledge/passDirection';
import { matchSignatures } from '../knowledge/signatures/index';
import type { MatchedTerm } from '../knowledge/signatures/matcher';
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
  /**
   * FIX 0: When true, per-predicate pass/fail diagnostics from the signature
   * matcher are appended to NarrationResult.notes. Toggle the debug checkbox
   * in the narration panel to activate.
   */
  debug?: boolean;
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
 * Narrate a document's ball events and matched run terms as connected clauses.
 *
 * Phase 1C additions:
 *   - Run beats: matched run terms emit a clause at their temporal position.
 *     Unmatched runs are silent.
 *   - ACT_LAYOFF_UNDERNEATH: when matched on a pass, its phrase replaces verbFor().
 *     This prevents "lays it off / lays it off underneath" doubling — the
 *     reception-classification verb is skipped entirely when the term fires,
 *     and the signature phrase is used in its place.
 *   - Lifecycle continuation: when a matched run term resolves to a later pass
 *     that delivers the ball to the runner, the receiving clause text becomes
 *     "${receiver}, continuing his run, receives from ${passer}" and references
 *     the run term's id. If ACT_LAYOFF_UNDERNEATH also fires on that pass, the
 *     combined clause is "${passer} lays it off underneath to ${receiver},
 *     continuing his run."
 */
export function narrate(doc: GafferDocument, opts?: NarrationOptions): NarrationResult {
  const register = opts?.register ?? 'name';
  const debug    = opts?.debug ?? false;
  const notes: string[] = [];
  const clauses: NarrationClause[] = [];

  // ── 0. Integrity check — deduplicate action IDs ───────────────────────────
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

  // ── 1. Run the signature matcher ──────────────────────────────────────────
  const debugNotes: string[] = [];
  const matchedTerms = matchSignatures(
    { ...doc, actions: dedupedActions },
    doc.frame,
    doc.beats,
    debug ? debugNotes : undefined,
  );
  if (debug && debugNotes.length > 0) {
    notes.push('── matcher debug ──');
    notes.push(...debugNotes);
  }

  // Index matched terms by action id for fast lookup.
  const termsByActionId = new Map<string, MatchedTerm>();
  for (const mt of matchedTerms) {
    termsByActionId.set(mt.actionId, mt);
  }

  // Build a reverse index: passActionId → run MatchedTerm (lifecycle resolution).
  // When a pass resolves a run term, the receiving clause is modified.
  const resolvedRunAtPass = new Map<string, MatchedTerm>();
  for (const mt of matchedTerms) {
    if (mt.resolution !== 'unresolved') {
      resolvedRunAtPass.set(mt.resolution.receivingPassActionId, mt);
    }
  }

  // ── 2. Walk timeline and collect story items ──────────────────────────────

  type PassItem  = { type: 'pass';  action: PassAction;  receiver: PlayerEntity; targetEntityId: string };
  type ShotItem  = { type: 'shot';  action: PassAction;  passer: PlayerEntity };
  type CarryItem = { type: 'carry'; action: CarryAction; carrier: PlayerEntity };
  type RunItem   = { type: 'run';   action: RunAction;   runner: PlayerEntity;   term: MatchedTerm };
  type StoryItem = PassItem | ShotItem | CarryItem | RunItem;

  const sortedActions = dedupedActions.sort((a, b) => a.start - b.start);
  const story: StoryItem[] = [];

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

      if (targetEntity.kind === 'goal' || targetEntity.kind === 'minigoal') {
        const passer = doc.entities.find(
          (e): e is PlayerEntity => e.id === action.entityId && e.kind === 'player',
        );
        if (passer) {
          story.push({ type: 'shot', action, passer });
        } else {
          notes.push(`Pass ${action.id}: passer not found for shot — skipped.`);
        }
        continue;
      }

      if (targetEntity.kind !== 'player') {
        notes.push(`Pass ${action.id}: target ${targetEntityId} is a ${targetEntity.kind} — skipped.`);
        continue;
      }

      story.push({
        type: 'pass',
        action,
        receiver: targetEntity as PlayerEntity,
        targetEntityId,
      });

    } else if (action.kind === 'carry') {
      const carrier = doc.entities.find(
        (e): e is PlayerEntity => e.id === action.entityId && e.kind === 'player',
      );
      if (carrier) {
        story.push({ type: 'carry', action, carrier });
      }

    } else if (action.kind === 'run') {
      // Only include runs that matched a signature term.
      const mt = termsByActionId.get(action.id);
      if (!mt) continue; // unmatched runs are silent

      const runner = doc.entities.find(
        (e): e is PlayerEntity => e.id === action.entityId && e.kind === 'player',
      );
      if (runner) {
        story.push({ type: 'run', action, runner, term: mt });
      }
    }
    // mark, hold — skip silently
  }

  if (story.length === 0) {
    notes.push('No narrable events found in this document.');
    return { clauses, ok: false, notes };
  }

  // ── 3. Build label maps ───────────────────────────────────────────────────

  const allPlayers = new Map<string, PlayerEntity>();
  for (const item of story) {
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
    } else if (item.type === 'run') {
      allPlayers.set(item.runner.id, item.runner);
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

  // ── 4. Emit clauses ───────────────────────────────────────────────────────

  const lastIncomingDir = new Map<string, PassDirection>();
  let clauseIndex = 0;

  for (const item of story) {

    // ── RUN ──────────────────────────────────────────────────────────────────
    if (item.type === 'run') {
      const { action, runner, term } = item;

      const termIds: string[] = [term.termId, ...term.subsumedTermIds];
      const rtId = termIdOf(runner.id);
      if (rtId) termIds.push(rtId);

      clauses.push({
        text: `${labelOf(runner.id)} ${term.phrase.primary}`,
        beatIndex: clauseIndex,
        actionId: action.id,
        termIds,
        entityIds: [runner.id],
      });
      clauseIndex++;

    // ── PASS ─────────────────────────────────────────────────────────────────
    } else if (item.type === 'pass') {
      const { action, targetEntityId } = item;

      const passer = doc.entities.find(
        (e): e is PlayerEntity => e.id === action.entityId && e.kind === 'player',
      );
      if (!passer) {
        notes.push(`Pass ${action.id}: passer not found — skipped.`);
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

      // Check if ACT_LAYOFF_UNDERNEATH fires on this pass.
      const layoffTerm = termsByActionId.get(action.id);
      const isLayoff = layoffTerm?.termId === 'act.layoff_underneath';

      // Check if a run term resolves at this pass (lifecycle continuation).
      const resolvedRun = resolvedRunAtPass.get(action.id);

      let text: string;
      const termIds: string[] = [];
      const ptId = termIdOf(action.entityId);
      const rtId = termIdOf(targetEntityId);
      if (ptId) termIds.push(ptId);
      if (rtId) termIds.push(rtId);
      termIds.push(`direction.${outgoingDir}`);

      // FIX 3: "continuing his run" only for spatial movement terms (overlap / run in behind).
      // MOV_CHECK_TO_BALL resolutions narrate plainly — no continuation phrase.
      const usesContinuation = resolvedRun?.termId === 'mov.overlap' || resolvedRun?.termId === 'mov.run_in_behind';

      if (resolvedRun && isLayoff) {
        // FIX 4: combined lifecycle + layoff — receiver-first so "continuing his run"
        // names the correct player (the receiver/runner, not the passer).
        text = usesContinuation
          ? `${labelOf(targetEntityId)}, continuing his run, receives the layoff from ${labelOf(action.entityId)}`
          : `${labelOf(targetEntityId)} receives the layoff from ${labelOf(action.entityId)}`;
        termIds.push(layoffTerm!.termId, ...layoffTerm!.subsumedTermIds);
        termIds.push(resolvedRun.termId, ...resolvedRun.subsumedTermIds);

      } else if (resolvedRun) {
        // Lifecycle continuation only — receiver-first per spec.
        text = usesContinuation
          ? `${labelOf(targetEntityId)}, continuing his run, receives from ${labelOf(action.entityId)}`
          : `${labelOf(targetEntityId)} receives from ${labelOf(action.entityId)}`;
        termIds.push(resolvedRun.termId, ...resolvedRun.subsumedTermIds);

      } else if (isLayoff) {
        // ACT_LAYOFF_UNDERNEATH replaces the reception verb to avoid doubling.
        // Normal verbFor would return "lays it off to" / "bounces it back to";
        // we use the signature phrase "lays it off underneath to" instead.
        const phrase = layoffTerm!.phrase.primary;
        text = `${labelOf(action.entityId)} ${phrase} ${labelOf(targetEntityId)}`;
        termIds.push(layoffTerm!.termId, ...layoffTerm!.subsumedTermIds);

      } else {
        // Standard reception-model clause.
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

        if (receptionKind) termIds.push(`reception.${receptionKind}`);
        text = `${labelOf(action.entityId)} ${verb} ${labelOf(targetEntityId)}`;
      }

      lastIncomingDir.set(targetEntityId, outgoingDir);

      clauses.push({
        text,
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

      lastIncomingDir.clear();

    // ── CARRY (Scope A) ───────────────────────────────────────────────────────
    } else if (item.type === 'carry') {
      const { action, carrier } = item;

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

        const lateral = classifyCarryLateral(carrierPos.x, action.destination.x);
        if (lateral) { lateralWord = lateral; lateralTermId = `lateral.${lateral}`; }
      }

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

      lastIncomingDir.delete(carrier.id);
    }
  }

  return { clauses, ok: clauses.length > 0, notes };
}

// ── Correction hook (§6.3 seam) ───────────────────────────────────────────────

export function logCorrection(event: CorrectionEvent): void {
  // eslint-disable-next-line no-console
  console.debug('[intelligence] correction', event);
}
