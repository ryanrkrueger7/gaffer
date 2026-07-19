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
// FIX 3 — Level-crossing gate prevents false positives for wide wing runs:
//   Trace: LB runs straight up the wing while CM holds the ball centrally.
//   startsBehind/pathSide=outside/endsLevelOrBeyond all pass relationally, but
//   the runner is a full channel away laterally from the carrier at level-crossing.
//   Fix: replace minDist proximity gate with a level-crossing gate — find t* where
//   the runner's attack-axis progress crosses the carrier's, then require:
//     (i)  |runnerX(t*) − carrierX(t*)| <= OVERLAP_LATERAL_GAP_PX (110px, exported)
//     (ii) runner is on the touchline side of the carrier at t*
//   Debug output: tStar, lateralDist, isOutside.
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
//     (f) level-crossing gate: at t* where runner's attack-axis progress crosses
//         the carrier's, |runnerX(t*) − carrierX(t*)| <= OVERLAP_LATERAL_GAP_PX
//         AND runner on touchline-side at t*
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
 * Maximum lateral distance (px) between runner and carrier at the level-crossing
 * point t* (the moment the runner becomes level with the carrier on the attack axis).
 *
 * Calibration gap table (OVERLAP_LATERAL_GAP_PX = 130px):
 *   true+  Scene I  (underlap)      : lateralDist =  60px ← passes ✓
 *   true+  Scene H                  : lateralDist =  72px ← passes ✓
 *   true+  Scene R  (new pass-and-go): lateralDist = ~33px ← passes ✓
 *   true+  Scene B / Verify (a)     : lateralDist = 114px ← passes ✓
 *          ── gap: 114 → 138 (24px) ──────────────────────────────
 *   false+ Verify (d) [re-labeled]  : lateralDist = 138px ← correctly rejected ✓
 *   false+ Scene P  (coach 4)       : lateralDist = 205px ← correctly rejected ✓
 *   false+ Verify (e) [re-labeled]  : lateralDist = 218px ← correctly rejected ✓
 *   false+ Verify (f) [re-labeled]  : lateralDist = 251px ← correctly rejected ✓
 *   false+ Scene G                  : lateralDist = 300px ← correctly rejected ✓
 */
export const OVERLAP_LATERAL_GAP_PX = 130;

/**
 * Minimum path-bend angle (degrees) required at t* for an overlap or underlap.
 *
 * For BEZIER runs: angle between tangent at run.start and tangent at t*.
 * For LINEAR runs: angle between the path direction and the attack axis.
 *
 * A dead-straight parallel run (angle ≈ 0°) is never an overlap regardless of
 * lateral gap — the runner is moving alongside the carrier, not rounding them.
 */
export const OVERLAP_BEND_MIN_DEG = 15;
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

// ── FIX 3: Level-crossing gate ────────────────────────────────────────────────

/**
 * Finds t* where the runner's attack-axis progress crosses the carrier's
 * (the runner becomes level with or overtakes the carrier). Returns:
 *   - tStar: wall-clock time of the crossing
 *   - lateralDist: |runnerX(t*) − carrierX(t*)| in px
 *   - isOutside: true if runner is on the touchline side of the carrier at t*
 *     (carrier.x < 400 → touchline = left → runner outside when runner.x < carrier.x;
 *      carrier.x ≥ 400 → touchline = right → runner outside when runner.x > carrier.x)
 *
 * Samples 101 points along the run, detects sign change in
 * (runner_forward − carrier_forward), then linearly interpolates to the crossing.
 * Returns null if the runner never reaches the carrier's attack-axis level.
 */
export function findLevelCrossing(
  doc: GafferDocument,
  run: RunAction,
  carrierId: string,
  attackDir: 'up' | 'down',
  runnerStart: { x: number; y: number },
  runnerEnd: { x: number; y: number },
): { tStar: number; crossingU: number; lateralDist: number; isOutside: boolean } | null {
  const N = 100; // 101 sample points: u = 0..1 in steps of 0.01
  let prevFwdDiff = NaN;
  let prevU = 0;

  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const sampleT = run.start + run.duration * u;
    const rp = resolvePathPoint(run, u, runnerStart, runnerEnd);
    const cp = resolvePosition(doc, carrierId, sampleT);

    // Forward coordinate: larger = more advanced toward the attacking goal.
    // 'up': goal at y≈0, so forward = −y. 'down': goal at y≈600, forward = +y.
    const runnerFwd = attackDir === 'up' ? -rp.y : rp.y;
    const carrierFwd = attackDir === 'up' ? -cp.y : cp.y;
    const fwdDiff = runnerFwd - carrierFwd; // < 0 = runner behind; ≥ 0 = level/ahead

    if (i > 0 && !isNaN(prevFwdDiff) && prevFwdDiff < 0 && fwdDiff >= 0) {
      // Sign change detected — interpolate to find the precise crossing u.
      const fraction = -prevFwdDiff / (fwdDiff - prevFwdDiff);
      const crossingU = prevU + fraction * (u - prevU);
      const tStar = run.start + run.duration * crossingU;

      const rAtStar = resolvePathPoint(run, crossingU, runnerStart, runnerEnd);
      const cAtStar = resolvePosition(doc, carrierId, tStar);

      const lateralDist = Math.abs(rAtStar.x - cAtStar.x);

      // Touchline-side check at t*:
      //   carrier.x < 400 → touchline = left  → runner outside = runner.x < carrier.x
      //   carrier.x ≥ 400 → touchline = right → runner outside = runner.x > carrier.x
      const isOutside = cAtStar.x < 400
        ? rAtStar.x < cAtStar.x
        : rAtStar.x > cAtStar.x;

      return { tStar, crossingU, lateralDist, isOutside };
    }

    prevFwdDiff = fwdDiff;
    prevU = u;
  }

  return null; // runner never reaches carrier's attack-axis level
}

