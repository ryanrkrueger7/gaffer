// Scene Q — Coach Scenario 2 (false positive: inside run between carrier and CM)
// LM carries up the wide left. AM runs forward from the inside channel — between
// LM and CM laterally. AM is on the INTERIOR side of LM (pathSide='inside').
// OVERLAP must NOT fire (result: underlap or no annotation).
//
// The old minDist gate allowed this risk: at level-crossing (t*≈2.0s), AM and LM
// are ~100px apart, below the 250px threshold. Trigger (d) already catches it via
// pathSide='inside', but the level-crossing gate provides a second backstop:
// isOutside=false at t* (AM is to the right of LM, on the interior side).
//
// Expected:
//   LM carries forward
//   AM underlaps  (pathSide='inside'; level-crossing gate: !isOutside=true ✓)
//   LM plays AM
//
// Layout (team A attacks 'up'):
//   LM  (80,  380)  — left midfielder, has ball, wide left
//   CM  (270, 330)  — central midfielder (context only)
//   AM  (185, 430)  — attacking midfielder, between LM and CM laterally
//
// Timeline:
//   t=0.0 d=2.0: LM carry (80,380)→(80,200)    ← LM carries up the wing
//   t=0.0 d=2.0: AM run   (185,430)→(180,200)  ← inside run (pathSide='inside')
//   t=2.0 d=0.3: LM→AM pass                    ← delivery

import { createEmptyDocument, makePlayer, makeBall, makePass, makeRun, makeCarry, makeBeat } from '../../engine/factory';
import { narrate } from '../narrate';
import { printResult } from './_helpers';

export function run(): void {
  const beat = makeBeat({ order: 0 });
  const doc  = createEmptyDocument({ name: 'Scene Q — false positive: inside run (overlap must NOT fire)' });
  doc.beats.push(beat);
  doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

  const lm   = makePlayer({ team: 'A', initial: { x: 80,  y: 380 }, display: { positionId: 'LM' } });
  const cm   = makePlayer({ team: 'A', initial: { x: 270, y: 330 }, display: { positionId: 'CM' } });
  const am   = makePlayer({ team: 'A', initial: { x: 185, y: 430 }, display: { positionId: 'AM' } });
  const ball = makeBall({ initial: { x: 80, y: 380 } });

  doc.entities.push(lm, cm, am, ball);

  const carry = makeCarry({ entityId: lm.id, beatId: beat.id, destination: { x: 80,  y: 200 }, start: 0.0, duration: 2.0 });
  const amRun = makeRun({ entityId: am.id, beatId: beat.id, destination: { x: 180, y: 200 }, start: 0.0, duration: 2.0 });
  const p     = makePass({ entityId: lm.id, beatId: beat.id, target: { entityId: am.id }, start: 2.0, duration: 0.3 });

  doc.actions.push(carry, amRun, p);

  printResult(
    'Scene Q — Coach Scenario 2: inside run between LM and CM (OVERLAP must NOT fire)',
    narrate(doc, { register: 'name', debug: true }),
  );
}
