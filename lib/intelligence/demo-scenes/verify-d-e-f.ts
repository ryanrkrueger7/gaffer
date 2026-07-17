// Verify (d) — pass-and-go overlap  [FIX 1]
// LB plays to LM then immediately starts an overlapping run while the ball is
// still in flight. LM receives and plays back into LB's run.
//
// Expected:
//   1. the left back plays the left midfielder
//   2. the left back overlaps
//   3. the left back receives from the left midfielder
//
// Layout (team A attacks 'up'):
//   LB  (150, 400)  — left back, starts with ball
//   LM  (250, 280)  — left midfielder
//
// Timeline:
//   t=0.0 d=0.8: LB→LM pass
//   t=0.3 d=1.2: LB overlap run (150,400)→(80,180)  ← starts during ball flight
//   t=1.0 d=0.8: LM→LB pass
//
// ─────────────────────────────────────────────────────────────────────────────
// Verify (e) — run-meets-pass overlap  [FIX 2]
// LB passes to CM; CM holds; CM→LB pass concurrent with LB's run (ball in-flight
// for entire run window). resolveOwnerAtT returns null; in-flight-passer finds CM.
//
// Expected:
//   1. the left back plays the central midfielder
//   2. the left back overlaps
//   3. the left back receives from the central midfielder
//
// Layout (team A attacks 'up'):
//   LB  (150, 400)  — left back, starts with ball
//   CM  (350, 350)  — central midfielder
//
// Timeline:
//   t=0.0 d=0.8: LB→CM pass
//   t=1.0 d=1.0: LB overlap run (150,400)→(80,200)
//   t=1.0 d=1.0: CM→LB pass concurrent with run
//
// ─────────────────────────────────────────────────────────────────────────────
// Verify (f) — run chaining (extension run)
// LB→LM pass; LM bounces to CM; LB overlap run R1 (unresolved); LB second run R2
// (extension of R1); CM→LB pass meeting R2.
//
// Expected:
//   1. the left back plays the left midfielder
//   2. the left midfielder lays it off to the central midfielder
//   3. the left back overlaps
//   4. the left back receives from the central midfielder
//
// Layout (team A attacks 'up'):
//   LB  (150, 400)
//   LM  (250, 300)
//   CM  (350, 290)

import { createEmptyDocument, makePlayer, makeBall, makePass, makeRun, makeBeat } from '../../engine/factory';
import { narrate } from '../narrate';
import { printResult } from './_helpers';

export function run(): void {
  // ── Verify (d) ─────────────────────────────────────────────────────────────
  {
    const beat = makeBeat({ order: 0 });
    const doc = createEmptyDocument({ name: 'Verify (d) — pass-and-go overlap' });
    doc.beats.push(beat);
    doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

    const lb   = makePlayer({ team: 'A', initial: { x: 150, y: 400 }, display: { positionId: 'LB' } });
    const lm   = makePlayer({ team: 'A', initial: { x: 250, y: 280 }, display: { positionId: 'LM' } });
    const ball = makeBall({ initial: { x: 150, y: 400 } });

    doc.entities.push(lb, lm, ball);

    const p1    = makePass({ entityId: lb.id, beatId: beat.id, target: { entityId: lm.id }, start: 0.0, duration: 0.8 });
    const lbRun = makeRun({ entityId: lb.id, beatId: beat.id, destination: { x: 80, y: 180 }, start: 0.3, duration: 1.2 });
    const p2    = makePass({ entityId: lm.id, beatId: beat.id, target: { entityId: lb.id }, start: 1.0, duration: 0.8 });

    doc.actions.push(p1, lbRun, p2);

    printResult('Verify (d) — pass-and-go overlap (FIX 1)', narrate(doc, { register: 'name', debug: true }));
  }

  // ── Verify (e) ─────────────────────────────────────────────────────────────
  {
    const beat = makeBeat({ order: 0 });
    const doc = createEmptyDocument({ name: 'Verify (e) — run-meets-pass overlap' });
    doc.beats.push(beat);
    doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

    const lb   = makePlayer({ team: 'A', initial: { x: 150, y: 400 }, display: { positionId: 'LB' } });
    const cm   = makePlayer({ team: 'A', initial: { x: 350, y: 350 }, display: { positionId: 'CM' } });
    const ball = makeBall({ initial: { x: 150, y: 400 } });

    doc.entities.push(lb, cm, ball);

    const p1    = makePass({ entityId: lb.id, beatId: beat.id, target: { entityId: cm.id }, start: 0.0, duration: 0.8 });
    const lbRun = makeRun({ entityId: lb.id, beatId: beat.id, destination: { x: 80, y: 200 }, start: 1.0, duration: 1.0 });
    const p2    = makePass({ entityId: cm.id, beatId: beat.id, target: { entityId: lb.id }, start: 1.0, duration: 1.0 });

    doc.actions.push(p1, lbRun, p2);

    printResult('Verify (e) — run-meets-pass overlap (FIX 2)', narrate(doc, { register: 'name', debug: true }));
  }

  // ── Verify (f) ─────────────────────────────────────────────────────────────
  {
    const beat = makeBeat({ order: 0 });
    const doc = createEmptyDocument({ name: 'Verify (f) — run chaining (extension run)' });
    doc.beats.push(beat);
    doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

    const lb   = makePlayer({ team: 'A', initial: { x: 150, y: 400 }, display: { positionId: 'LB' } });
    const lm   = makePlayer({ team: 'A', initial: { x: 250, y: 300 }, display: { positionId: 'LM' } });
    const cm   = makePlayer({ team: 'A', initial: { x: 350, y: 290 }, display: { positionId: 'CM' } });
    const ball = makeBall({ initial: { x: 150, y: 400 } });

    doc.entities.push(lb, lm, cm, ball);

    const p1   = makePass({ entityId: lb.id, beatId: beat.id, target: { entityId: lm.id }, start: 0.0, duration: 0.8 });
    const p2   = makePass({ entityId: lm.id, beatId: beat.id, target: { entityId: cm.id }, start: 0.8, duration: 0.8 });
    const lbR1 = makeRun({ entityId: lb.id, beatId: beat.id, destination: { x: 80, y: 250 }, start: 1.6, duration: 1.0 });
    const lbR2 = makeRun({ entityId: lb.id, beatId: beat.id, destination: { x: 80, y: 100 }, start: 2.7, duration: 0.8 });
    const p3   = makePass({ entityId: cm.id, beatId: beat.id, target: { entityId: lb.id }, start: 2.7, duration: 0.8 });

    doc.actions.push(p1, p2, lbR1, lbR2, p3);

    printResult('Verify (f) — run chaining (FIX)', narrate(doc, { register: 'name', debug: true }));
  }
}
