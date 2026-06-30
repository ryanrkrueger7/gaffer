// Gaffer compute layer — pure functions, no React/Konva.
// Answers "what is the board state at time T?" from a GafferDocument.

import type {
  GafferDocument,
  Entity,
  PlayerEntity,
  BallEntity,
  ZoneEntity,
  RunAction,
  CarryAction,
  PassAction,
  Annotation,
} from './types';

// ── Exported snapshot types ───────────────────────────────────────────────────

export interface EntitySnapshot {
  id: string;
  kind: Entity['kind'];
  x: number;
  y: number;
  team?: 'A' | 'B' | 'neutral';
  color?: string;
  radius?: number;
  display?: PlayerEntity['display'];
}

export interface BoardState {
  entities: EntitySnapshot[]; // excludes ball and zones
  ball: { x: number; y: number };
  activeAnnotations: Annotation[];
}

// ── Internal constants ────────────────────────────────────────────────────────

const DEFAULT_ENTITY_RADIUS = 22;
const BALL_RADIUS = 9;

// ── Internal helpers ──────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function safeFrac(elapsed: number, duration: number): number {
  return duration > 0 ? Math.min(elapsed / duration, 1) : 1;
}

// Quadratic ease-in-out: accelerate in the first half, decelerate in the second.
// Matches the reference DrillPlayer.tsx easing — written fresh, not imported.
function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// Standard quadratic bezier: B(t) = (1-t)²·P0 + 2(1-t)t·P1 + t²·P2
function quadBezier(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  t: number,
): { x: number; y: number } {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

// Interpolate from p0→p2 along the action's path, with easing already applied to `frac`.
function interpolateAlongPath(
  p0: { x: number; y: number },
  p2: { x: number; y: number },
  path: { type: string; cx?: number; cy?: number },
  frac: number,
): { x: number; y: number } {
  if (path.type === 'bezier' && path.cx != null && path.cy != null) {
    return quadBezier(p0, { x: path.cx, y: path.cy }, p2, frac);
  }
  return { x: lerp(p0.x, p2.x, frac), y: lerp(p0.y, p2.y, frac) };
}

// Type guard: entity has a fixed initial position (not ball, not zone).
function hasInitial(e: Entity): e is Exclude<Entity, BallEntity | ZoneEntity> {
  return e.kind !== 'ball' && e.kind !== 'zone';
}

// Apply the perimeter offset to an already-resolved player-center position.
// The ball sits tangent to the player's marker, offset toward the direction of play.
// All owned states (pre-sequence, in-carry, post-pass resting) use this one function.
function ballPerimeter(
  doc: GafferDocument,
  ownerId: string,
  center: { x: number; y: number },
): { x: number; y: number } {
  const owner = doc.entities.find(e => e.id === ownerId);
  const ownerR = owner?.radius ?? DEFAULT_ENTITY_RADIUS;
  const dist = ownerR + BALL_RADIUS + 1; // tangent + 1 px gap
  // Fixed default direction: 'up' → goal at top → ball above player (negative y).
  const dy = doc.stage.direction === 'up' ? -dist : dist;
  return { x: center.x, y: center.y + dy };
}

// ── resolvePosition ───────────────────────────────────────────────────────────

/**
 * Returns where entity `entityId` is at time `t` (seconds).
 *
 * Default: entity.initial.
 * During a Run: eased interpolation from current position toward destination
 *   along a straight line or quadratic bezier (path.cx, path.cy).
 * After a completed Run: the run's destination.
 * Multiple chained Runs are handled in start-time order.
 * Landmark destinations are not yet resolved — they are skipped silently.
 */
export function resolvePosition(
  doc: GafferDocument,
  entityId: string,
  t: number,
): { x: number; y: number } {
  const entity = doc.entities.find(e => e.id === entityId);
  if (!entity || !hasInitial(entity)) return { x: 0, y: 0 };

  const runs = doc.actions
    .filter((a): a is RunAction => a.kind === 'run' && a.entityId === entityId)
    .sort((a, b) => a.start - b.start);

  let pos = { x: entity.initial.x, y: entity.initial.y };

  for (const run of runs) {
    if (t < run.start) break;

    if (!('x' in run.destination)) continue; // landmark — not implemented

    const dest = run.destination; // { x, y }
    const end = run.start + run.duration;

    if (t <= end) {
      const frac = ease(safeFrac(t - run.start, run.duration));
      return interpolateAlongPath(pos, dest, run.path, frac);
    }

    // Run complete — the end position of a bezier is still the destination.
    pos = { x: dest.x, y: dest.y };
  }

  return pos;
}

// ── resolveBallPosition ───────────────────────────────────────────────────────

/**
 * Returns the VISUAL position of the ball at time `t`, including perimeter offset.
 *
 * Ball possession timeline:
 *   - Before the first ball action: ball is on the first actor's perimeter.
 *   - During a Pass: ball in flight from PASSER'S PERIMETER at pass-start →
 *       RECEIVER'S PERIMETER at pass-end. No center-pop at either end.
 *   - After a Pass to an entity: ball BINDS to that receiver — follows their
 *       perimeter until the next ball action.
 *   - During a Carry: ball on the carrier's perimeter (their Run handles movement).
 *   - After a Carry: ball remains on the carrier's perimeter.
 *
 * Perimeter offset logic lives here, never in the renderer.
 */
export function resolveBallPosition(
  doc: GafferDocument,
  t: number,
): { x: number; y: number } {
  const ballEntity = doc.entities.find((e): e is BallEntity => e.kind === 'ball');
  const initialPos = ballEntity
    ? { x: ballEntity.initial.x, y: ballEntity.initial.y }
    : { x: 400, y: 300 };

  const ballActions = doc.actions
    .filter((a): a is CarryAction | PassAction => a.kind === 'carry' || a.kind === 'pass')
    .sort((a, b) => a.start - b.start);

  // Seed the initial owner: whoever performs the first ball action implicitly holds
  // the ball before the sequence begins, so at t=0 the ball is on their perimeter.
  let currentOwner: string | null =
    ballActions.length > 0 ? ballActions[0].entityId : null;
  let lastLoosePos = { ...initialPos };

  for (const action of ballActions) {
    if (t < action.start) {
      // Haven't reached this action yet — return ball in its current state.
      if (currentOwner !== null) {
        return ballPerimeter(doc, currentOwner, resolvePosition(doc, currentOwner, t));
      }
      return lastLoosePos;
    }

    const end = action.start + action.duration;
    const frac = ease(safeFrac(t - action.start, action.duration));

    if (action.kind === 'carry') {
      if (t <= end) {
        // During carry: ball sits on the carrier's perimeter.
        // resolvePosition follows their Run (including bezier) automatically.
        const center = resolvePosition(doc, action.entityId, t);
        return ballPerimeter(doc, action.entityId, center);
      }
      // Carry complete — carrier still owns the ball.
      currentOwner = action.entityId;
    } else {
      // pass — use inline `in` narrowing so TypeScript resolves PassTarget members
      const target = action.target;

      // Pass originates from the PASSER'S PERIMETER at the moment of release.
      const passerCenter = resolvePosition(doc, action.entityId, action.start);
      const fromPos = ballPerimeter(doc, action.entityId, passerCenter);

      // Pass arrives at the RECEIVER'S PERIMETER at the moment of arrival.
      const toPos =
        'entityId' in target
          ? ballPerimeter(doc, target.entityId, resolvePosition(doc, target.entityId, end))
          : { x: target.x, y: target.y }; // location targets have no perimeter offset

      if (t <= end) {
        // Ball in flight — glides from perimeter to perimeter, no jump at either end.
        return interpolateAlongPath(fromPos, toPos, action.path, frac);
      }

      // Pass complete.
      if ('entityId' in action.target) {
        currentOwner = action.target.entityId;
      } else {
        currentOwner = null;
        lastLoosePos = toPos;
      }
    }
  }

  // After all ball actions: still on the owner's perimeter, or loose at lastLoosePos.
  if (currentOwner !== null) {
    return ballPerimeter(doc, currentOwner, resolvePosition(doc, currentOwner, t));
  }
  return lastLoosePos;
}

// ── resolveBoardState ─────────────────────────────────────────────────────────

/**
 * Full board snapshot at time `t` — everything the renderer needs.
 * Excludes ball (returned separately as a visual position) and zones.
 */
export function resolveBoardState(doc: GafferDocument, t: number): BoardState {
  const entities: EntitySnapshot[] = doc.entities
    .filter(hasInitial)
    .map(e => {
      const pos = resolvePosition(doc, e.id, t);
      return {
        id: e.id,
        kind: e.kind,
        x: pos.x,
        y: pos.y,
        team: e.team,
        color: e.color,
        radius: e.radius,
        display: e.kind === 'player' ? e.display : undefined,
      };
    });

  const ball = resolveBallPosition(doc, t);

  // A beat is "active" at t if any of its actions spans [start, start+duration].
  const activeBeatIds = new Set(
    doc.actions
      .filter(a => t >= a.start && t <= a.start + a.duration)
      .map(a => a.beatId),
  );

  const activeAnnotations = doc.annotations.filter(
    ann => ann.beatId != null && activeBeatIds.has(ann.beatId),
  );

  return { entities, ball, activeAnnotations };
}
