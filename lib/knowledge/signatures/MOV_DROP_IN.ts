// MOV_DROP_IN — a midfielder or forward drops back away from goal into a deeper zone,
// creating a receiving option in a less-advanced area.
//
// Predicate translation:
//   trigger (action = run):
//     (a) run action + attacking direction exists
//     (b) actor line is 'midfielder' or 'forward' (drops-in are positional movements by
//         more advanced players; defenders repositioning is not a "drop-in")
//     (c) runVectorVsAttack = 'away' (run is directed away from the goal)
//     (d) run destination is less advanced than run start on the attack axis
//         (player moves to a deeper zone — end.y > start.y for 'up')
//     (e) run travel distance ≥ DROP_IN_MIN_DISTANCE_PX (not trivial repositioning)
//
//   silence:
//     (s1) actor authored a pass starting within 0.2s of run.start — player is
//          repositioning AFTER passing, not dropping in as a receiving option.
//          Specificity 12 > MOV_CHECK_TO_BALL 10, so drop-in wins when both trigger;
//          the contradiction table is advisory (contradictions are not yet enforced).
//
//   never-co-occurs (contradictions):
//     mov.run_in_behind at player-beat — opposite run vectors
//     mov.check_to_ball at player-beat — silenced by s1 when actor just passed

import type { TermSignature } from './matcher';
import type { RunAction } from '../../engine/types';
import { resolvePosition } from '../../engine/resolve';
import { runVectorVsAttack } from '../primitives';
import { roleToLine } from '../roles';

/**
 * Minimum run travel distance (canvas px) for a drop-in.
 * Below this the movement is trivial repositioning and is silenced by trigger (f).
 */
export const DROP_IN_MIN_DISTANCE_PX = 30;

export const MOV_DROP_IN: TermSignature = {
  termId: 'mov.drop_in',
  actor: 'any', // line filter applied in trigger (b)
  trigger: [
    // (a) run action + attacking direction exists
    (ctx) => {
      if (ctx.action.kind !== 'run') return false;
      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      if (!entity || entity.kind !== 'player') return false;
      const frameTeam = ctx.frame.teams.find(t => t.id === entity.team);
      return frameTeam?.attackingDirection != null;
    },

    // (b) actor line is 'midfielder' or 'forward'
    (ctx) => {
      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      if (!entity || entity.kind !== 'player') return false;
      const posId = entity.display?.positionId ?? entity.display?.inferredPositionId;
      if (!posId) return false;
      const line = roleToLine(posId);
      ctx.debug?.(`actorLine=${line}`);
      return line === 'midfielder' || line === 'forward';
    },

    // (c) run vector is 'away' from goal
    (ctx) => {
      const run = ctx.action as RunAction;
      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      const frameTeam = ctx.frame.teams.find(t => t.id === (entity as { team?: string } | undefined)?.team)!;
      const attackDir = frameTeam.attackingDirection!;
      const vec = runVectorVsAttack(ctx.doc, run, attackDir);
      ctx.debug?.(`runVector=${vec} attackDir=${attackDir}`);
      return vec === 'away';
    },

    // (d) run destination is less advanced than start (player moves deeper)
    (ctx) => {
      const run = ctx.action as RunAction;
      if (!('x' in run.destination)) return false; // landmark — can't evaluate
      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      const frameTeam = ctx.frame.teams.find(t => t.id === (entity as { team?: string } | undefined)?.team)!;
      const attackDir = frameTeam.attackingDirection!;

      const startPos = resolvePosition(ctx.doc, run.entityId, run.start);
      const endY = run.destination.y;

      // For 'up': less advanced = higher y. For 'down': less advanced = lower y.
      const deeperEnd = attackDir === 'up'
        ? endY > startPos.y
        : endY < startPos.y;

      ctx.debug?.(`startY=${Math.round(startPos.y)} endY=${Math.round(endY)} deeperEnd=${deeperEnd}`);
      return deeperEnd;
    },

    // (e) travel distance ≥ DROP_IN_MIN_DISTANCE_PX (not trivial repositioning)
    (ctx) => {
      const run = ctx.action as RunAction;
      if (!('x' in run.destination)) return true; // landmark
      const start = resolvePosition(ctx.doc, run.entityId, run.start);
      const dist = Math.hypot(run.destination.x - start.x, run.destination.y - start.y);
      ctx.debug?.(`distance=${Math.round(dist)}px threshold=${DROP_IN_MIN_DISTANCE_PX}px`);
      return dist >= DROP_IN_MIN_DISTANCE_PX;
    },
  ],
  silence: [
    // (s1) Actor played a pass starting within 0.2s of run.start — this is a player
    //      repositioning AFTER playing, not a purposeful "drop-in to receive" movement.
    (ctx) => {
      const run = ctx.action as RunAction;
      const silenced = ctx.doc.actions.some(
        a => a.kind === 'pass' && a.entityId === ctx.actorId && Math.abs(a.start - run.start) <= 0.2,
      );
      ctx.debug?.(`s1 justPassed=${silenced}`);
      return silenced;
    },
  ],
  contradictions: [
    { termId: 'mov.run_in_behind', scope: 'player-beat' },
    { termId: 'mov.check_to_ball', scope: 'player-beat' },
  ],
  anchor: 'ball',
  specificity: 12,
  phrase: {
    primary: 'drops in',
    variants: ['drops deep', 'drops into the pocket'],
  },
};
