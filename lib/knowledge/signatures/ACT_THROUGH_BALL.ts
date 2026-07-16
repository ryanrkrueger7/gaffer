// ACT_THROUGH_BALL — a forward pass delivered into a receiver who has an active
// toward-goal run, with the destination beyond the team's furthest teammate
// (Tier 1 proxy for "behind the defensive line").
//
// Fires on the PASS action. The corresponding run term (MOV_RUN_IN_BEHIND) fires on
// the RUN action. narrate.ts composes the two via the resolvedRunAtPass lifecycle map:
//
//   Run clause (from MOV_RUN_IN_BEHIND, earlier in timeline):
//     "the striker runs in behind"
//   Pass clause (through-ball + lifecycle):
//     "the central midfielder plays the striker through, continuing his run"
//
//   Pass clause (through-ball only, no matched run term):
//     "the central midfielder plays through to the striker"
//
// Predicate translation:
//   trigger (action = pass):
//     (a) pass action with a player receiver
//     (b) pass is classified as forward (classifyPassDirection)
//     (c) receiver has an active toward-goal run overlapping pass.start
//         (run start ≤ pass.start < run end; runVectorVsAttack = 'toward-goal')
//     (d) receiver's position at pass arrival is beyond the furthest teammate
//         (beyondFurthestTeammate at pass.start + pass.duration)
//
//   silence: (none at Tier 1)
//   never-co-occurs: (none at Tier 1)

import type { TermSignature } from './matcher';
import type { PassAction, RunAction } from '../../engine/types';
import { resolvePosition } from '../../engine/resolve';
import { classifyPassDirection } from '../passDirection';
import { beyondFurthestTeammate, runVectorVsAttack } from '../primitives';

export const ACT_THROUGH_BALL: TermSignature = {
  termId: 'act.through_ball',
  actor: 'any',
  trigger: [
    // (a) pass action with a player receiver
    (ctx) => {
      if (ctx.action.kind !== 'pass') return false;
      const pass = ctx.action as PassAction;
      if (!('entityId' in pass.target)) return false;
      const receiver = ctx.doc.entities.find(e => e.id === (pass.target as { entityId: string }).entityId);
      return receiver?.kind === 'player';
    },

    // (b) pass is forward
    (ctx) => {
      const pass = ctx.action as PassAction;
      if (!('entityId' in pass.target)) return false;

      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      if (!entity || entity.kind !== 'player') return false;
      const frameTeam = ctx.frame.teams.find(t => t.id === entity.team);
      const attackDir = frameTeam?.attackingDirection;
      if (!attackDir) return false;

      const senderPos   = resolvePosition(ctx.doc, ctx.actorId, pass.start);
      const receiverPos = resolvePosition(ctx.doc, pass.target.entityId, pass.start + pass.duration);
      const dir = classifyPassDirection(senderPos.x, senderPos.y, receiverPos.x, receiverPos.y, attackDir);
      ctx.debug?.(`passDirection=${dir}`);
      return dir === 'forward';
    },

    // (c) receiver has an active toward-goal run at pass.start
    (ctx) => {
      const pass = ctx.action as PassAction;
      if (!('entityId' in pass.target)) return false;
      const receiverId = pass.target.entityId;

      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      if (!entity || entity.kind !== 'player') return false;
      const frameTeam = ctx.frame.teams.find(t => t.id === entity.team);
      const attackDir = frameTeam?.attackingDirection;
      if (!attackDir) return false;

      // Find any run by the receiver that is active at pass.start
      for (const a of ctx.doc.actions) {
        if (a.kind !== 'run') continue;
        if (a.entityId !== receiverId) continue;
        const runEnd = a.start + a.duration;
        if (a.start > pass.start || runEnd <= pass.start) continue; // not active at pass.start
        const run = a as RunAction;
        const vec = runVectorVsAttack(ctx.doc, run, attackDir);
        ctx.debug?.(`receiverRun runId=${run.id.slice(-6)} runVector=${vec} activeAtPassStart=${pass.start.toFixed(2)}`);
        if (vec === 'toward-goal') return true;
      }
      ctx.debug?.(`receiverRun: no active toward-goal run found at passStart=${pass.start.toFixed(2)}`);
      return false;
    },

    // (d) receiver is beyond the furthest teammate at pass arrival
    (ctx) => {
      const pass = ctx.action as PassAction;
      if (!('entityId' in pass.target)) return false;
      const receiverId = pass.target.entityId;

      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      if (!entity || entity.kind !== 'player') return false;
      const receiverEntity = ctx.doc.entities.find(e => e.id === receiverId);
      if (!receiverEntity || receiverEntity.kind !== 'player') return false;

      const frameTeam = ctx.frame.teams.find(t => t.id === receiverEntity.team);
      const attackDir = frameTeam?.attackingDirection;
      if (!attackDir) return false;

      const passEnd = pass.start + pass.duration;
      const beyond = beyondFurthestTeammate(ctx.doc, receiverId, passEnd, attackDir);
      ctx.debug?.(`beyondFurthestTeammate=${beyond} at passEnd=${passEnd.toFixed(2)}`);
      return beyond;
    },
  ],
  silence: [],
  contradictions: [],
  anchor: 'ball',
  specificity: 25,
  phrase: {
    primary: 'plays through to',
    variants: ['slips through to', 'threads through to'],
  },
};
