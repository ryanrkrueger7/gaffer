// Gaffer knowledge — geometric primitives over the world model (Phase 1A).
// Pure functions — no UI, no React, no side effects.
// All position/possession queries go through lib/engine resolvers — never re-implemented here.

import type { GafferDocument, RunAction, PassAction } from '../engine/types';
import { resolvePosition, resolveBallPosition, resolveOwnerAtT } from '../engine/resolve';

// ── Field constants (mirrors positionInference.ts — see zones.ts duplication note) ──
const FIELD_X_MIN = 10;
const FIELD_X_MAX = 790;
const FIELD_Y_MIN = 10;
const FIELD_Y_MAX = 590;

// ── Penalty-box boundaries (from BoardRenderer.tsx PitchFull paint geometry) ─
// Top penalty box (attacked when direction='up', goal at y=10):
//   BoardRenderer line: points={[250, 10, 250, 90, 550, 90, 550, 10]}
//   → x: 250–550, y: 10–90
// Bottom penalty box (attacked when direction='down', goal at y=590):
//   BoardRenderer line: points={[250, 590, 250, 510, 550, 510, 550, 590]}
//   → x: 250–550, y: 510–590
export const BOX_X_MIN = 250;
export const BOX_X_MAX = 550;
export const TOP_BOX_Y_MAX = 90;    // y ≤ 90 is inside the top box
export const BOTTOM_BOX_Y_MIN = 510; // y ≥ 510 is inside the bottom box

// ── Direction threshold (matches PASS_DIRECTION_THRESHOLD in passDirection.ts) ─
// sin(30°) ≈ 0.5: a vector must deviate at least 30° off the lateral axis
// to be classified as directional rather than square.
const DIR_THRESHOLD = Math.sin(Math.PI / 6); // ≈ 0.5

// ── Internal helpers ─────────────────────────────────────────────────────────

/** Signed forward component of (dx,dy), normalised by vector length. +1 = toward goal. */
function forwardFrac(dx: number, dy: number, dir: 'up' | 'down'): number {
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return 0;
  // 'up': goal at y=10, so forward = negative-y. 'down': forward = positive-y.
  const gy = dir === 'up' ? -1 : 1;
  return (dy * gy) / dist;
}

// ── runVectorVsAttack ─────────────────────────────────────────────────────────

/**
 * Classify the direction of a run relative to the team's attacking axis.
 *
 * Uses resolvePosition to get the runner's canvas position at run.start so the
 * vector is computed from where the player actually is, not their initial position.
 * Falls back to 'lateral' for landmark destinations or near-zero vectors.
 */
export function runVectorVsAttack(
  doc: GafferDocument,
  run: RunAction,
  attackingDirection: 'up' | 'down',
): 'toward-goal' | 'away' | 'lateral' {
  if (!('x' in run.destination)) return 'lateral'; // landmark — can't compute vector

  const start = resolvePosition(doc, run.entityId, run.start);
  const dx = run.destination.x - start.x;
  const dy = run.destination.y - start.y;
  const fc = forwardFrac(dx, dy, attackingDirection);

  if (fc > DIR_THRESHOLD) return 'toward-goal';
  if (fc < -DIR_THRESHOLD) return 'away';
  return 'lateral';
}

// ── distanceToBallTrend ───────────────────────────────────────────────────────

const FLAT_MARGIN_PX = 10; // delta below this is treated as 'flat'

/**
 * Is the player getting closer to or further from the ball over the run window?
 *
 * Measures mutual distance change: both the player's motion AND the ball's own
 * travel contribute to the result. Use `playerMotionTowardBall` when only the
 * player's movement should count (e.g. MOV_CHECK_TO_BALL).
 */
export function distanceToBallTrend(
  doc: GafferDocument,
  playerId: string,
  run: RunAction,
): 'closing' | 'opening' | 'flat' {
  const t0 = run.start;
  const t1 = run.start + run.duration;

  const p0 = resolvePosition(doc, playerId, t0);
  const b0 = resolveBallPosition(doc, t0);
  const d0 = Math.hypot(p0.x - b0.x, p0.y - b0.y);

  const p1 = resolvePosition(doc, playerId, t1);
  const b1 = resolveBallPosition(doc, t1);
  const d1 = Math.hypot(p1.x - b1.x, p1.y - b1.y);

  const delta = d1 - d0; // positive = moved away, negative = moved closer
  if (delta < -FLAT_MARGIN_PX) return 'closing';
  if (delta > FLAT_MARGIN_PX) return 'opening';
  return 'flat';
}

