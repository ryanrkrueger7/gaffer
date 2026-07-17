// Scene C — run in behind, no defenders
// ST runs toward-goal, beyond furthest teammate, toward box, while CM passes in.
//
// Expected:
//   1. the striker runs in behind
//   2. the striker receives from the central midfielder
//
// Layout (team A attacks 'up', goal at y=10):
//   CM  (400, 300)  — central mid, has ball
//   ST  (400, 160)  — striker, ahead of CM, will run into box
//
// Timeline:
//   t=0.0 d=1.0: ST run (400,160)→(400,60)  ← toward goal, into box
//   t=0.5 d=0.6: CM→ST pass

import { createEmptyDocument, makePlayer, makeBall, makePass, makeRun, makeBeat } from '../../engine/factory';
import { narrate } from '../narrate';
import { printResult } from './_helpers';

export function run(): void {
  const beat = makeBeat({ order: 0 });
  const doc = createEmptyDocument({ name: 'Scene C — run in behind' });
  doc.beats.push(beat);
  doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

  const cm   = makePlayer({ team: 'A', initial: { x: 400, y: 300 }, display: { positionId: 'CM' } });
  const st   = makePlayer({ team: 'A', initial: { x: 400, y: 160 }, display: { positionId: 'ST' } });
  const ball = makeBall({ initial: { x: 400, y: 300 } });

  doc.entities.push(cm, st, ball);

  const stRun = makeRun({ entityId: st.id, beatId: beat.id, destination: { x: 400, y: 60 }, start: 0.0, duration: 1.0 });
  const p1    = makePass({ entityId: cm.id, beatId: beat.id, target: { entityId: st.id }, start: 0.5, duration: 0.6 });

  doc.actions.push(stRun, p1);

  printResult('Scene C — run in behind', narrate(doc, { register: 'name' }));
}
