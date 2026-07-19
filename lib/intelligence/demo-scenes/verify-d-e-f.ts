// Verify (d) — pass-and-go: wide carrier, OVERLAP SILENT  [re-labeled: coach ruling]
// LB runs from behind LM while LM has the ball. LB is 1+ channel away from LM
// at level-crossing (lateralDist=138px > OVERLAP_LATERAL_GAP_PX=130). Coach ruling:
// a runner rounding a carrier 1–2 channels away is NOT an overlap — this is a
// fullback providing width. Overlap must NOT fire. See Scene R for the intended
// tight-geometry pass-and-go test.
//
// Expected:
//   1. the left back plays the left midfielder
//   2. the left midfielder plays through to the left back   (ACT_THROUGH_BALL)
//   LB run: SILENT (lateralDist 138px > 130px gap threshold)
//
// Layout (team A attacks 'up'):
//   LB  (150, 400)  — left back, starts with ball
//   LM  (250, 280)  — left midfielder
//
// Timeline:
//   t=0.0 d=0.8: LB→LM pass
//   t=0.3 d=1.2: LB run (150,400)→(80,180)  ← 138px from LM at t* → SILENT
//   t=1.0 d=0.8: LM→LB pass
//
// ─────────────────────────────────────────────────────────────────────────────
// Verify (e) — run-meets-pass: very wide, OVERLAP SILENT  [re-labeled: coach ruling]
// LB is >2 channels from CM at level-crossing (lateralDist=218px). Not an overlap.
//
// Expected:
//   1. the left back plays the central midfielder
//   2. the central midfielder plays through to the left back  (ACT_THROUGH_BALL)
//   LB run: SILENT (lateralDist 218px > 130px gap threshold)
//
// Layout (team A attacks 'up'):
//   LB  (150, 400)  — left back, starts with ball
//   CM  (350, 350)  — central midfielder
//
// Timeline:
//   t=0.0 d=0.8: LB→CM pass
//   t=1.0 d=1.0: LB run (150,400)→(80,200)   ← 218px from CM at t* → SILENT
//   t=1.0 d=1.0: CM→LB pass concurrent with run
//
// ─────────────────────────────────────────────────────────────────────────────
// Verify (f) — run chaining: very wide, OVERLAP SILENT  [re-labeled: coach ruling]
// LB runs >2 channels from CM at level-crossing (lateralDist=251px). Not an overlap.
//
// Expected:
//   1. the left back plays the left midfielder
//   2. the left midfielder lays it off to the central midfielder
//   3. the central midfielder plays through to the left back  (ACT_THROUGH_BALL)
//   LB run: SILENT (lateralDist 251px > 130px gap threshold)
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

    printResult('Verify (d) — pass-and-go: wide carrier (OVERLAP must NOT fire)', narrate(doc, { register: 'name', debug: true }));
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

    printResult('Verify (e) — run-meets-pass: very wide (OVERLAP must NOT fire)', narrate(doc, { register: 'name', debug: true }));
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

    printResult('Verify (f) — run chaining: very wide (OVERLAP must NOT fire)', narrate(doc, { register: 'name', debug: true }));
  }
}
