// Scene A — check + layoff
// CB→LB pass; LM runs closing (check); LB→LM pass; CM runs closing underneath;
// LM→CM backward pass (layoff).
//
// Expected:
//   1. [check-to-ball or third-man clause for LM]
//   2. [third-man clause for CM if CM's run overlaps CB→LB in-flight]
//   3. the left back plays the left midfielder   (CB→LB then LB→LM)
//   ... wait — see actual expected in demo comments
//
// Expect: check-to-ball clause for LM, third-man-run clause for CM
//         (LB→LM pass is in-flight at CM run start t=0.9, so CM fires MOV_THIRD_MAN_RUN
//         specificity 15 rather than MOV_CHECK_TO_BALL specificity 10),
//         layoff phrase on the LM→CM clause.
//
// Layout (team A attacks 'up', goal at y=10):
//   CB  (400, 490)
//   LB  (150, 380)
//   LM  (250, 280)  — will check back toward ball
//   CM  (400, 390)  — will check underneath
//
// Timeline:
//   t=0.0 d=0.8: CB→LB pass
//   t=0.2 d=1.0: LM run from (250,280) to (250,300)
//   t=0.8 d=0.8: LB→LM pass
//   t=0.9 d=0.8: CM run from (400,390) to (260,340)
//   t=1.6 d=0.8: LM→CM backward pass

import { createEmptyDocument, makePlayer, makeBall, makePass, makeRun, makeBeat } from '../../engine/factory';
import { narrate } from '../narrate';
import { printResult } from './_helpers';

export function run(): void {
  const beat = makeBeat({ order: 0 });
  const doc = createEmptyDocument({ name: 'Scene A — check + layoff' });
  doc.beats.push(beat);
  doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

  const cb   = makePlayer({ team: 'A', initial: { x: 400, y: 490 }, display: { positionId: 'CB' } });
  const lb   = makePlayer({ team: 'A', initial: { x: 150, y: 380 }, display: { positionId: 'LB' } });
  const lm   = makePlayer({ team: 'A', initial: { x: 250, y: 280 }, display: { positionId: 'LM' } });
  const cm   = makePlayer({ team: 'A', initial: { x: 400, y: 390 }, display: { positionId: 'CM' } });
  const ball = makeBall({ initial: { x: 400, y: 490 } });

  doc.entities.push(cb, lb, lm, cm, ball);

  const p1    = makePass({ entityId: cb.id,  beatId: beat.id, target: { entityId: lb.id  }, start: 0.0, duration: 0.8 });
  const lmRun = makeRun({ entityId: lm.id,  beatId: beat.id, destination: { x: 250, y: 300 }, start: 0.2, duration: 1.0 });
  const p2    = makePass({ entityId: lb.id,  beatId: beat.id, target: { entityId: lm.id  }, start: 0.8, duration: 0.8 });
  const cmRun = makeRun({ entityId: cm.id,  beatId: beat.id, destination: { x: 260, y: 340 }, start: 0.9, duration: 0.8 });
  const p3    = makePass({ entityId: lm.id,  beatId: beat.id, target: { entityId: cm.id  }, start: 1.6, duration: 0.8 });

  doc.actions.push(p1, lmRun, p2, cmRun, p3);

  printResult('Scene A — check + layoff', narrate(doc, { register: 'name' }));
}
