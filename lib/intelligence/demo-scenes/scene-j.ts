// Scene J — MOV_THIRD_MAN_RUN
// CB→LM pass (A→B) is in flight while AM (P = third man) starts a run.
// AM is neither A nor B. LM then delivers to AM (B→P).
//
// Expected:
//   1. the center back plays the left midfielder
//   2. the attacking midfielder makes a third-man run
//   3. the attacking midfielder receives from the left midfielder
//
// Layout (team A attacks 'up'):
//   CB  (400, 490)  — center back (A), has ball
//   LM  (150, 360)  — left midfielder (B)
//   AM  (300, 280)  — attacking midfielder (P), the third man
//
// Timeline:
//   t=0.0 d=0.8: CB→LM pass (A→B, in-flight [0.0, 0.8])
//   t=0.2 d=1.0: AM run (300,280)→(250,160)  ← starts during CB→LM in-flight
//   t=0.8 d=0.6: LM→AM pass (B→P)

import { createEmptyDocument, makePlayer, makeBall, makePass, makeRun, makeBeat } from '../../engine/factory';
import { narrate } from '../narrate';
import { printResult } from './_helpers';

export function run(): void {
  const beat = makeBeat({ order: 0 });
  const doc = createEmptyDocument({ name: 'Scene J — third-man run' });
  doc.beats.push(beat);
  doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

  const cb   = makePlayer({ team: 'A', initial: { x: 400, y: 490 }, display: { positionId: 'CB'  } });
  const lm   = makePlayer({ team: 'A', initial: { x: 150, y: 360 }, display: { positionId: 'LM'  } });
  const am   = makePlayer({ team: 'A', initial: { x: 300, y: 280 }, display: { positionId: 'CAM' } });
  const ball = makeBall({ initial: { x: 400, y: 490 } });

  doc.entities.push(cb, lm, am, ball);

  const p1    = makePass({ entityId: cb.id, beatId: beat.id, target: { entityId: lm.id }, start: 0.0, duration: 0.8 });
  const amRun = makeRun({ entityId: am.id, beatId: beat.id, destination: { x: 250, y: 160 }, start: 0.2, duration: 1.0 });
  const p2    = makePass({ entityId: lm.id, beatId: beat.id, target: { entityId: am.id }, start: 0.8, duration: 0.6 });

  doc.actions.push(p1, amRun, p2);

  printResult('Scene J — third-man run (MOV_THIRD_MAN_RUN)', narrate(doc, { register: 'name', debug: true }));
}