/**
 * Is the PLAYER moving toward the ball, measured by the player's own displacement
 * projected onto the runner→ball direction at run.start?
 *
 * Unlike `distanceToBallTrend`, the ball's own travel contributes nothing — only
 * the runner's physical motion is measured. This prevents a player retreating away
 * from play from being classified as 'closing' just because a pass travels toward
 * their side.
 *
 * Projection > FLAT_MARGIN_PX → 'closing' (runner moved toward ball).
 * Projection < −FLAT_MARGIN_PX → 'opening' (runner moved away from ball).
 */
export function playerMotionTowardBall(
  doc: GafferDocument,
  playerId: string,
  run: RunAction,
): 'closing' | 'opening' | 'flat' {
  const t0 = run.start;
  const t1 = run.start + run.duration;

  const p0 = resolvePosition(doc, playerId, t0);
  const p1 = resolvePosition(doc, playerId, t1);
  const b0 = resolveBallPosition(doc, t0);

  // Unit vector from runner toward the ball at run.start.
  const toBallDx = b0.x - p0.x;
  const toBallDy = b0.y - p0.y;
  const dist = Math.hypot(toBallDx, toBallDy);
  if (dist < 1) return 'flat'; // runner is already at the ball

  // Project runner displacement onto runner→ball direction.
  const runDx = p1.x - p0.x;
  const runDy = p1.y - p0.y;
  const proj = (runDx * toBallDx + runDy * toBallDy) / dist;

  if (proj > FLAT_MARGIN_PX) return 'closing';
  if (proj < -FLAT_MARGIN_PX) return 'opening';
  return 'flat';
}

// ── pathSide ──────────────────────────────────────────────────────────────────

/** Quadratic bezier x at parameter t: P0=(x0), P1=(cx), P2=(x1). */
function qBezierX(t: number, x0: number, cx: number, x1: number): number {
  const mt = 1 - t;
  return mt * mt * x0 + 2 * t * mt * cx + t * t * x1;
}

/**
 * Is the runner's path on the outside (touchline side) or inside (central side)
 * relative to a teammate?
 *
 * "Outside" means the runner travels between the teammate and the nearer touchline —
 * the classic overlap path. "Inside" means the runner cuts to the central side of
 * the teammate — an underlap path.
 *
 * FIX 3: For bezier runs, samples 9 points along the arc and returns 'outside' if
 * ANY sample passes the outside threshold (the arc peak counts, not just midpoint).
 * Straight runs use the single midpoint as before.
 */
export function pathSide(
  doc: GafferDocument,
  run: RunAction,
  teammateId: string,
): 'outside' | 'inside' | 'neither' {
  const runnerStart = resolvePosition(doc, run.entityId, run.start);
  const runnerEnd: { x: number; y: number } = 'x' in run.destination
    ? { x: run.destination.x, y: run.destination.y }
    : resolvePosition(doc, run.entityId, run.start + run.duration);

  const tmX = resolvePosition(doc, teammateId, run.start).x;
  const pitchCenterX = (FIELD_X_MIN + FIELD_X_MAX) / 2; // 400
  const nearerTouchlineX = tmX < pitchCenterX ? FIELD_X_MIN : FIELD_X_MAX;
  const tmDistToTouchline = Math.abs(tmX - nearerTouchlineX);

  // Build x-samples along the path.
  let sampleXs: number[];
  if (run.path.type === 'bezier') {
    const { cx } = run.path;
    const x0 = runnerStart.x;
    const x1 = runnerEnd.x;
    sampleXs = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map(t =>
      qBezierX(t, x0, cx, x1),
    );
  } else {
    // Straight path: single midpoint sample
    sampleXs = [(runnerStart.x + runnerEnd.x) / 2];
  }

  // Any sample outside → 'outside' (the path swept outside at that point).
  // Only inside samples → 'inside'. All same-column → 'neither'.
  let hasOutside = false;
  let hasInside = false;
  for (const sx of sampleXs) {
    if (Math.abs(sx - tmX) < 5) continue; // essentially same column
    const distToTouchline = Math.abs(sx - nearerTouchlineX);
    if (distToTouchline < tmDistToTouchline) {
      hasOutside = true;
    } else {
      hasInside = true;
    }
  }

  // 'outside' wins if any sample went outside (arc peak matters for overlap)
  if (hasOutside) return 'outside';
  if (hasInside) return 'inside';
  return 'neither';
}

