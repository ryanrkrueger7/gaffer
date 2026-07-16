// MOV_CHECK_TO_BALL — player makes a checking run toward the ball to receive it.
//
// Predicate translation (FIX 1 — tightened from Tier 1 baseline):
//   trigger:
//     (a) actor does NOT own the ball at run.start
//     (b) distanceToBallTrend is 'closing' — player moves toward the ball
//     (c) run ends within NEAR_BALL_PX of the ball position at run.end
//         (player actually positions to receive, not just trending closer from far)
//
//   silence:
//     (s1) runVectorVsAttack is 'toward-goal' — forward runs are MOV_RUN_IN_BEHIND
//          territory; this also catches runs that close to a receding ball.
//
//   never-co-occurs (contradictions at player-beat scope):
//     MOV_OVERLAP, MOV_RUN_IN_BEHIND — handled by specificity ranking; listed here
//     for the contradiction table that will be enforced in a later milestone.
//
// Higher-specificity terms (MOV_OVERLAP=30, MOV_RUN_IN_BEHIND=20) always subsume
// this term (specificity 10) when both fire on the same action.

import type { TermSignature } from './matcher';
import type { RunAction } from '../../engine/types';
import { resolveOwnerAtT, resolveBallPosition, resolvePosition } from '../../engine/resolve';
import { distanceToBallTrend, runVectorVsAttack } from '../primitives';

/** Distance threshold (px) — runner must end within this radius of the ball at run.end. */
const NEAR_BALL_PX = 200;

export const MOV_CHECK_TO_BALL: TermSignature = {
  termId: 'mov.check_to_ball',
  actor: 'any',
  trigger: [
    // (a) must be a run action
    (ctx) => ctx.action.kind === 'run',

    // (b) actor must not own the ball at run start
    (ctx) => {
      const run = ctx.action as RunAction;
      const owner = resolveOwnerAtT(ctx.doc, run.start);
      const owns = owner === ctx.actorId;
      ctx.debug?.(`ownerAtStart=${owner ?? 'null'} owns=${owns}`);
      return !owns;
    },

    // (c) closing trend — player is getting closer to the ball over the run window
    (ctx) => {
      const run = ctx.action as RunAction;
      const trend = distanceToBallTrend(ctx.doc, ctx.actorId, run);
      ctx.debug?.(`distanceToBallTrend=${trend}`);
      return trend === 'closing';
    },

    // (d) run ends within NEAR_BALL_PX of ball position at run.end
    //     ensures actor is actually positioning to receive, not just trending closer from far
    (ctx) => {
      const run = ctx.action as RunAction;
      const t1 = run.start + run.duration;
      const endPos = 'x' in run.destination
        ? { x: run.destination.x, y: run.destination.y }
        : resolvePosition(ctx.doc, ctx.actorId, t1);
      const ballPos = resolveBallPosition(ctx.doc, t1);
      const dist = Math.hypot(endPos.x - ballPos.x, endPos.y - ballPos.y);
      ctx.debug?.(`endNearBall dist=${Math.round(dist)}px threshold=${NEAR_BALL_PX}px`);
      return dist <= NEAR_BALL_PX;
    },
  ],
  silence: [
    // (s1) run vector is toward-goal — this is MOV_RUN_IN_BEHIND territory
    (ctx) => {
      const run = ctx.action as RunAction;
      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      if (!entity || entity.kind !== 'player') return false;
      const frameTeam = ctx.frame.teams.find(t => t.id === entity.team);
      const attackDir = frameTeam?.attackingDirection;
      if (!attackDir) return false;
      const vec = runVectorVsAttack(ctx.doc, run, attackDir);
      ctx.debug?.(`runVector=${vec}`);
      return vec === 'toward-goal';
    },
  ],
  contradictions: [
    { termId: 'mov.overlap',        scope: 'player-beat' },
    { termId: 'mov.run_in_behind',  scope: 'player-beat' },
  ],
  anchor: 'ball',
  specificity: 10,
  phrase: {
    primary: 'checks to the ball',
    variants: ['checks short', 'checks toward the ball', 'shows for the ball'],
  },
};
