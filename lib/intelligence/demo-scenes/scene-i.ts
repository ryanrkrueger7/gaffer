// Scene I — MOV_UNDERLAP
// LM starts behind CM and makes a run to the central/inside side of CM,
// ending level or beyond. pathSide='inside'.
//
// Expected:
//   1. the center back plays the central midfielder
//   2. the left midfielder underlaps
//   3. the left midfielder receives from the central midfielder
//
// Layout (team A attacks 'up'):
//   CB  (400, 490)
//   CM  (200, 350)  — left of center (nearerTouchline=x=10)
//   LM  (250, 420)  — right of CM (central side = inside)
//
// Timeline:
//   t=0.0 d=0.8: CB→CM pass
//   t=0.8 d=1.0: LM run (250,420)→(280,200) concurrent with CM→LM pass

import { createEmptyDocument, makePlayer, makeBall, makePass, makeRun, makeBeat } from '../../engine/factory';
import { narrate } from '../narrate';
import { printResult } from './_helpers';

export function run(): void {
  const beat = makeBeat({ order: 0 });
  const doc = createEmptyDocument({ name: 'Scene I — underlap' });
  doc.beats.push(beat);
  doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

  const cb   = makePlayer({ team: 'A', initial: { x: 400, y: 490 }, display: { positionId: 'CB' } });
  const cm   = makePlayer({ team: 'A', initial: { x: 200, y: 350 }, display: { positionId: 'CM' } });
  const lm   = makePlayer({ team: 'A', initial: { x: 250, y: 420 }, display: { positionId: 'LM' } });
  const ball = makeBall({ initial: { x: 400, y: 490 } });

  doc.entities.push(cb, cm, lm, ball);

  const p1    = makePass({ entityId: cb.id, beatId: beat.id, target: { entityId: cm.id }, start: 0.0, duration: 0.8 });
  const lmRun = makeRun({ entityId: lm.id, beatId: beat.id, destination: { x: 280, y: 200 }, start: 0.8, duration: 1.0 });
  const p2    = makePass({ entityId: cm.id, beatId: beat.id, target: { entityId: lm.id }, start: 0.8, duration: 1.0 });

  doc.actions.push(p1, lmRun, p2);

  printResult('Scene I — underlap (MOV_UNDERLAP)', narrate(doc, { register: 'name', debug: true }));
}
