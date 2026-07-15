// Pass-direction classification — forward / square / backward relative to a
// team's attacking axis. Consumed by lib/intelligence/narrate.ts.
// No engine imports, no UI, no side effects.

export type PassDirection = 'forward' | 'square' | 'backward';

/**
 * How a player orients to receive and play the ball onward.
 * Used to select the narration verb for a pass.
 *
 *   turn      — receives forward, plays forward ("turns and plays")
 *   layoff    — receives forward, plays square/backward ("lays it off" / "bounces it back")
 *   half-turn — receives square, plays forward as a midfielder/forward
 *               ("receives on the half turn and plays")
 *   plain     — everything else ("plays")
 */
export type ReceptionClassification = 'turn' | 'layoff' | 'half-turn' | 'plain';

/**
 * Minimum value of the signed forward component (dot product with unit attack
 * vector, normalised by pass distance) required to classify a pass as forward
 * or backward rather than square.
 *
 * sin(30°) ≈ 0.5 — a pass must deviate at least 30° from the perpendicular
 * (purely lateral) to be called directional.
 */
export const PASS_DIRECTION_THRESHOLD = Math.sin(Math.PI / 6); // ≈ 0.5

/**
 * Minimum change in distance-from-centre-line (canvas pixels) required to
 * classify a carry as moving wide, infield, or across.
 *
 * 30 px ≈ 4% of field width (790 px). Below this the lateral movement is
 * considered a micro-adjustment and the lateral word is omitted.
 */
export const CARRY_LATERAL_MARGIN = 30; // canvas pixels

/** Lateral direction of a carry relative to the touchlines. */
export type CarryLateral = 'wide' | 'infield' | 'across';

/**
 * Classify the lateral component of a carry relative to the pitch centre line.
 *
 * Canvas x=400 is the vertical centre of the 800×600 field.
 *
 *   'across'  — carrier crosses the centre line with substantial lateral travel
 *               (fromX and toX on opposite sides of 400 and |Δx| > CARRY_LATERAL_MARGIN)
 *   'wide'    — carrier moves away from centre: |toX−400| > |fromX−400| + CARRY_LATERAL_MARGIN
 *   'infield' — carrier moves toward centre:    |toX−400| < |fromX−400| − CARRY_LATERAL_MARGIN
 *   null      — below margin; no lateral word emitted
 *
 * This is independent of attacking direction — touchlines are always at x≈10 and x≈790.
 */
export function classifyCarryLateral(fromX: number, toX: number): CarryLateral | null {
  const CENTER_X = 400;

  // 'across': crosses the centre line with meaningful lateral travel.
  const fromLeft = fromX < CENTER_X;
  const toLeft   = toX   < CENTER_X;
  if (fromLeft !== toLeft && Math.abs(toX - fromX) > CARRY_LATERAL_MARGIN) {
    return 'across';
  }

  // 'wide' / 'infield': same side of centre, significant change in distance.
  const fromDist = Math.abs(fromX - CENTER_X);
  const toDist   = Math.abs(toX   - CENTER_X);
  const delta    = toDist - fromDist;

  if (delta >  CARRY_LATERAL_MARGIN) return 'wide';
  if (delta < -CARRY_LATERAL_MARGIN) return 'infield';
  return null;
}

/**
 * Classify a pass as forward, square, or backward relative to the team's
 * attacking direction.
 *
 * Uses canvas pixel coordinates (origin top-left, 800×600, field 10–790 / 10–590).
 *
 * @param fromX  passer canvas x at moment of release
 * @param fromY  passer canvas y at moment of release
 * @param toX    receiver canvas x at moment of arrival
 * @param toY    receiver canvas y at moment of arrival
 * @param attackingDirection  team's direction of attack from frame.teams
 */
/**
 * Classify how a player receives and immediately plays the ball.
 *
 * @param incomingDir  direction of the pass ARRIVING to the player
 * @param outgoingDir  direction of the pass the player then plays
 * @param receiverLine field line of the receiving/playing player
 */
export function classifyReception(
  incomingDir: PassDirection,
  outgoingDir: PassDirection,
  receiverLine: 'defender' | 'midfielder' | 'forward' | 'unknown',
): ReceptionClassification {
  if (incomingDir === 'forward') {
    if (outgoingDir === 'forward') return 'turn';
    return 'layoff'; // square or backward
  }
  if (incomingDir === 'square') {
    if (outgoingDir === 'forward' && (receiverLine === 'midfielder' || receiverLine === 'forward')) {
      return 'half-turn';
    }
    return 'plain';
  }
  // incoming backward → plain
  return 'plain';
}

export function classifyPassDirection(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  attackingDirection: 'up' | 'down' | 'left' | 'right',
): PassDirection {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return 'square'; // degenerate zero-length pass

  // Unit attack vector — points toward the opponent goal.
  let gx = 0;
  let gy = 0;
  switch (attackingDirection) {
    case 'up':    gy = -1; break; // goal at y=10 (top of canvas)
    case 'down':  gy =  1; break;
    case 'left':  gx = -1; break;
    case 'right': gx =  1; break;
  }

  // Signed forward component: positive = toward goal, negative = away from goal.
  const forwardComponent = (dx * gx + dy * gy) / dist;

  if (forwardComponent >  PASS_DIRECTION_THRESHOLD) return 'forward';
  if (forwardComponent < -PASS_DIRECTION_THRESHOLD) return 'backward';
  return 'square';
}
