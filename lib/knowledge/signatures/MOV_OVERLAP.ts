// MOV_OVERLAP — a wide overlapping run: the runner starts behind a teammate with
// the ball, goes around the outside, and ends level or beyond.
//
// FIX 1 — Ownership evaluated over run window, not just run.start:
//   In pass-and-go patterns the runner passes first then starts the overlap run
//   while the ball is still in flight. At run.start resolveOwnerAtT returns null
//   (inFlight), so single-point ownership check fails. resolveOverlapCarrier()
//   samples [run.start, run.end] at 9 points and returns the first teammate found
//   owning the ball at any sample. startsBehind / pathSide / endsLevelOrBeyond
//   all use the carrier identified by the window scan.
//
// Predicate translation (trigger split for debug diagnostics):
//   trigger (action = run):
//     (a) run action + team has a known attacking direction
//     (b) ownership window: at some t in [run.start, run.end], a teammate
//         (not the runner) owns the ball — handles pass-and-go mid-flight starts
//     (c) startsBehind: runner begins closer to own goal than the ball-carrier
//         (evaluated at run.start against the carrier from (b))
//     (d) pathSide 'outside': runner's path goes between the carrier and the touchline
//         (bezier-aware — uses peak of arc, not just straight-line midpoint)
//     (e) endsLevelOrBeyond: runner ends at the same depth as or beyond the carrier
//
//   silence:
//     (s1) the ball-carrier plays a FORWARD pass (not to the runner) before the
//          runner overtakes him. Uses resolveOverlapCarrier for carrier id.
//
//   never-co-occurs (contradictions):
//     MOV_UNDERLAP at player-beat scope — stubbed until built.

import type { TermSignature } from './matcher';
import type { GafferDocument, RunAction } from '../../engine/types';
import { resolveOwnerAtT, resolvePosition } from '../../engine/resolve';
import {
  startsBehind,
  pathSide,
  endsLevelOrBeyond,
} from '../primitives';
import { classifyPassDirection } from '../passDirection';

// ── FIX 1: Window-based carrier resolution ────────────────────────────────────

/**
 * Scan [run.start, run.end] at 9 sample points to find the first teammate who owns
 * the ball (excluding the runner). Returns carrier id and sample time, or null.
 *
 * Handles pass-and-go where the runner passes and starts the overlap run while
 * the ball is still in flight — at run.start the ball is 'inFlight' so
 * resolveOwnerAtT returns null, but at some later sample the ball arrives at the
 * teammate who becomes the carrier for all overlap geometric checks.
 */
function resolveOverlapCarrier(
  doc: GafferDocument,
  run: RunAction,
  runnerId: string,
  runnerTeam: string | undefined,
): { carrierId: string; sampleT: number } | null {
  if (!runnerTeam) return null;
  const runEnd = run.start + run.duration;
  const N = 8; // 9 points: i=0..8
  for (let i = 0; i <= N; i++) {
    const t = run.start + (runEnd - run.start) * (i / N);
    const ownerId = resolveOwnerAtT(doc, t);
    if (!ownerId || ownerId === runnerId) continue;
    const ownerEntity = doc.entities.find(e => e.id === ownerId);
    if (!ownerEntity || ownerEntity.kind !== 'player') continue;
    if ((ownerEntity as { team?: string }).team !== runnerTeam) continue;
    return { carrierId: ownerId, sampleT: t };
  }
  return null;
}

// ── Signature ─────────────────────────────────────────────────────────────────

