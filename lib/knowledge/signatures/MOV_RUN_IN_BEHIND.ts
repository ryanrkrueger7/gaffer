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
    (ctx) => {
      if (ctx.action.kind !== 'run') return false;
      const run = ctx.action as RunAction;

      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      if (!entity || entity.kind !== 'player') return false;
      const frameTeam = ctx.frame.teams.find(t => t.id === entity.team);
      const attackDir = frameTeam?.attackingDirection;
      if (!attackDir) return false;

      // (a) Run vector is toward goal
      if (runVectorVsAttack(ctx.doc, run, attackDir) !== 'toward-goal') return false;

      // (b) Runner is beyond furthest teammate (Tier 1 last-line proxy)
      if (!beyondFurthestTeammate(ctx.doc, ctx.actorId, run.start, attackDir)) return false;

      // (c) Run destination is in the box
      if (!towardBox(ctx.doc, run, attackDir)) return false;

      return true;
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
