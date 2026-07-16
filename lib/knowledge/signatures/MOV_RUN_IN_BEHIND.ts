// MOV_RUN_IN_BEHIND — a run toward the opponent goal, beyond the furthest teammate,
// into the penalty area.
//
// Predicate translation (from dictionary row):
//   trigger (action = run):
//     (a) runVectorVsAttack is 'toward-goal' — the run is directed at the opponent goal
//     (b) beyondFurthestTeammate at run.start — runner is in front of all teammates
//         (Tier 1 proxy for "last line"; true defensive-line detection is Tier 2)
//     (c) towardBox — the run destination is inside the penalty area of the attacked end
//
//   silence: (none at Tier 1)
//
//   never-co-occurs: (none at Tier 1)
//
// Lifecycle: this term is resolved when a later pass delivers the ball to the
// runner during or after the run. The narrate.ts head references the run phrase
// at the receiving clause ("continuing his run").

import type { TermSignature } from './matcher';
import type { RunAction } from '../../engine/types';
import { runVectorVsAttack, beyondFurthestTeammate, towardBox } from '../primitives';

export const MOV_RUN_IN_BEHIND: TermSignature = {
  termId: 'mov.run_in_behind',
  actor: 'any',
  trigger: [
    // (a) run action + team has known attacking direction + runVector is toward-goal
    (ctx) => {
      if (ctx.action.kind !== 'run') return false;
      const run = ctx.action as RunAction;
      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      if (!entity || entity.kind !== 'player') return false;
      const frameTeam = ctx.frame.teams.find(t => t.id === entity.team);
      const attackDir = frameTeam?.attackingDirection;
      if (!attackDir) return false;
      const vec = runVectorVsAttack(ctx.doc, run, attackDir);
      ctx.debug?.(`runVector=${vec} attackDir=${attackDir}`);
      return vec === 'toward-goal';
    },

    // (b) runner is beyond the furthest teammate at run.start (Tier 1 last-line proxy)
    (ctx) => {
      const run = ctx.action as RunAction;
      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      const frameTeam = ctx.frame.teams.find(t => t.id === (entity as { team?: string } | undefined)?.team);
      const attackDir = frameTeam?.attackingDirection;
      if (!attackDir) return false;
      const beyond = beyondFurthestTeammate(ctx.doc, ctx.actorId, run.start, attackDir);
      ctx.debug?.(`beyondFurthestTeammate=${beyond}`);
      return beyond;
    },

    // (c) run destination is inside the attacked penalty box
    (ctx) => {
      const run = ctx.action as RunAction;
      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      const frameTeam = ctx.frame.teams.find(t => t.id === (entity as { team?: string } | undefined)?.team);
      const attackDir = frameTeam?.attackingDirection;
      if (!attackDir) return false;
      const inBox = towardBox(ctx.doc, run, attackDir);
      ctx.debug?.(`towardBox=${inBox}`);
      return inBox;
    },
  ],
  silence: [],
  contradictions: [],
  anchor: 'ball',
  specificity: 20,
  phrase: {
    primary: 'runs in behind',
    variants: ['goes in behind', 'makes a run in behind', 'runs in behind the defense'],
  },
};
