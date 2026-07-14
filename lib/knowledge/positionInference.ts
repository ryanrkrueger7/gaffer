// Pure position-inference function — no UI, no engine imports, no side effects.
// Derives a PositionId from raw canvas coordinates, team attacking direction,
// and an optional formation string.

import type { PositionId } from './formations';
import { getFormation } from './formations';

// ── Field boundary constants ──────────────────────────────────────────────────

const FIELD_X_MIN = 10;
const FIELD_X_MAX = 790;
const FIELD_Y_MIN = 10;
const FIELD_Y_MAX = 590;

// ── Internal axis types ───────────────────────────────────────────────────────

type Third = 'defensive' | 'middle' | 'attacking';
type Flank = 'left' | 'center' | 'right';

// ── Axis normalization ────────────────────────────────────────────────────────

/**
 * Maps raw (x, y) to two [0, 1] scalars:
 *   attackProgress — 0 = own goal end, 1 = opponent goal end.
 *   flankPos       — 0 = left flank, 1 = right flank (from the team's perspective).
 */
function computeAxes(
  x: number,
  y: number,
  direction: 'up' | 'down' | 'left' | 'right',
): { attackProgress: number; flankPos: number } {
  const fw = FIELD_X_MAX - FIELD_X_MIN; // 780
  const fh = FIELD_Y_MAX - FIELD_Y_MIN; // 580

  switch (direction) {
    case 'up':
      // Team attacks toward y = FIELD_Y_MIN (top). Own goal at bottom.
      return {
        attackProgress: (FIELD_Y_MAX - y) / fh,
        flankPos: (x - FIELD_X_MIN) / fw,
      };
    case 'down':
      // Team attacks toward y = FIELD_Y_MAX (bottom). Own goal at top.
      // Flank axis is mirrored: facing down, canvas-right is the team's left.
      return {
        attackProgress: (y - FIELD_Y_MIN) / fh,
        flankPos: (FIELD_X_MAX - x) / fw,
      };
    case 'left':
      // Team attacks toward x = FIELD_X_MIN (left). Own goal at right.
      // Facing west: team's left = south (higher y) → flankPos=0 at FIELD_Y_MAX.
      return {
        attackProgress: (FIELD_X_MAX - x) / fw,
        flankPos: (FIELD_Y_MAX - y) / fh,
      };
    case 'right':
      // Team attacks toward x = FIELD_X_MAX (right). Own goal at left.
      // Facing east: team's left = north (lower y) → flankPos=0 at FIELD_Y_MIN.
      return {
        attackProgress: (x - FIELD_X_MIN) / fw,
        flankPos: (y - FIELD_Y_MIN) / fh,
      };
  }
}

function toThird(p: number): Third {
  return p < 1 / 3 ? 'defensive' : p < 2 / 3 ? 'middle' : 'attacking';
}

function toFlank(p: number): Flank {
  return p < 1 / 3 ? 'left' : p < 2 / 3 ? 'center' : 'right';
}

// ── Coarse 3×3 grid (no formation) ───────────────────────────────────────────

const COARSE: Record<Third, Record<Flank, PositionId>> = {
  defensive: { left: 'LB', center: 'CB', right: 'RB' },
  middle:    { left: 'LM', center: 'CM', right: 'RM' },
  attacking: { left: 'LW', center: 'ST', right: 'RW' },
};

// ── GK proximity threshold ────────────────────────────────────────────────────

// attackProgress < this value → treat as GK regardless of formation or grid.
// 0.10 × 580px ≈ 58px from the own goal line, covering the goal area depth.
const GK_THRESHOLD = 0.10;

// ── Suggestion display threshold ──────────────────────────────────────────────

/**
 * Minimum confidence value at which a position inference is considered reliable
 * enough to surface as a ghost suggestion in the UI.
 * Chat 3 should import this constant rather than hardcoding the numeric value.
 */
export const INFER_CONFIDENCE_THRESHOLD = 0.70;

// ── Public API ────────────────────────────────────────────────────────────────

export function inferPosition(
  x: number,
  y: number,
  teamId: string,
  scoringDirection: Record<string, 'up' | 'down' | 'left' | 'right'>,
  formation?: string,
): { position: PositionId; confidence: number } {
  const direction = scoringDirection[teamId] ?? 'up';
  const { attackProgress, flankPos } = computeAxes(x, y, direction);

  // GK special case: entity is near the own goal line.
  if (attackProgress < GK_THRESHOLD) {
    return { position: 'GK', confidence: 0.85 };
  }

  const third = toThird(attackProgress);
  const flank = toFlank(flankPos);

  if (!formation) {
    return { position: COARSE[third][flank], confidence: 0.55 };
  }

  const f = getFormation(formation);
  if (!f) {
    // Unknown formation string — fall back to coarse grid.
    return { position: COARSE[third][flank], confidence: 0.55 };
  }

  // Find the formation slot whose regionHint best matches (third, flank).
  // Score: third match = 2 pts, flank match = 1 pt (max = 3).
  let best = f.slots[0];
  let bestScore = -1;

  for (const slot of f.slots) {
    const score =
      (slot.regionHint.third === third ? 2 : 0) +
      (slot.regionHint.flank === flank ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = slot;
    }
  }

  // Confidence tiers: exact region match (3) → 0.85, third-only match (2) → 0.75, no match → 0.70.
  const confidence = bestScore === 3 ? 0.85 : bestScore === 2 ? 0.75 : 0.70;
  return { position: best.position, confidence };
}