// ── startsBehind ──────────────────────────────────────────────────────────────

/**
 * Is the runner behind the teammate at time t (closer to own goal)?
 *
 * 'up' (own goal at y=590): "behind" = higher y canvas value.
 * 'down' (own goal at y=10): "behind" = lower y canvas value.
 */
export function startsBehind(
  doc: GafferDocument,
  runnerId: string,
  teammateId: string,
  t: number,
  attackingDirection: 'up' | 'down',
): boolean {
  const rp = resolvePosition(doc, runnerId, t);
  const tp = resolvePosition(doc, teammateId, t);

  if (attackingDirection === 'up') {
    return rp.y > tp.y; // runner is further from top goal → behind
  }
  return rp.y < tp.y;
}

// ── endsLevelOrBeyond ─────────────────────────────────────────────────────────

/**
 * Does the runner end at the same depth as, or further toward the opponent goal
 * than, the teammate at the time the run completes?
 */
export function endsLevelOrBeyond(
  doc: GafferDocument,
  run: RunAction,
  teammateId: string,
  attackingDirection: 'up' | 'down',
): boolean {
  const t1 = run.start + run.duration;

  const runnerEnd: { x: number; y: number } = 'x' in run.destination
    ? { x: run.destination.x, y: run.destination.y }
    : resolvePosition(doc, run.entityId, t1);

  const tp = resolvePosition(doc, teammateId, t1);

  if (attackingDirection === 'up') {
    return runnerEnd.y <= tp.y; // runner y ≤ teammate y → runner is at least as advanced
  }
  return runnerEnd.y >= tp.y;
}

// ── beyondFurthestTeammate ────────────────────────────────────────────────────

/**
 * Is this player the most advanced of all teammates at time t?
 *
 * Tier 1 proxy for "last line" — does NOT account for opponents. A runner
 * passing this check is beyond their own team's furthest player. True last-line
 * detection (whether the runner is behind the defensive line) requires
 * opponent positions and is a Tier 2 feature.
 */
export function beyondFurthestTeammate(
  doc: GafferDocument,
  playerId: string,
  t: number,
  attackingDirection: 'up' | 'down',
): boolean {
  const player = doc.entities.find(e => e.id === playerId);
  if (!player || player.kind !== 'player') return false;

  const pp = resolvePosition(doc, playerId, t);
  const teammates = doc.entities.filter(
    e => e.kind === 'player' && e.id !== playerId && e.team === player.team,
  );

  if (teammates.length === 0) return true;

  for (const tm of teammates) {
    const tp = resolvePosition(doc, tm.id, t);
    // If any teammate is equally or more advanced, player is NOT the furthest.
    if (attackingDirection === 'up') {
      if (tp.y <= pp.y) return false;
    } else {
      if (tp.y >= pp.y) return false;
    }
  }

  return true;
}

// ── towardBox ─────────────────────────────────────────────────────────────────

/**
 * Does the run end inside the penalty box of the attacked end?
 *
 * Box boundaries sourced from BoardRenderer.tsx PitchFull paint:
 *   'up'  attack box: x 250–550, y 10–90   (top goal, y=10)
 *   'down' attack box: x 250–550, y 510–590 (bottom goal, y=590)
 */
export function towardBox(
  doc: GafferDocument,
  run: RunAction,
  attackingDirection: 'up' | 'down',
): boolean {
  let ex: number;
  let ey: number;

  if ('x' in run.destination) {
    ex = run.destination.x;
    ey = run.destination.y;
  } else {
    const end = resolvePosition(doc, run.entityId, run.start + run.duration);
    ex = end.x;
    ey = end.y;
  }

  const inX = ex >= BOX_X_MIN && ex <= BOX_X_MAX;
  if (!inX) return false;
  if (attackingDirection === 'up') return ey >= FIELD_Y_MIN && ey <= TOP_BOX_Y_MAX;
  return ey >= BOTTOM_BOX_Y_MIN && ey <= FIELD_Y_MAX;
}

