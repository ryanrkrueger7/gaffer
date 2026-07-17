// Scene L — ACT_SWITCH_PLAY
// CB plays a long diagonal pass from the left channel to the right channel.
//
// Expected:
//   1. the center back switches the play to the right back
//
// Layout (team A attacks 'up'):
//   CB  (150, 450)  — center back, has ball (left channel, fp≈0.18)
//   RB  (650, 400)  — right back (right channel, fp≈0.82)
//
// Pass geometry:
//   length: √((650-150)²+(400-450)²)≈502px ≥ 260px ✓
//   senderBand: fp≈0.18 ≤ 0.25 → 'left'
//   receiverBand: fp≈0.82 ≥ 0.75 → 'right' → crosses ✓

import { createEmptyDocument, makePlayer, makeBall, makePass, makeBeat } from '../../engine/factory';
import { narrate } from '../narrate';
import { printResult } from './_helpers';

export function run(): void {
  const beat = makeBeat({ order: 0 });
  const doc = createEmptyDocument({ name: 'Scene L — switch play' });
  doc.beats.push(beat);
  doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

  const cb   = makePlayer({ team: 'A', initial: { x: 150, y: 450 }, display: { positionId: 'CB' } });
  const rb   = makePlayer({ team: 'A', initial: { x: 650, y: 400 }, display: { positionId: 'RB' } });
  const ball = makeBall({ initial: { x: 150, y: 450 } });

  doc.entities.push(cb, rb, ball);

  const p1 = makePass({ entityId: cb.id, beatId: beat.id, target: { entityId: rb.id }, start: 0.0, duration: 1.0 });

  doc.actions.push(p1);

  printResult('Scene L — switch play (ACT_SWITCH_PLAY)', narrate(doc, { register: 'name', debug: true }));
}