export const MOV_OVERLAP: TermSignature = {
  termId: 'mov.overlap',
  actor: 'any',
  trigger: [
    // (a) run action + team has a known attacking direction
    (ctx) => {
      if (ctx.action.kind !== 'run') return false;
      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      if (!entity || entity.kind !== 'player') return false;
      const frameTeam = ctx.frame.teams.find(t => t.id === entity.team);
      return frameTeam?.attackingDirection != null;
    },

    // (b) ownership window: teammate owns ball at some point in [run.start, run.end]
    //     FIX 1: samples 9 points so pass-and-go mid-flight starts are detected.
    (ctx) => {
      const run = ctx.action as RunAction;
      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      const found = resolveOverlapCarrier(
        ctx.doc, run, ctx.actorId, (entity as { team?: string } | undefined)?.team,
      );
      ctx.debug?.(`carrierId=${found?.carrierId ?? 'null'} sampleT=${found ? found.sampleT.toFixed(2) : 'n/a'}`);
      return found !== null;
    },

    // (c) runner starts behind the carrier on the attack axis (evaluated at run.start)
    (ctx) => {
      const run = ctx.action as RunAction;
      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      const frameTeam = ctx.frame.teams.find(t => t.id === (entity as { team?: string } | undefined)?.team)!;
      const attackDir = frameTeam.attackingDirection!;
      const found = resolveOverlapCarrier(
        ctx.doc, run, ctx.actorId, (entity as { team?: string } | undefined)?.team,
      );
      if (!found) return false;
      const behind = startsBehind(ctx.doc, ctx.actorId, found.carrierId, run.start, attackDir);
      ctx.debug?.(`startsBehind=${behind} attackDir=${attackDir}`);
      return behind;
    },

    // (d) runner's path is on the outside (touchline side) of the carrier
    //     bezier-aware via updated pathSide()
    (ctx) => {
      const run = ctx.action as RunAction;
      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      const found = resolveOverlapCarrier(
        ctx.doc, run, ctx.actorId, (entity as { team?: string } | undefined)?.team,
      );
      if (!found) return false;
      const side = pathSide(ctx.doc, run, found.carrierId);
      ctx.debug?.(`pathSide=${side} runPathType=${run.path.type}`);
      return side === 'outside';
    },

    // (e) runner ends level or beyond the carrier on the attack axis
    (ctx) => {
      const run = ctx.action as RunAction;
      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      const frameTeam = ctx.frame.teams.find(t => t.id === (entity as { team?: string } | undefined)?.team)!;
      const attackDir = frameTeam.attackingDirection!;
      const found = resolveOverlapCarrier(
        ctx.doc, run, ctx.actorId, (entity as { team?: string } | undefined)?.team,
      );
      if (!found) return false;
      const beyond = endsLevelOrBeyond(ctx.doc, run, found.carrierId, attackDir);
      ctx.debug?.(`endsLevelOrBeyond=${beyond}`);
      return beyond;
    },
  ],
  silence: [
    // (s1) Carrier plays a forward pass to someone other than the runner before run ends.
    //      Uses resolveOverlapCarrier so the carrier id is consistent with the triggers.
    (ctx) => {
      if (ctx.action.kind !== 'run') return false;
      const run = ctx.action as RunAction;
      const runEnd = run.start + run.duration;

      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      if (!entity || entity.kind !== 'player') return false;
      const frameTeam = ctx.frame.teams.find(t => t.id === entity.team);
      const attackDir = frameTeam?.attackingDirection;
      if (!attackDir) return false;

      const found = resolveOverlapCarrier(ctx.doc, run, ctx.actorId, entity.team);
      if (!found) return false;
      const ownerId = found.carrierId;

      for (const a of ctx.doc.actions) {
        if (a.kind !== 'pass') continue;
        if (a.entityId !== ownerId) continue;
        if (a.start >= runEnd) continue; // after run ends — doesn't silence
        if (!('entityId' in a.target)) continue;
        if (a.target.entityId === ctx.actorId) continue; // pass to runner is fine

        const pp = resolvePosition(ctx.doc, a.entityId, a.start);
        const rp = resolvePosition(ctx.doc, a.target.entityId, a.start + a.duration);
        const dir = classifyPassDirection(pp.x, pp.y, rp.x, rp.y, attackDir);
        if (dir === 'forward') return true; // carrier played forward past the runner
      }
      return false;
    },
  ],
  contradictions: [
    // MOV_UNDERLAP is not yet built; stub its termId here so the contradiction
    // table is complete when it is added in a future prompt.
    { termId: 'mov.underlap', scope: 'player-beat' },
  ],
  anchor: 'teammate',
  specificity: 30,
  phrase: {
    primary: 'overlaps',
    variants: ['makes an overlapping run', 'goes on the overlap'],
  },
};
