// Scene O — the coach's cross scene: one-two, carry, cross into the box, shot.
// "LM plays CM, one-two return, LM carries down the left line, ST runs into the
//  box, LM's delivery meets him, ST shoots."
//
// Expected:
//   1. the left midfielder plays the central midfielder
//   2. the central midfielder plays a one-two with the left midfielder
//   3. the left midfielder carries forward
//   4. the striker runs in behind
//   5. the striker meets the cross from the left midfielder
//   6. the striker shoots
//
// Layout (team A attacks 'up'):
//   LM  (100, 320)  — left midfielder, has ball
//   CM  (300, 220)  — central midfielder
//   ST  (400, 200)  — striker
//
// Timeline:
//   t=0.0 d=1.0: LM run (100,320)→(100,280)  ← forward during one-two (SILENT)
//   t=0.0 d=0.6: LM→CM pass (first leg)
//   t=0.6 d=0.4: CM→LM return (ACT_ONE_TWO)
//   t=1.0 d=1.5: LM carry (100,280)→(100,100)
//   t=2.0 d=1.5: ST run (400,200)→(400,60)   ← in behind (MOV_RUN_IN_BEHIND)
//   t=2.5 d=1.0: LM→ST cross (ACT_CROSS; lifecycle → "meets the cross")
//   shot after cross lands

import { createEmptyDocument, makePlayer, makeBall, makePass, makeRun, makeCarry, makeBeat } from '../../engine/factory';
import { narrate } from '../narrate';
import { printResult } from './_helpers';

export function run(): void {
  const beat = makeBeat({ order: 0 });
  const doc  = createEmptyDocument({ name: 'Scene O — cross' });
  doc.beats.push(beat);
  doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

  const lm   = makePlayer({ team: 'A', initial: { x: 100, y: 320 }, display: { positionId: 'LM'  } });
  const cm   = makePlayer({ team: 'A', initial: { x: 300, y: 220 }, display: { positionId: 'CM'  } });
  const st   = makePlayer({ team: 'A', initial: { x: 400, y: 200 }, display: { positionId: 'ST'  } });
  const ball = makeBall({ initial: { x: 100, y: 320 } });

  doc.entities.push(lm, cm, st, ball);

  const lmFwdRun = makeRun({ entityId: lm.id, beatId: beat.id, destination: { x: 100, y: 280 }, start: 0.0, duration: 1.0 });
  const p1       = makePass({ entityId: lm.id, beatId: beat.id, target: { entityId: cm.id }, start: 0.0, duration: 0.6 });
  const p2       = makePass({ entityId: cm.id, beatId: beat.id, target: { entityId: lm.id }, start: 0.6, duration: 0.4 });
  const carry    = makeCarry({ entityId: lm.id, beatId: beat.id, destination: { x: 100, y: 100 }, start: 1.0, duration: 1.5 });
  const stRun    = makeRun({ entityId: st.id, beatId: beat.id, destination: { x: 400, y: 60  }, start: 2.0, duration: 1.5 });
  const p3       = makePass({ entityId: lm.id, beatId: beat.id, target: { entityId: st.id }, start: 2.5, duration: 1.0 });

  doc.actions.push(lmFwdRun, p1, p2, carry, stRun, p3);

  const topGoal = doc.entities.find(e => e.kind === 'goal' && e.initial.y < 300);
  if (topGoal) {
    const shot = makePass({ entityId: st.id, beatId: beat.id, target: { entityId: topGoal.id }, start: 3.5, duration: 0.4 });
    doc.actions.push(shot);
  }

  printResult('Scene O — cross (ACT_CROSS)', narrate(doc, { register: 'name', debug: true }));
}
