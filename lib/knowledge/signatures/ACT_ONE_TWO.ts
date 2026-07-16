// ACT_ONE_TWO — pass A→B, B returns to A within the same/next beat with A having
// advanced along the attack axis since the initial pass.
//
// Fires on the RETURN pass (B→A). A is the current pass target, B is the current passer.
//
// Predicate translation:
//   trigger (action = pass B→A):
//     (a) pass action with a player receiver (A)
//     (b) find the first-leg pass A→B that ended within ONE_TWO_TIME_WINDOW seconds
//         before this return pass starts (A = target of return, B = passer of return)
//     (c) B's possession window was brief: returnPass.start − firstLeg.end ≤ ONE_TWO_CONTROL_THRESHOLD
//         (B returned it quickly — didn't "control and build", just played it back)
//     (d) A has meaningfully advanced along the attack axis:
//         A's position at return reception is more advanced than A's position at first-leg start
//         by at least ONE_TWO_ADVANCE_PX
//
//   silence:
//     (s1) A is stationary (position change < ONE_TWO_ADVANCE_PX — same check as trigger (d))
//
//   never-co-occurs (contradictions):
//     act.layoff_underneath at beat scope — one-two is more specific (specificity 20 > 10)
//     and geometrically they are mutually exclusive (layoff is backward, one-two return is
//     forward since A has advanced).
//
// Narration: fires as a single clause on the return pass.
//   "${B label} plays a one-two with ${A label}"

import type { TermSignature } from './matcher';
import type { PassAction } from '../../engine/types';
import { resolvePosition } from '../../engine/resolve';

/**
 * Maximum time window (seconds) from the end of pass A→B to the start of pass B→A
 * for the return to qualify as part of a one-two combination.
 */
export const ONE_TWO_TIME_WINDOW = 4.0;

/**
 * Maximum possession duration (seconds) for B — if B holds the ball longer than this
 * before returning it, it is not a one-two (B "controlled" rather than "flicked it on").
 */
export const ONE_TWO_CONTROL_THRESHOLD = 1.5;

/**
 * Minimum advance distance (canvas px) for A along the attack axis between the first-leg
 * start and the return reception. Below this A is considered stationary and the pattern
 * is silenced.
 */
export const ONE_TWO_ADVANCE_PX = 20;

export const ACT_ONE_TWO: TermSignature = {
  termId: 'act.one_two',
  actor: 'any',
  trigger: [
    // (a) pass action with a player receiver
    (ctx) => {
      if (ctx.action.kind !== 'pass') return false;
      const pass = ctx.action as PassAction;
      if (!('entityId' in pass.target)) return false;
      const receiverId = (pass.target as { entityId: string }).entityId;
      const receiver = ctx.doc.entities.find(e => e.id === receiverId);
      return receiver?.kind === 'player';
    },

    // (b) find the first-leg pass A→B ending within ONE_TWO_TIME_WINDOW before return start
    //     B = current passer (ctx.actorId), A = current target
    (ctx) => {
      const returnPass = ctx.action as PassAction;
      if (!('entityId' in returnPass.target)) return false;
      const aId = returnPass.target.entityId; // A (who originally passed to B)
      const bId = ctx.actorId;                // B (who is now returning to A)

      // Find passes from A to B that ended before returnPass.start
      const firstLeg = ctx.doc.actions
        .filter(a =>
          a.kind === 'pass' &&
          a.entityId === aId &&
          'entityId' in a.target &&
          a.target.entityId === bId &&
          (a.start + a.duration) <= returnPass.start &&
          returnPass.start - (a.start + a.duration) <= ONE_TWO_TIME_WINDOW,
        )
        .sort((a, b) => b.start - a.start)[0]; // most-recent first-leg

      const found = firstLeg != null;
      ctx.debug?.(`firstLegFound=${found} aId=${aId} bId=${bId}`);
      return found;
    },

    // (c) B's possession window was brief (B returned it quickly)
    (ctx) => {
      const returnPass = ctx.action as PassAction;
      if (!('entityId' in returnPass.target)) return false;
      const aId = returnPass.target.entityId;
      const bId = ctx.actorId;

      const firstLeg = ctx.doc.actions
        .filter(a =>
          a.kind === 'pass' &&
          a.entityId === aId &&
          'entityId' in a.target &&
          a.target.entityId === bId &&
          (a.start + a.duration) <= returnPass.start &&
          returnPass.start - (a.start + a.duration) <= ONE_TWO_TIME_WINDOW,
        )
        .sort((a, b) => b.start - a.start)[0];

      if (!firstLeg) return false;
      const firstLegEnd = firstLeg.start + firstLeg.duration;
      const controlWindow = returnPass.start - firstLegEnd;
      ctx.debug?.(`controlWindow=${controlWindow.toFixed(2)}s threshold=${ONE_TWO_CONTROL_THRESHOLD}s`);
      return controlWindow <= ONE_TWO_CONTROL_THRESHOLD;
    },

    // (d) A has advanced meaningfully along the attack axis
    (ctx) => {
      const returnPass = ctx.action as PassAction;
      if (!('entityId' in returnPass.target)) return false;
      const aId = returnPass.target.entityId;
      const bId = ctx.actorId;

      const entity = ctx.doc.entities.find(e => e.id === aId);
      if (!entity || entity.kind !== 'player') return false;
      const frameTeam = ctx.frame.teams.find(t => t.id === entity.team);
      const attackDir = frameTeam?.attackingDirection;
      if (!attackDir) return false;

      const firstLeg = ctx.doc.actions
        .filter(a =>
          a.kind === 'pass' &&
          a.entityId === aId &&
          'entityId' in a.target &&
          a.target.entityId === bId &&
          (a.start + a.duration) <= returnPass.start &&
          returnPass.start - (a.start + a.duration) <= ONE_TWO_TIME_WINDOW,
        )
        .sort((a, b) => b.start - a.start)[0];

      if (!firstLeg) return false;

      // A's position at first-leg start (when A originally played the ball)
      const pos0 = resolvePosition(ctx.doc, aId, firstLeg.start);
      // A's position when the return pass arrives
      const returnEnd = returnPass.start + returnPass.duration;
      const pos1 = resolvePosition(ctx.doc, aId, returnEnd);

      // For 'up': y decreases toward goal (y=10). A advances → pos1.y < pos0.y.
      const advance = attackDir === 'up'
        ? pos0.y - pos1.y   // positive = advanced
        : pos1.y - pos0.y;  // positive = advanced

      ctx.debug?.(`advance=${Math.round(advance)}px threshold=${ONE_TWO_ADVANCE_PX}px attackDir=${attackDir}`);
      return advance >= ONE_TWO_ADVANCE_PX;
    },
  ],
  silence: [],
  contradictions: [
    { termId: 'act.layoff_underneath', scope: 'beat' },
  ],
  anchor: 'ball',
  specificity: 20,
  phrase: {
    primary: 'plays a one-two with',
    variants: ['completes a one-two with', 'returns it to complete the one-two with'],
  },
};
