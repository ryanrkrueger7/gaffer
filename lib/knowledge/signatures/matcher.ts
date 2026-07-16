// Gaffer — signature matcher (Phase 1B).
// Pure, synchronous. No React, no UI, no side effects.
// lib/knowledge may import lib/engine but NEVER lib/intelligence.

import type { GafferDocument, RunAction, PassAction, Action } from '../../engine/types';
import type { Frame, Beat } from '../../engine/types';
import { roleToLine } from '../roles';
import { receiverOf } from '../primitives';
import { resolvePosition } from '../../engine/resolve';

// ── Run-chaining constants ────────────────────────────────────────────────────

/**
 * Maximum distance (px) between the resolved end-position of run R1 and the
 * start-position of run R2 for R2 to be considered an extension of R1.
 */
export const EXTENSION_SPATIAL_THRESHOLD_PX = 40;

/**
 * Maximum time gap (seconds) between the end of run R1 and the start of run R2
 * for R2 to be considered an extension of R1.
 */
export const EXTENSION_TEMPORAL_THRESHOLD_S = 1.5;

// ── TermSignature (§6.4 contract) ────────────────────────────────────────────

export interface PredicateContext {
  doc: GafferDocument;
  action: Action;
  actorId: string;
  frame: Frame;
  beats: Beat[];
  /** FIX 0: When debug mode is active, predicates call this to record key values. */
  debug?: (note: string) => void;
}

export interface TermSignature {
  termId: string;
  actor: { line?: 'defender' | 'midfielder' | 'forward'; role?: string[] } | 'any';
  trigger: Array<(ctx: PredicateContext) => boolean>; // ALL must hold
  silence: Array<(ctx: PredicateContext) => boolean>; // ANY holding suppresses
  contradictions: Array<{ termId: string; scope: 'beat' | 'player-beat' | 'possession' }>;
  anchor: 'ball' | 'teammate' | 'structure';
  specificity: number;
  phrase: { primary: string; variants: string[] };
}

// ── MatchedTerm ───────────────────────────────────────────────────────────────

/**
 * A signature that fired on a given action.
 *
 * resolution:
 *   'unresolved'               — run matched but no delivering pass found yet
 *   { receivingPassActionId }  — the pass that delivers the ball to this runner
 *                                (lifecycle continuation fires at that clause)
 */
