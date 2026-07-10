// Gaffer compute layer — pure functions, no React/Konva.
// Answers "what is the board state at time T?" from a GafferDocument.

import type {
  GafferDocument,
  Entity,
  PlayerEntity,
  BallEntity,
  ZoneEntity,
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
 * During a Run: eased interpolation toward destination along straight or bezier path.
 * During a Carry with destination: same movement semantics as a Run (Carry owns the movement
 *   when it carries a destination — no concurrent RunAction required).
 * After a completed movement: the destination.
 * Multiple chained movements are handled in start-time order.
 * Landmark destinations and Carry without destination are skipped silently.
 */
export function resolvePosition(
  doc: GafferDocument,
  entityId: string,
  t: number,
): { x: number; y: number } {
  const entity = doc.entities.find(e => e.id === entityId);
  if (!entity || !hasInitial(entity)) return { x: 0, y: 0 };

  // Collect all movement-providing actions for this entity: Runs with xy destination,
  // and Carries that carry an explicit destination (editor-authored carries).
  type MvSlot = { start: number; duration: number; destination: { x: number; y: number }; path: { type: string; cx?: number; cy?: number } };
  const movements: MvSlot[] = [];

  for (const a of doc.actions) {
    if (a.entityId !== entityId) continue;
    if (a.kind === 'run' && 'x' in a.destination) {
      movements.push({ start: a.start, duration: a.duration, destination: a.destination, path: a.path });
    } else if (a.kind === 'carry' && a.destination != null) {
      movements.push({ start: a.start, duration: a.duration, destination: a.destination, path: a.path });
    }
  }
  movements.sort((a, b) => a.start - b.start);

  let pos = { x: entity.initial.x, y: entity.initial.y };

  for (const mv of movements) {
    if (t < mv.start) break;

    const end = mv.start + mv.duration;

    if (t <= end) {
      const frac = ease(safeFrac(t - mv.start, mv.duration));
      return interpolateAlongPath(pos, mv.destination, mv.path, frac);
    }

    pos = { x: mv.destination.x, y: mv.destination.y };
  }

  return pos;
}

// ── resolvePossessionAtT ──────────────────────────────────────────────────────

/**
 * Discriminated union describing ball state at time `t`.
 *
 *   owned    — ball is bound to a player (at rest or moving with them during a carry).
 *   inFlight — ball is mid-pass (fromPos → toPos with interpolation data).
 *   loose    — no owner; ball rests at an absolute position.
 *
 * This is the SINGLE authoritative possession resolver. Both resolveBallPosition
 * and resolveOwnerAtT derive from this; there is no separate implementation.
 */
export type PossessionState =
  | { kind: 'owned'; ownerId: string }
  | { kind: 'inFlight'; fromPos: { x: number; y: number }; toPos: { x: number; y: number }; progress: number; path: { type: string; cx?: number; cy?: number } }
  | { kind: 'loose'; pos: { x: number; y: number } };

export function resolvePossessionAtT(doc: GafferDocument, t: number): PossessionState {
  const ballEntity = doc.entities.find((e): e is BallEntity => e.kind === 'ball');

  // No ball entity placed yet — return a loose fallback (won't be rendered by editor).
  if (!ballEntity) {
    return { kind: 'loose', pos: { x: 400, y: 300 } };
  }

  const ballActions = doc.actions
    .filter((a): a is CarryAction | PassAction => a.kind === 'carry' || a.kind === 'pass')
    .sort((a, b) => a.start - b.start);

  // Seed initial owner: first player whose center contains ball.initial.
  // The editor snaps ball.initial to the player's center on placement, enabling this check.
  let currentOwner: string | null = null;
  for (const e of doc.entities) {
    if (e.kind !== 'player') continue;
    const r = e.radius ?? DEFAULT_ENTITY_RADIUS;
    const dx = e.initial.x - ballEntity.initial.x;
    const dy = e.initial.y - ballEntity.initial.y;
    if (dx * dx + dy * dy <= r * r) {
      currentOwner = e.id;
      break;
    }
  }
  let lastLoosePos: { x: number; y: number } = { x: ballEntity.initial.x, y: ballEntity.initial.y };

  for (const action of ballActions) {
    if (t < action.start) {
      // Haven't reached this action — return current possession state.
      if (currentOwner !== null) return { kind: 'owned', ownerId: currentOwner };
      return { kind: 'loose', pos: lastLoosePos };
    }

    const end = action.start + action.duration;

    if (action.kind === 'carry') {
      // During carry: ball is owned by carrier (movement tracked by resolvePosition).
      if (t < end) return { kind: 'owned', ownerId: action.entityId };
      // Carry complete — carrier retains possession.
      currentOwner = action.entityId;
    } else {
      // Pass: ball flies from PASSER'S PERIMETER at release → TARGET'S PERIMETER at arrival.
      const passerCenter = resolvePosition(doc, action.entityId, action.start);
      const fromPos = ballPerimeter(doc, action.entityId, passerCenter);

      let toPos: { x: number; y: number };
      if ('entityId' in action.target) {
        const receiverCenter = resolvePosition(doc, action.target.entityId, end);
        toPos = ballPerimeter(doc, action.target.entityId, receiverCenter);
      } else {
        toPos = { x: action.target.x, y: action.target.y };
      }

      if (t < end) {
        // Ball in flight — no owner, interpolation data returned.
        const progress = ease(safeFrac(t - action.start, action.duration));
        return { kind: 'inFlight', fromPos, toPos, progress, path: action.path };
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

  // After all ball actions.
  if (currentOwner !== null) return { kind: 'owned', ownerId: currentOwner };
  return { kind: 'loose', pos: lastLoosePos };
}

// ── resolveBallPosition ───────────────────────────────────────────────────────

/**
 * Returns the VISUAL position of the ball at time `t`, including perimeter offset.
 * Derives entirely from resolvePossessionAtT — no separate ownership logic.
 */
export function resolveBallPosition(
  doc: GafferDocument,
  t: number,
): { x: number; y: number } {
  const poss = resolvePossessionAtT(doc, t);
  switch (poss.kind) {
    case 'owned':
      // Ball sits tangent to owner's perimeter; follows their resolvedPosition.
      return ballPerimeter(doc, poss.ownerId, resolvePosition(doc, poss.ownerId, t));
    case 'inFlight':
      // Ball glides perimeter-to-perimeter; no center-pop at either end.
      return interpolateAlongPath(poss.fromPos, poss.toPos, poss.path, poss.progress);
    case 'loose':
      return poss.pos;
  }
}

// ── resolveOwnerAtT ───────────────────────────────────────────────────────────

/**
 * Returns the entity id of the ball owner at time `t`, or null (inFlight / loose / no ball).
 * Derives from resolvePossessionAtT — guaranteed to agree with resolveBallPosition.
 */
export function resolveOwnerAtT(doc: GafferDocument, t: number): string | null {
  if (!doc.entities.some(e => e.kind === 'ball')) return null;
  const poss = resolvePossessionAtT(doc, t);
  return poss.kind === 'owned' ? poss.ownerId : null;
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

// ── resolveTargetPoint ────────────────────────────────────────────────────────

/**
 * Resolves a static reference point for any entity kind, used when an action
 * targets a non-moving entity (goal, mini-goal, zone, etc.) rather than a raw
 * coordinate.
 *
 * - PlayerEntity, GoalEntity, MinigoalEntity, ConeEntity, MannequinEntity,
 *   BallEntity: returns entity.initial — the static placement position.
 *   NOTE: for players this is the initial position only, NOT their animated
 *   position at time t. Use resolvePosition() when you need that.
 * - ZoneEntity (rect): returns the centroid (midpoint of width/height).
 * - ZoneEntity (polygon): returns the arithmetic centroid (average of vertices).
 *   Only rect zones are currently drawable in the editor; polygon support is
 *   included here for completeness and external document compatibility.
 *
 * Returns null if entityId is not found in doc.entities.
 *
 * This function is fully isolated from resolvePosition, resolveBallPosition,
 * and resolvePossessionAtT. It reads only entity.initial / entity.region.
 */
export function resolveTargetPoint(
  doc: GafferDocument,
  entityId: string,
): { x: number; y: number } | null {
  const entity = doc.entities.find(e => e.id === entityId);
  if (!entity) return null;

  if (entity.kind === 'zone') {
    const { region } = entity;
    if (region.shape === 'rect') {
      return { x: region.x + region.width / 2, y: region.y + region.height / 2 };
    }
    // Polygon: arithmetic centroid (average of vertices).
    const { points } = region;
    if (points.length === 0) return null;
    return {
      x: points.reduce((s, p) => s + p.x, 0) / points.length,
      y: points.reduce((s, p) => s + p.y, 0) / points.length,
    };
  }

  // All remaining kinds (player, ball, cone, minigoal, mannequin, goal) have initial.
  return { x: entity.initial.x, y: entity.initial.y };
}
