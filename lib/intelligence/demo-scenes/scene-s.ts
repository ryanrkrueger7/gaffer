// Scene S — FIX 2 falsification: CB retreats while pass travels toward their side
//
// A center-back drops deep (retreating AWAY from play) while an attacking midfielder
// plays a forward pass that travels toward the CB's area. Under the OLD mutual-distance
// measure the gap closes (ball travels 280px toward CB), causing a false-positive
// "checks to the ball". Under the NEW playerMotionTowardBall measure, the CB's own
// displacement (-70px in the ball direction) is negative → 'opening' → correctly silent.
//
// Expected:
//   (CB run: SILENT — playerMotionTowardBall='opening')
//   AM→CB pass appears as a plain delivery (no check clause)
//
// Layout (team A attacks 'up', goal at y=10):
//   AM  (400, 200)  — attacking mid, has ball
//   CB  (400, 480)  — center-back, retreating deeper
//
// Timeline:
//   t=0.0 d=1.0: CB run (400,480)→(400,550)  ← retreating away from AM/ball
//   t=0.5 d=1.0: AM→CB pass                  ← ball travels toward CB's side

import { createEmptyDocument, makePlayer, makeBall, makePass, makeRun, makeBeat } from '../../engine/factory';
import { narrate } from '../narrate';
import { printResult } from './_helpers';

export function run(): void {
  const beat = makeBeat({ order: 0 });
  const doc  = createEmptyDocument({ name: 'Scene S — CB retreats, pass travels toward them (check must NOT fire)' });
  doc.beats.push(beat);
  doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

  const am   = makePlayer({ team: 'A', initial: { x: 400, y: 200 }, display: { positionId: 'AM' } });
  const cb   = makePlayer({ team: 'A', initial: { x: 400, y: 480 }, display: { positionId: 'CB' } });
  const ball = makeBall({ initial: { x: 400, y: 200 } });

  doc.entities.push(am, cb, ball);

  const cbRun = makeRun({ entityId: cb.id, beatId: beat.id, destination: { x: 400, y: 550 }, start: 0.0, duration: 1.0 });
  const p1    = makePass({ entityId: am.id, beatId: beat.id, target: { entityId: cb.id }, start: 0.5, duration: 1.0 });

  doc.actions.push(cbRun, p1);

  printResult(
    'Scene S — CB retreats, pass toward them (CHECK must NOT fire)',
    narrate(doc, { register: 'name', debug: true }),
  );
}
