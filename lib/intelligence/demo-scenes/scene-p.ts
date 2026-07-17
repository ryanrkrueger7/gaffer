// Scene P — Coach Scenario 4 (false positive: LB wing run far from CM)
// LB carries forward, plays CM, then runs straight up the left wing while CM
// plays LW and LW delivers back to LB. The LB never passes close to CM laterally —
// a full channel separates them at level-crossing. OVERLAP must NOT fire.
//
// The old minDist proximity gate (250px) allowed this: LB and CM are ~205px apart
// at t* (when LB draws level with CM on the attack axis), which is below 250px.
// The new level-crossing gate rejects it: lateralDist > OVERLAP_LATERAL_GAP_PX.
//
// Expected:
//   (narration for LB run: SILENT — no overlap)
//   LW→LB delivery appears as a simple pass
//
// Layout (team A attacks 'up'):
//   LB  (75,  440)  — left back, has ball, wide left
//   CM  (280, 300)  — central midfielder
//   LW  (120, 240)  — left winger
//
// Timeline:
//   t=0.0 d=0.8: LB carry (75,440)→(75,360)   ← carries forward
//   t=0.8 d=0.5: LB→CM pass
//   t=1.3 d=2.0: LB run (75,360)→(75,100)     ← straight up the wing (SILENT: no overlap)
//   t=1.3 d=0.4: CM→LW pass                   ← in-flight at LB run.start → carrier=CM
//   t=1.7 d=1.6: LW→LB delivery               ← meets LB at run end t=3.3

import { createEmptyDocument, makePlayer, makeBall, makePass, makeRun, makeCarry, makeBeat } from '../../engine/factory';
import { narrate } from '../narrate';
import { printResult } from './_helpers';

export function run(): void {
  const beat = makeBeat({ order: 0 });
  const doc  = createEmptyDocument({ name: 'Scene P — false positive: LB wing run (overlap must NOT fire)' });
  doc.beats.push(beat);
  doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

  const lb   = makePlayer({ team: 'A', initial: { x: 75,  y: 440 }, display: { positionId: 'LB' } });
  const cm   = makePlayer({ team: 'A', initial: { x: 280, y: 300 }, display: { positionId: 'CM' } });
  const lw   = makePlayer({ team: 'A', initial: { x: 120, y: 240 }, display: { positionId: 'LW' } });
  const ball = makeBall({ initial: { x: 75, y: 440 } });

  doc.entities.push(lb, cm, lw, ball);

  const carry = makeCarry({ entityId: lb.id, beatId: beat.id, destination: { x: 75, y: 360 }, start: 0.0, duration: 0.8 });
  const p1    = makePass({ entityId: lb.id, beatId: beat.id, target: { entityId: cm.id }, start: 0.8, duration: 0.5 });
  const lbRun = makeRun({ entityId: lb.id, beatId: beat.id, destination: { x: 75, y: 100 }, start: 1.3, duration: 2.0 });
  const p2    = makePass({ entityId: cm.id, beatId: beat.id, target: { entityId: lw.id }, start: 1.3, duration: 0.4 });
  const p3    = makePass({ entityId: lw.id, beatId: beat.id, target: { entityId: lb.id }, start: 1.7, duration: 1.6 });

  doc.actions.push(carry, p1, lbRun, p2, p3);

  printResult(
    'Scene P — Coach Scenario 4: LB wing run (OVERLAP must NOT fire)',
    narrate(doc, { register: 'name', debug: true }),
  );
}
