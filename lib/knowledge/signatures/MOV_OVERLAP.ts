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
// FIX 3 — Proximity gate prevents false positives when runner is a channel away:
//   Trace: LM a full channel away from CM made a diagonal run toward goal while
//   CM's pass was in-flight. startsBehind/pathSide=outside/endsLevelOrBeyond all
//   passed relationally, producing a spurious "the left midfielder overlaps."
//   Fix: add trigger (f) — the runner's resolved path must pass within
//   OVERLAP_PROXIMITY_PX of the carrier at corresponding sample times. A real
//   around-the-outside arc must physically come close to the carrier.
//   Debug output: minDist and the sample t where the minimum occurs.
//
// FIX 2 — In-flight-to-the-runner counts as teammate possession context:
//   In run-meets-pass patterns (the relational timing rule makes the delivering
//   pass concurrent with the run), the ball is in-flight for the run's entire
//   window. resolveOwnerAtT returns null at every sample → window scan fails.
//   Fix: at each sample, also check whether any teammate's pass is in flight
//   (carrier = passer). This applies regardless of the pass's target, including
//   passes to the runner himself. Geometric checks (startsBehind, pathSide,
//   endsLevelOrBeyond) evaluate against the passer, who is the spatial reference
//   for the overlap. Debug output gains a carrierVia field.
//   Note: this helper is only used by MOV_OVERLAP; MOV_RUN_IN_BEHIND and
//   MOV_CHECK_TO_BALL use unrelated primitives and are not affected.
//
// Predicate translation (trigger split for debug diagnostics):
//   trigger (action = run):
//     (a) run action + team has a known attacking direction
//     (b) ownership window: at some t in [run.start, run.end], teammate possession
//         context exists — teammate owns (carrierVia='owner') or teammate's pass
//         is in flight (carrierVia='in-flight-passer')
//     (c) startsBehind: runner begins closer to own goal than the ball-carrier
//         (evaluated at run.start against the carrier from (b))
//     (d) pathSide 'outside': runner's path goes between the carrier and the touchline
//         (bezier-aware — uses peak of arc, not just straight-line midpoint)
//     (e) endsLevelOrBeyond: runner ends at the same depth as or beyond the carrier
//     (f) proximity: runner's resolved path passes within OVERLAP_PROXIMITY_PX of
//         the carrier at corresponding sample times — catches the "channel away"
//         false positive where all relational predicates pass but the runner never
//         actually goes around the carrier
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

/**
 * Maximum distance (px) between any sample point on the runner's path and the
 * carrier's position at the corresponding time. A real overlap arc must physically
 * pass close to the carrier (runner goes AROUND the carrier, not a channel away).
 *
 * Calibration gap table (FIX 1 — threshold set to 250px):
 *   true+  Scene I (underlap)   : minDist =  59px ← passes ✓
 *   true+  Scene H              : minDist =  69px ← passes ✓
 *   true+  Scene B / Verify (a) : minDist ≈ 108px ← passes ✓
 *   true+  Verify (d)           : minDist = 132px ← passes ✓
 *   true+  Verify (e)           : minDist = 206px ← passes ✓
 *   true+  Verify (f)           : minDist = 228px ← passes ✓
 *          ── gap: 228 → 301 (73px) ──────────────────────────
 *   false+ Scene G              : minDist = 301px ← correctly rejected ✓
 */
export const OVERLAP_PROXIMITY_PX = 250;
import {
  startsBehind,
  pathSide,
  endsLevelOrBeyond,
} from '../primitives';
import { classifyPassDirection } from '../passDirection';

// ── Path sampling helper ──────────────────────────────────────────────────────

/**
 * Returns the runner's canvas position at path parameter u ∈ [0, 1].
 * Handles both straight (linear interpolation) and bezier (quadratic) paths.
 */
export function resolvePathPoint(
  run: RunAction,
  u: number,
  runnerStart: { x: number; y: number },
  runnerEnd: { x: number; y: number },
): { x: number; y: number } {
  if (run.path.type === 'bezier') {
    const { cx, cy } = run.path;
    const mt = 1 - u;
    return {
      x: mt * mt * runnerStart.x + 2 * u * mt * cx + u * u * runnerEnd.x,
      y: mt * mt * runnerStart.y + 2 * u * mt * cy + u * u * runnerEnd.y,
    };
  }
  return {
    x: runnerStart.x + u * (runnerEnd.x - runnerStart.x),
    y: runnerStart.y + u * (runnerEnd.y - runnerStart.y),
  };
}

// ── FIX 1 + FIX 2: Window-based carrier resolution ───────────────────────────

