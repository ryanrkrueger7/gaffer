// Scene K — ACT_ONE_TWO
// LB plays to CM (A→B), LB immediately advances forward, CM returns immediately (B→A).
// ACT_ONE_TWO fires on the return pass (CM→LB).
//
// Expected:
//   1. the left back plays the central midfielder
//   2. the central midfielder plays a one-two with the left back
// (LB run is SILENT — no term fires on it)
//
// Layout (team A attacks 'up'):
//   LB  (150, 420)  — left back (A), has ball
//   CM  (250, 280)  — central midfielder (B)
//
// Timeline:
//   t=0.0 d=0.5: LB→CM pass (A→B)
//   t=0.5 d=0.6: LB run (150,420)→(160,340)  ← LB advances after playing
//   t=0.5 d=0.4: CM→LB return pass (B→A, immediate)
//
// Geometry note: CM at y=280; LB run ends at y=340 > y=280 → endsLevelOrBeyond=false
// for OVERLAP (LB does NOT get beyond CM) → overlap does not fire. ✓

import { createEmptyDocument, makePlayer, makeBall, makePass, makeRun, makeBeat } from '../../engine/factory';
import { narrate } from '../narrate';
import { printResult } from './_helpers';

export function run(): void {
  const beat = makeBeat({ order: 0 });
  const doc = createEmptyDocument({ name: 'Scene K — one-two' });
  doc.beats.push(beat);
  doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

  const lb   = makePlayer({ team: 'A', initial: { x: 150, y: 420 }, display: { positionId: 'LB' } });
  const cm   = makePlayer({ team: 'A', initial: { x: 250, y: 280 }, display: { positionId: 'CM' } });
  const ball = makeBall({ initial: { x: 150, y: 420 } });

  doc.entities.push(lb, cm, ball);

  const p1    = makePass({ entityId: lb.id, beatId: beat.id, target: { entityId: cm.id }, start: 0.0, duration: 0.5 });
  const lbRun = makeRun({ entityId: lb.id, beatId: beat.id, destination: { x: 160, y: 340 }, start: 0.5, duration: 0.6 });
  const p2    = makePass({ entityId: cm.id, beatId: beat.id, target: { entityId: lb.id }, start: 0.5, duration: 0.4 });

  doc.actions.push(p1, lbRun, p2);

  printResult('Scene K — one-two (ACT_ONE_TWO)', narrate(doc, { register: 'name', debug: true }));
}
