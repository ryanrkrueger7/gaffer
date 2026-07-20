// Scene T — Phase 2 verification: early-anchored run + through ball mid-run
//
// A runner (B) starts their run early (t=0.5), well before possession reaches C
// (the through-ball passer). A layoff from A→C at t=1.4 gives C the ball.
// C then plays a through ball to B. Under the new pass-meets-run logic:
//   - startT = lastBallEventEnd = 1.4  (passer-possession clamp stands)
//   - findActiveRunForPass(B, 1.4) → Run B [0.5 – 3.5] (still active at 1.4) ✓
//   - duration = 3.5 − 1.4 = 2.1s  (ball arrives exactly when B reaches destination)
//   - ONE run; NO chaining workaround
//
// Layout (team A attacks 'up', goal at y=10):
//   A   (300, 450)  — has ball initially (deepest player)
//   C   (380, 400)  — relay / wall player (behind B)
//   B   (480, 350)  — runner, already most advanced at run.start → beyondFurthestTeammate ✓
//
// Timeline:
//   t=0.5  d=3.0 : Run B   (480,420) → (480, 80)   ← anchored early, runs toward box
//   t=0.0  d=1.0 : Carry A (300,420) → (380,380)   ← A advances toward C
//   t=1.0  d=0.4 : Pass A→C                         ← layoff; C gets ball at t=1.4
//   t=1.4  d=2.1 : Pass C→B                         ← through ball; arrives t=3.5 = run end
//
// Expected narration:
//   1. B runs in behind
//   2. C plays B through, continuing his run

import {
  createEmptyDocument, makePlayer, makeBall,
  makePass, makeRun, makeCarry, makeBeat,
} from '../../engine/factory';
import { narrate } from '../narrate';
import { printResult } from './_helpers';

export function run(): void {
  const beat = makeBeat({ order: 0 });
  const doc  = createEmptyDocument({ name: 'Scene T — Phase 2 verification: early run + through ball' });
  doc.beats.push(beat);
  doc.frame.teams = [{
    id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived',
  }];

  const a    = makePlayer({ team: 'A', initial: { x: 300, y: 450 }, display: { positionId: 'CM' } });
  const b    = makePlayer({ team: 'A', initial: { x: 480, y: 350 }, display: { positionId: 'ST' } });
  const c    = makePlayer({ team: 'A', initial: { x: 380, y: 400 }, display: { positionId: 'AM' } });
  const ball = makeBall({ initial: { x: 300, y: 450 } }); // ball with A

  doc.entities.push(a, b, c, ball);

  // Run B: anchored early — active the whole sequence including when C passes.
  const runB   = makeRun({ entityId: b.id, beatId: beat.id, destination: { x: 480, y: 80 }, start: 0.5, duration: 3.0 });
  // Ball events in sequence order.
  const carryA = makeCarry({ entityId: a.id, beatId: beat.id, destination: { x: 380, y: 410 }, start: 0.0, duration: 1.0 });
  const passAC = makePass({ entityId: a.id, beatId: beat.id, target: { entityId: c.id }, start: 1.0, duration: 0.4 });
  // Through ball: startT = lastBallEventEnd = 1.4; duration = runEnd(3.5) − 1.4 = 2.1
  const passCB = makePass({ entityId: c.id, beatId: beat.id, target: { entityId: b.id }, start: 1.4, duration: 2.1 });

  doc.actions.push(runB, carryA, passAC, passCB);

  // Print action timeline.
  console.log('\n── Scene T — action timeline ─────────────────────────────────');
  for (const act of [...doc.actions].sort((x, y) => x.start - y.start)) {
    const end  = (act.start + act.duration).toFixed(2);
    const kind = act.kind.padEnd(5);
    console.log(`  ${kind} entity=${act.entityId.slice(0, 6)} start=${act.start.toFixed(2)} end=${end}`);
  }

  printResult(
    'Scene T — early-anchored run + through ball (ONE run, no chaining)',
    narrate(doc, { register: 'name' }),
  );
}
