// Scene M — ACT_THROUGH_BALL + MOV_RUN_IN_BEHIND (composed)
// ST runs in behind while CM plays a through ball into that run.
// Both terms fire and are composed in narrate.ts.
//
// Expected:
//   1. the striker runs in behind
//   2. the central midfielder plays the striker through
//
// Layout (team A attacks 'up'):
//   CM  (400, 320)  — central midfielder, has ball
//   ST  (400, 200)  — striker, makes run in behind
//
// Timeline:
//   t=0.0 d=1.0: ST run (400,200)→(380,60)  ← toward goal, into box
//   t=0.5 d=0.8: CM→ST pass (forward, into active run)

import { createEmptyDocument, makePlayer, makeBall, makePass, makeRun, makeBeat } from '../../engine/factory';
import { narrate } from '../narrate';
import { printResult } from './_helpers';

export function run(): void {
  const beat = makeBeat({ order: 0 });
  const doc = createEmptyDocument({ name: 'Scene M — through ball (composed)' });
  doc.beats.push(beat);
  doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

  const cm   = makePlayer({ team: 'A', initial: { x: 400, y: 320 }, display: { positionId: 'CM' } });
  const st   = makePlayer({ team: 'A', initial: { x: 400, y: 200 }, display: { positionId: 'ST' } });
  const ball = makeBall({ initial: { x: 400, y: 320 } });

  doc.entities.push(cm, st, ball);

  const stRun = makeRun({ entityId: st.id, beatId: beat.id, destination: { x: 380, y: 60 }, start: 0.0, duration: 1.0 });
  const p1    = makePass({ entityId: cm.id, beatId: beat.id, target: { entityId: st.id }, start: 0.5, duration: 0.8 });

  doc.actions.push(stRun, p1);

  printResult('Scene M — through ball + run in behind (composed)', narrate(doc, { register: 'name', debug: true }));
}
