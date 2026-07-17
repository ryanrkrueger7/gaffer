// Scene G — false-positive proximity gate  [FIX 3]
// LM (far left touchline) makes a forward run straight up while CM's concurrent
// pass is in-flight. All four relational predicates pass, but LM is ~306px from
// CM — nowhere near "going around" anyone.
// OVERLAP must NOT match (proximity minDist ≫ OVERLAP_PROXIMITY_PX).
//
// Expected:
//   1. the center back plays the central midfielder
//   2. the central midfielder plays through to the left midfielder   (ACT_THROUGH_BALL)
//   LM run: SILENT
//
// Layout (team A attacks 'up'):
//   CB  (400, 490)
//   CM  (350, 300)  — left of center
//   LM  (50,  400)  — far left touchline
//
// Timeline:
//   t=0.0 d=0.8: CB→CM pass
//   t=1.0 d=1.0: LM run (50,400)→(50,80)    ← straight up left touchline
//   t=1.0 d=1.0: CM→LM pass concurrent with run
//
// ─────────────────────────────────────────────────────────────────────────────
// Scene H — true-positive real overlap  [FIX 3 passes]
// LM makes a genuine around-the-outside run close to CM during CM's in-flight pass.
// OVERLAP must match; proximity minDist ≤ OVERLAP_PROXIMITY_PX.
//
// Expected:
//   1. the center back plays the central midfielder
//   2. the left midfielder overlaps
//   3. the left midfielder receives from the central midfielder
//
// Layout (team A attacks 'up'):
//   CB  (400, 490)
//   CM  (200, 350)  — the carrier
//   LM  (150, 420)  — tight to CM, real overlapper
//
// Timeline:
//   t=0.0 d=0.8: CB→CM pass
//   t=0.8 d=1.0: LM run (150,420)→(80,200) concurrent with CM→LM pass

import { createEmptyDocument, makePlayer, makeBall, makePass, makeRun, makeBeat } from '../../engine/factory';
import { narrate } from '../narrate';
import { printResult } from './_helpers';

export function run(): void {
  // ── Scene G ────────────────────────────────────────────────────────────────
  {
    const beat = makeBeat({ order: 0 });
    const doc = createEmptyDocument({ name: 'Scene G — false-positive proximity gate' });
    doc.beats.push(beat);
    doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

    const cb   = makePlayer({ team: 'A', initial: { x: 400, y: 490 }, display: { positionId: 'CB' } });
    const cm   = makePlayer({ team: 'A', initial: { x: 350, y: 300 }, display: { positionId: 'CM' } });
    const lm   = makePlayer({ team: 'A', initial: { x: 50,  y: 400 }, display: { positionId: 'LM' } });
    const ball = makeBall({ initial: { x: 400, y: 490 } });

    doc.entities.push(cb, cm, lm, ball);

    const p1    = makePass({ entityId: cb.id, beatId: beat.id, target: { entityId: cm.id }, start: 0.0, duration: 0.8 });
    const lmRun = makeRun({ entityId: lm.id, beatId: beat.id, destination: { x: 50, y: 80 }, start: 1.0, duration: 1.0 });
    const p2    = makePass({ entityId: cm.id, beatId: beat.id, target: { entityId: lm.id }, start: 1.0, duration: 1.0 });

    doc.actions.push(p1, lmRun, p2);

    printResult('Scene G — false-positive proximity (OVERLAP must NOT match)', narrate(doc, { register: 'name', debug: true }));
  }

  // ── Scene H ────────────────────────────────────────────────────────────────
  {
    const beat = makeBeat({ order: 0 });
    const doc = createEmptyDocument({ name: 'Scene H — real overlap (proximity passes)' });
    doc.beats.push(beat);
    doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

    const cb   = makePlayer({ team: 'A', initial: { x: 400, y: 490 }, display: { positionId: 'CB' } });
    const cm   = makePlayer({ team: 'A', initial: { x: 200, y: 350 }, display: { positionId: 'CM' } });
    const lm   = makePlayer({ team: 'A', initial: { x: 150, y: 420 }, display: { positionId: 'LM' } });
    const ball = makeBall({ initial: { x: 400, y: 490 } });

    doc.entities.push(cb, cm, lm, ball);

    const p1    = makePass({ entityId: cb.id, beatId: beat.id, target: { entityId: cm.id }, start: 0.0, duration: 0.8 });
    const lmRun = makeRun({ entityId: lm.id, beatId: beat.id, destination: { x: 80, y: 200 }, start: 0.8, duration: 1.0 });
    const p2    = makePass({ entityId: cm.id, beatId: beat.id, target: { entityId: lm.id }, start: 0.8, duration: 1.0 });

    doc.actions.push(p1, lmRun, p2);

    printResult('Scene H — real overlap, proximity passes (FIX 3)', narrate(doc, { register: 'name', debug: true }));
  }
}
