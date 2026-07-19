// Scene R — tight-geometry pass-and-go overlap  [replaces Verify (d) intent]
// LB starts inside and behind wide LM. LB passes to LM then arcs outside on a
// bezier run — physically rounding LM at close range (~33px laterally at t*).
// This is the canonical pass-and-go the original Verify (d) was meant to test,
// but now with tight geometry that satisfies the level-crossing gate.
//
// Expected:
//   1. the left back passes to the left midfielder
//   2. the left back overlaps
//   3. the left back receives from the left midfielder
//
// Layout (team A attacks 'up'):
//   LB  (200, 400)  — left back, has ball; starts inside/behind LM
//   LM  (140, 290)  — left midfielder, wide left (the carrier)
//
// Timeline:
//   t=0.0 d=0.6: LB→LM pass (concurrent with run start → in-flight-passer carrier)
//   t=0.0 d=1.5: LB bezier run (200,400)→(100,220) control=(80,300)  ← arcs outside
//   t=0.6 d=0.9: LM→LB delivery (arrives t=1.5 at LB run end)
//
// Gate values at t*≈0.88s (LB levels with LM at y=290):
//   lateralDist ≈ 33px < OVERLAP_LATERAL_GAP_PX=130 ✓
//   isOutside=true (LB.x≈108 < LM.x=140) ✓
//   bend ≈ 27° > OVERLAP_BEND_MIN_DEG=15° ✓  (bezier tangent change)

import { createEmptyDocument, makePlayer, makeBall, makePass, makeRun, makeBeat } from '../../engine/factory';
import { narrate } from '../narrate';
import { printResult } from './_helpers';

export function run(): void {
  const beat = makeBeat({ order: 0 });
  const doc  = createEmptyDocument({ name: 'Scene R — tight pass-and-go overlap (bezier)' });
  doc.beats.push(beat);
  doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

  const lb   = makePlayer({ team: 'A', initial: { x: 200, y: 400 }, display: { positionId: 'LB' } });
  const lm   = makePlayer({ team: 'A', initial: { x: 140, y: 290 }, display: { positionId: 'LM' } });
  const ball = makeBall({ initial: { x: 200, y: 400 } });

  doc.entities.push(lb, lm, ball);

  const p1    = makePass({ entityId: lb.id, beatId: beat.id, target: { entityId: lm.id }, start: 0.0, duration: 0.6 });
  const lbRun = makeRun({
    entityId: lb.id, beatId: beat.id,
    destination: { x: 100, y: 220 },
    start: 0.0, duration: 1.5,
    path: { type: 'bezier', cx: 80, cy: 300 },
  });
  const p2    = makePass({ entityId: lm.id, beatId: beat.id, target: { entityId: lb.id }, start: 0.6, duration: 0.9 });

  doc.actions.push(p1, lbRun, p2);

  printResult('Scene R — tight pass-and-go overlap (OVERLAP must fire)', narrate(doc, { register: 'name', debug: true }));
}
