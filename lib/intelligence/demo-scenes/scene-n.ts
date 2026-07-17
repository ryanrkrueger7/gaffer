// Scene N — MOV_DROP_IN
// ST (forward line) drops away from goal into midfield space while CM has the ball.
//
// Expected:
//   1. the striker drops in
//   2. the central midfielder plays the striker
//
// Layout (team A attacks 'up'):
//   CM  (400, 320)  — central midfielder, has ball
//   ST  (400, 180)  — striker, drops back
//
// Timeline:
//   t=0.0 d=0.8: ST run (400,180)→(400,320)  ← away from goal
//   t=0.5 d=0.6: CM→ST pass

import { createEmptyDocument, makePlayer, makeBall, makePass, makeRun, makeBeat } from '../../engine/factory';
import { narrate } from '../narrate';
import { printResult } from './_helpers';

export function run(): void {
  const beat = makeBeat({ order: 0 });
  const doc = createEmptyDocument({ name: 'Scene N — drop-in' });
  doc.beats.push(beat);
  doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

  const cm   = makePlayer({ team: 'A', initial: { x: 400, y: 320 }, display: { positionId: 'CM' } });
  const st   = makePlayer({ team: 'A', initial: { x: 400, y: 180 }, display: { positionId: 'ST' } });
  const ball = makeBall({ initial: { x: 400, y: 320 } });

  doc.entities.push(cm, st, ball);

  const stRun = makeRun({ entityId: st.id, beatId: beat.id, destination: { x: 400, y: 320 }, start: 0.0, duration: 0.8 });
  const p1    = makePass({ entityId: cm.id, beatId: beat.id, target: { entityId: st.id }, start: 0.5, duration: 0.6 });

  doc.actions.push(stRun, p1);

  printResult('Scene N — drop-in (MOV_DROP_IN)', narrate(doc, { register: 'name', debug: true }));
}
