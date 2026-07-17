// Scene B — the coach's overlap (+ Verify a: same geometry)
//
// LB has ball; LM drops in (run away from goal); LB→LM pass; LB runs outside
// path around LM, ending beyond; LM→LB pass into the run.
//
// Expected:
//   1. the left midfielder drops in
//   2. the left back plays the left midfielder   (drop-in skips lifecycle)
//   3. the left back overlaps
//   4. the left back receives from the left midfielder
//
// Layout (team A attacks 'up', goal at y=10):
//   LB  (150, 400)  — left back, has ball initially
//   LM  (250, 280)  — left midfielder
//
// Timeline:
//   t=0.0 d=0.8: LM run (250,280)→(250,360)  ← drops back
//   t=0.8 d=0.8: LB→LM pass
//   t=1.6 d=1.0: LB run (150,400)→(80,200)   ← overlapping run
//   t=2.0 d=0.8: LM→LB pass

import { createEmptyDocument, makePlayer, makeBall, makePass, makeRun, makeBeat } from '../../engine/factory';
import { narrate } from '../narrate';
import { printResult } from './_helpers';

function buildDoc(name: string) {
  const beat = makeBeat({ order: 0 });
  const doc = createEmptyDocument({ name });
  doc.beats.push(beat);
  doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

  const lb   = makePlayer({ team: 'A', initial: { x: 150, y: 400 }, display: { positionId: 'LB' } });
  const lm   = makePlayer({ team: 'A', initial: { x: 250, y: 280 }, display: { positionId: 'LM' } });
  const ball = makeBall({ initial: { x: 150, y: 400 } });

  doc.entities.push(lb, lm, ball);

  const lmRun = makeRun({ entityId: lm.id, beatId: beat.id, destination: { x: 250, y: 360 }, start: 0.0, duration: 0.8 });
  const p1    = makePass({ entityId: lb.id, beatId: beat.id, target: { entityId: lm.id }, start: 0.8, duration: 0.8 });
  const lbRun = makeRun({ entityId: lb.id, beatId: beat.id, destination: { x: 80,  y: 200 }, start: 1.6, duration: 1.0 });
  const p2    = makePass({ entityId: lm.id, beatId: beat.id, target: { entityId: lb.id }, start: 2.0, duration: 0.8 });

  doc.actions.push(lmRun, p1, lbRun, p2);
  return doc;
}

export function run(): void {
  printResult('Scene B — the overlap', narrate(buildDoc('Scene B — the overlap'), { register: 'name' }));
  printResult('Verify (a) — coach overlap', narrate(buildDoc('Verify (a) — coach overlap'), { register: 'name' }));
}