/**
 * Computes the bend angle (degrees) of the runner's path for the overlap/underlap
 * bend-requirement check.
 *
 * For BEZIER runs: angle between tangent at u=0 (run start) and tangent at crossingU (t*).
 *   A curved arc has a meaningful tangent change; a near-straight bezier approaches 0°.
 *
 * For LINEAR runs: angle between the path direction and the attack axis.
 *   A dead-straight parallel run (path = attack axis) scores 0° and fails the gate.
 *   A diagonal run curving around the carrier scores a proportionate angle.
 */
export function pathBendDeg(
  run: RunAction,
  crossingU: number,
  attackDir: 'up' | 'down',
  runnerStart: { x: number; y: number },
  runnerEnd: { x: number; y: number },
): number {
  if (run.path.type === 'bezier') {
    const { cx, cy } = run.path;
    const p0 = runnerStart;
    const p1 = { x: cx, y: cy };
    const p2 = runnerEnd;

    // Quadratic bezier tangent: P'(u) = 2[−(1−u)P0 + (1−2u)P1 + uP2]
    const tangentAt = (u: number) => ({
      tx: 2 * (-(1 - u) * p0.x + (1 - 2 * u) * p1.x + u * p2.x),
      ty: 2 * (-(1 - u) * p0.y + (1 - 2 * u) * p1.y + u * p2.y),
    });

    const t0 = tangentAt(0);
    const t1 = tangentAt(crossingU);
    const dot = t0.tx * t1.tx + t0.ty * t1.ty;
    const mag0 = Math.hypot(t0.tx, t0.ty);
    const mag1 = Math.hypot(t1.tx, t1.ty);
    if (mag0 < 1e-6 || mag1 < 1e-6) return 0;
    return Math.acos(Math.max(-1, Math.min(1, dot / (mag0 * mag1)))) * 180 / Math.PI;
  }

  // Linear run: angle between path direction and the attack axis (0,±1).
  const dx = runnerEnd.x - runnerStart.x;
  const dy = runnerEnd.y - runnerStart.y;
  const mag = Math.hypot(dx, dy);
  if (mag < 1e-6) return 0;
  const axisY = attackDir === 'up' ? -1 : 1; // attack axis unit vector is (0, axisY)
  const dotAxis = (dy / mag) * axisY;
  return Math.acos(Math.max(-1, Math.min(1, dotAxis))) * 180 / Math.PI;
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

    // (f) level-crossing + bend gate: find t* where runner's attack-axis progress crosses
    //     the carrier's. At t* require:
    //       (i)   |runnerX(t*) − carrierX(t*)| <= OVERLAP_LATERAL_GAP_PX (lateral close)
    //       (ii)  runner on touchline side of carrier at t*               (rounds outside)
    //       (iii) path bend >= OVERLAP_BEND_MIN_DEG                       (not parallel)
    //     Rejects wing runs far from the carrier and dead-straight parallel runs.
    (ctx) => {
      const run = ctx.action as RunAction;
      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      const frameTeam = ctx.frame.teams.find(t => t.id === (entity as { team?: string } | undefined)?.team)!;
      const attackDir = frameTeam.attackingDirection!;
      const found = resolveOverlapCarrier(
        ctx.doc, run, ctx.actorId, (entity as { team?: string } | undefined)?.team,
      );
      if (!found) return false;

      const runnerStart = resolvePosition(ctx.doc, run.entityId, run.start);
      const runnerEnd: { x: number; y: number } = 'x' in run.destination
        ? { x: run.destination.x, y: run.destination.y }
        : resolvePosition(ctx.doc, run.entityId, run.start + run.duration);

      const crossing = findLevelCrossing(
        ctx.doc, run, found.carrierId, attackDir, runnerStart, runnerEnd,
      );
      if (!crossing) {
        ctx.debug?.(`levelCrossing: no t* (runner never reaches carrier level)`);
        return false;
      }

      const { tStar, crossingU, lateralDist, isOutside } = crossing;
      const bend = pathBendDeg(run, crossingU, attackDir, runnerStart, runnerEnd);
      ctx.debug?.(`levelCrossing tStar=${tStar.toFixed(2)} lateralDist=${Math.round(lateralDist)}px threshold=${OVERLAP_LATERAL_GAP_PX}px outside=${isOutside} bend=${bend.toFixed(1)}°`);
      return lateralDist <= OVERLAP_LATERAL_GAP_PX && isOutside && bend >= OVERLAP_BEND_MIN_DEG;
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