/**
 * Scan [run.start, run.end] at 9 sample points to find the first teammate who
 * provides possession context. Two conditions are checked at each sample:
 *
 *   (a) owner: a teammate (not the runner) owns the ball — carrier = owner,
 *       carrierVia = 'owner'.
 *   (b) in-flight-passer: a pass authored by a teammate is in flight at t —
 *       carrier = the passer, carrierVia = 'in-flight-passer'. Applies regardless
 *       of the pass's target, including passes to the runner himself. This covers
 *       run-meets-pass patterns where the delivering pass is concurrent with the
 *       run and resolveOwnerAtT is null for the entire window.
 *
 * Geometric checks (startsBehind, pathSide, endsLevelOrBeyond) evaluate against
 * the carrier returned here, whether owner or passer.
 */
export function resolveOverlapCarrier(
  doc: GafferDocument,
  run: RunAction,
  runnerId: string,
  runnerTeam: string | undefined,
): { carrierId: string; sampleT: number; carrierVia: 'owner' | 'in-flight-passer' } | null {
  if (!runnerTeam) return null;
  const runEnd = run.start + run.duration;
  const N = 8; // 9 points: i=0..8
  for (let i = 0; i <= N; i++) {
    const t = run.start + (runEnd - run.start) * (i / N);

    // (a) teammate owns the ball
    const ownerId = resolveOwnerAtT(doc, t);
    if (ownerId && ownerId !== runnerId) {
      const ownerEntity = doc.entities.find(e => e.id === ownerId);
      if (ownerEntity && ownerEntity.kind === 'player' &&
          (ownerEntity as { team?: string }).team === runnerTeam) {
        return { carrierId: ownerId, sampleT: t, carrierVia: 'owner' };
      }
    }

    // (b) a teammate's pass is in flight at t — carrier = passer
    for (const a of doc.actions) {
      if (a.kind !== 'pass') continue;
      const passEnd = a.start + a.duration;
      if (t < a.start || t >= passEnd) continue; // not in flight at t
      if (a.entityId === runnerId) continue;       // runner's own pass
      const passerEntity = doc.entities.find(e => e.id === a.entityId);
      if (!passerEntity || passerEntity.kind !== 'player') continue;
      if ((passerEntity as { team?: string }).team !== runnerTeam) continue;
      return { carrierId: a.entityId, sampleT: t, carrierVia: 'in-flight-passer' };
    }
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
      ctx.debug?.(`carrierId=${found?.carrierId ?? 'null'} sampleT=${found ? found.sampleT.toFixed(2) : 'n/a'} carrierVia=${found?.carrierVia ?? 'n/a'}`);
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

    // (f) proximity: runner's path passes within OVERLAP_PROXIMITY_PX of the carrier.
    //     FIX 3: catches false positives where the runner is a full channel away from
    //     the carrier but all relational predicates pass (startsBehind/outside/beyond).
    //     Samples 9 points along the path and the carrier's position at each sample time.
    (ctx) => {
      const run = ctx.action as RunAction;
      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      const found = resolveOverlapCarrier(
        ctx.doc, run, ctx.actorId, (entity as { team?: string } | undefined)?.team,
      );
      if (!found) return false;

      const runnerStart = resolvePosition(ctx.doc, run.entityId, run.start);
      const runnerEnd: { x: number; y: number } = 'x' in run.destination
        ? { x: run.destination.x, y: run.destination.y }
        : resolvePosition(ctx.doc, run.entityId, run.start + run.duration);

      const N = 8; // 9 sample points: i = 0..8
      let minDist = Infinity;
      let minSampleT = run.start;

      for (let i = 0; i <= N; i++) {
        const u = i / N;
        const sampleT = run.start + run.duration * u;
        const runnerPos = resolvePathPoint(run, u, runnerStart, runnerEnd);
        const carrierPos = resolvePosition(ctx.doc, found.carrierId, sampleT);
        const dist = Math.hypot(runnerPos.x - carrierPos.x, runnerPos.y - carrierPos.y);
        if (dist < minDist) { minDist = dist; minSampleT = sampleT; }
      }

      ctx.debug?.(`proximity minDist=${Math.round(minDist)}px at sampleT=${minSampleT.toFixed(2)} threshold=${OVERLAP_PROXIMITY_PX}px`);
      return minDist <= OVERLAP_PROXIMITY_PX;
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
    { termId: 'mov.underlap', scope: 'player-beat' },
  ],
  anchor: 'teammate',
  specificity: 30,
  phrase: {
    primary: 'overlaps',
    variants: ['makes an overlapping run', 'goes on the overlap'],
  },
};