// ── timingOverlap ─────────────────────────────────────────────────────────────

/**
 * How does a run's active window overlap with a pass's active window?
 *
 * Does NOT need doc — computes purely from timestamps.
 *
 *   'run-active-at-release' — run is active when the pass starts (ball leaves passer)
 *   'run-active-at-arrival' — run is active when the pass completes (ball arrives)
 *   'both'                  — run covers both release and arrival
 *   'none'                  — run is entirely outside the pass window
 */
export function timingOverlap(
  run: RunAction,
  pass: PassAction,
): 'run-active-at-release' | 'run-active-at-arrival' | 'both' | 'none' {
  const runEnd = run.start + run.duration;
  const passEnd = pass.start + pass.duration;

  const atRelease = run.start <= pass.start && runEnd >= pass.start;
  const atArrival = run.start <= passEnd && runEnd >= passEnd;

  if (atRelease && atArrival) return 'both';
  if (atRelease) return 'run-active-at-release';
  if (atArrival) return 'run-active-at-arrival';
  return 'none';
}

// ── receiverOf ────────────────────────────────────────────────────────────────

/**
 * Returns the entityId of the pass receiver (player entities only), or null.
 * Null when the target is raw coordinates or a non-player entity (goal, zone, etc.).
 */
export function receiverOf(pass: PassAction, doc: GafferDocument): string | null {
  if (!('entityId' in pass.target)) return null;
  const id = pass.target.entityId;
  const entity = doc.entities.find(e => e.id === id);
  if (!entity || entity.kind !== 'player') return null;
  return id;
}

// ── nextPassAfter ─────────────────────────────────────────────────────────────

/**
 * Returns the first PassAction in the document that starts at or after time t,
 * or null. Used by the matcher to find the pass that resolves a run term.
 */
export function nextPassAfter(doc: GafferDocument, t: number): PassAction | null {
  const candidates = doc.actions
    .filter((a): a is PassAction => a.kind === 'pass' && a.start >= t)
    .sort((a, b) => a.start - b.start);
  return candidates[0] ?? null;
}

// ── ballOwnerTeammate ─────────────────────────────────────────────────────────

/**
 * Returns the entityId of the ball owner at time t if they are a teammate of
 * the given player, or null otherwise. Used by overlap/check predicates.
 */
export function ballOwnerTeammate(
  doc: GafferDocument,
  playerId: string,
  t: number,
): string | null {
  const owner = resolveOwnerAtT(doc, t);
  if (!owner || owner === playerId) return null;

  const player = doc.entities.find(e => e.id === playerId);
  const ownerEntity = doc.entities.find(e => e.id === owner);
  if (!player || !ownerEntity) return null;
  if (player.kind !== 'player' || ownerEntity.kind !== 'player') return null;
  if (player.team !== ownerEntity.team) return null;

  return owner;
}

// ── passLateralBand ───────────────────────────────────────────────────────────

/**
 * Wide-channel band of a canvas x-coordinate relative to the attacking direction.
 *
 * Thresholds (flankPos axis, 0 = left touchline side, 1 = right touchline side):
 *   'left'   — flankPos ≤ 0.25  (outer-left quarter of the pitch)
 *   'right'  — flankPos ≥ 0.75  (outer-right quarter of the pitch)
 *   'center' — everything in between
 *
 * A flankPos of 0 means the player is at the touchline on the left side of their
 * attacking direction; 1 means the touchline on the right side.
 *
 * Used by ACT_SWITCH_PLAY to detect genuine field-width switches.
 */
export function passLateralBand(
  x: number,
): 'left' | 'center' | 'right' {
  // Lateral bands are based on absolute canvas x (left touchline = x=10, right = x=790),
  // independent of attacking direction — a switch from left to right is always a switch.
  const fp = (x - FIELD_X_MIN) / (FIELD_X_MAX - FIELD_X_MIN);
  // Thresholds from zones.ts wideAreaLeftMaxFlank / wideAreaRightMinFlank
  if (fp <= 0.25) return 'left';
  if (fp >= 0.75) return 'right';
  return 'center';
}

// Re-export resolveOwnerAtT so matcher can use it without importing engine directly.
export { resolveOwnerAtT } from '../engine/resolve';