export interface MatchedTerm {
  termId: string;
  actionId: string;       // the run/pass action id that triggered this
  actorId: string;
  phrase: { primary: string; variants: string[] };
  specificity: number;
  subsumedTermIds: string[]; // lower-specificity same-action terms, kept for clause termIds
  resolution: 'unresolved' | { receivingPassActionId: string };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function actorLine(actorId: string, doc: GafferDocument): 'defender' | 'midfielder' | 'forward' | 'unknown' {
  const entity = doc.entities.find(e => e.id === actorId);
  if (!entity || entity.kind !== 'player') return 'unknown';
  const posId = entity.display?.positionId ?? entity.display?.inferredPositionId;
  return posId ? roleToLine(posId) : 'unknown';
}

function actorMatchesFilter(
  sig: TermSignature,
  actorId: string,
  doc: GafferDocument,
): boolean {
  if (sig.actor === 'any') return true;

  const { line, role } = sig.actor as { line?: string; role?: string[] };
  const entity = doc.entities.find(e => e.id === actorId);
  if (!entity || entity.kind !== 'player') return false;
  const posId = entity.display?.positionId ?? entity.display?.inferredPositionId;

  if (line) {
    const al = actorLine(actorId, doc);
    if (al !== line) return false;
  }

  if (role && role.length > 0) {
    if (!posId || !role.includes(posId)) return false;
  }

  return true;
}

/**
 * Resolve lifecycle: given a run that fired, find the first pass that delivers
 * the ball to the runner at or after run.start.
 */
function resolveRunLifecycle(
  run: RunAction,
  doc: GafferDocument,
): string | null {
  // Look for any pass that targets the runner, starting at or after the run begins
  const candidates = doc.actions
    .filter((a): a is PassAction => a.kind === 'pass' && a.start >= run.start)
    .sort((a, b) => a.start - b.start);

  for (const pass of candidates) {
    const rid = receiverOf(pass, doc);
    if (rid === run.entityId) {
      return pass.id;
    }
  }
  return null;
}

/**
 * Returns true if run R2 is a continuation of run R1 by the same player:
 *   - temporal: R2.start is within EXTENSION_TEMPORAL_THRESHOLD_S of R1.end
 *   - spatial:  player's resolved position at R1.end is within
 *               EXTENSION_SPATIAL_THRESHOLD_PX of their position at R2.start
 *
 * Both checks must hold. Assumes R1 and R2 belong to the same entity.
 */
function isExtensionRun(
  run: RunAction,
  lastRun: RunAction,
  doc: GafferDocument,
): boolean {
  const lastRunEnd = lastRun.start + lastRun.duration;
  if (run.start - lastRunEnd > EXTENSION_TEMPORAL_THRESHOLD_S) return false;
  const posAtLastEnd  = resolvePosition(doc, lastRun.entityId, lastRunEnd);
  const posAtRunStart = resolvePosition(doc, run.entityId,     run.start);
  const dist = Math.hypot(posAtLastEnd.x - posAtRunStart.x, posAtLastEnd.y - posAtRunStart.y);
  return dist <= EXTENSION_SPATIAL_THRESHOLD_PX;
}

// ── matchSignatures ───────────────────────────────────────────────────────────

/**
 * Evaluate all registered signatures against every run/pass action in the document.
 *
 * FIX 0: When debugNotes is provided, per-predicate pass/fail is appended to the
 * array. Predicates that call ctx.debug() add labelled key values inline.
 *
 * Algorithm per action:
 *   1. Actor filter — skip if the entity doesn't match the signature's line/role filter.
 *   2. Trigger AND — all trigger predicates must return true (short-circuits on first false).
 *   3. Silence veto — any silence predicate returning true suppresses the match.
 *   4. Contradiction resolution within scope — not implemented for Tier 1 (only
 *      MOV_UNDERLAP is stubbed as a contradiction target but has no built signature).
 *   5. Specificity ranking for same-action collisions — highest specificity wins;
 *      lower-specificity matches are subsumed (their termIds recorded on the winner).
 */
export function matchSignatures(
  doc: GafferDocument,
  frame: Frame,
  beats: Beat[],
  signatures: TermSignature[],
  debugNotes?: string[],
): MatchedTerm[] {
  const results: MatchedTerm[] = [];

  // Run chaining: tracks the most-recent matched run-term and run-action for each player.
  // When a player's next run qualifies as an extension (spatial + temporal), it is excluded
  // from independent signature matching and inherits the parent term's lifecycle instead.
  type ChainEntry = { term: MatchedTerm; lastRun: RunAction };
  const chainParent = new Map<string, ChainEntry>();

  const sortedActions = [...doc.actions].sort((a, b) => a.start - b.start);

  for (const action of sortedActions) {
    if (action.kind !== 'run' && action.kind !== 'pass') continue;

    const actorId = action.entityId;

    // ── Run-chaining: extension detection ──────────────────────────────────
    if (action.kind === 'run') {
      const run = action as RunAction;
      const chain = chainParent.get(actorId);
      if (chain) {
        if (isExtensionRun(run, chain.lastRun, doc)) {
          // Extension run — skip independent signature matching entirely.
          debugNotes?.push(
            `[${run.id.slice(-6)}] run EXTENSION of [${chain.lastRun.id.slice(-6)}] (term ${chain.term.termId})`,
          );
          // If the parent term is still unresolved, try to resolve it using this leg's window.
          if (chain.term.resolution === 'unresolved') {
            const passId = resolveRunLifecycle(run, doc);
            if (passId) {
              chain.term.resolution = { receivingPassActionId: passId };
            }
          }
          // Advance the chain's last-run reference to this leg.
          chain.lastRun = run;
          continue; // do not enter the candidate loop for this run
        }
        // Gap too large or position too far — this is a new independent run; clear the chain.
        chainParent.delete(actorId);
      }
    }

    // Collect candidates: signatures whose actor filter + trigger + silence pass.
    const candidates: TermSignature[] = [];

    for (const sig of signatures) {
      if (!actorMatchesFilter(sig, actorId, doc)) continue;

      // FIX 0: per-signature per-action debug accumulator
      const sigNotes: string[] | undefined = debugNotes !== undefined ? [] : undefined;
      const ctx: PredicateContext = {
        doc,
        action,
        actorId,
        frame,
        beats,
        debug: sigNotes ? (n) => sigNotes.push(`    ${n}`) : undefined,
      };

      // Trigger evaluation (AND — stop at first false)
      let triggerPassed = true;
      for (let i = 0; i < sig.trigger.length; i++) {
        const r = sig.trigger[i](ctx);
        sigNotes?.push(`  trigger[${i}]: ${r}`);
        if (!r) { triggerPassed = false; break; }
      }

      if (triggerPassed) {
        let silenced = false;
        for (let i = 0; i < sig.silence.length; i++) {
          const r = sig.silence[i](ctx);
          sigNotes?.push(`  silence[${i}]: ${r}`);
          if (r) { silenced = true; break; }
        }
        if (!silenced) {
          sigNotes?.push('  → MATCHED');
          candidates.push(sig);
        } else {
          sigNotes?.push('  → SILENCED');
        }
      }

      if (sigNotes && sigNotes.length > 0) {
        debugNotes!.push(`[${action.id.slice(-6)}] ${action.kind} ${sig.termId}`);
        sigNotes.forEach(n => debugNotes!.push(n));
      }
    }

    if (candidates.length === 0) continue;

    // Specificity ranking: highest wins; lower-specificity terms are subsumed.
    candidates.sort((a, b) => b.specificity - a.specificity);

    const winner = candidates[0];
    const subsumedTermIds = candidates.slice(1).map(s => s.termId);

    // Lifecycle resolution for run terms.
    let resolution: MatchedTerm['resolution'] = 'unresolved';
    if (action.kind === 'run') {
      const passId = resolveRunLifecycle(action as RunAction, doc);
      if (passId) {
        resolution = { receivingPassActionId: passId };
      }
    }
    // Pass terms (e.g. ACT_LAYOFF_UNDERNEATH) don't need lifecycle resolution.

    const newTerm: MatchedTerm = {
      termId: winner.termId,
      actionId: action.id,
      actorId,
      phrase: winner.phrase,
      specificity: winner.specificity,
      subsumedTermIds,
      resolution,
    };
    results.push(newTerm);

    // Track matched run terms as potential chain parents for subsequent extension detection.
    // We track all matched run terms (resolved or not) so that if R2 is authored after R1
    // and both would resolve to the same delivering pass, R2 is suppressed rather than
    // overwriting R1's entry in resolvedRunAtPass.
    if (action.kind === 'run') {
      chainParent.set(actorId, { term: newTerm, lastRun: action as RunAction });
    }
  }

  return results;
}
