// Verify (b) — CM long-ball layoff
// CM plays forward to ST (back to goal); ST lays off to checking AM; LW runs in behind.
//
// Expected:
//   1. the left winger runs in behind
//   2. the attacking midfielder makes a third-man run
//   3. the central midfielder plays the striker
//   4. the attacking midfielder receives the layoff from the striker
//
// Layout (team A attacks 'up', goal at y=10):
//   CM  (400, 380)  — central mid, has ball
//   ST  (400, 200)  — striker, back to goal
//   AM  (250, 300)  — attacking mid, makes closing run toward ST
//   LW  (150, 155)  — left winger, runs in behind into box
//
// Timeline:
//   t=0.0 d=0.8: LW run (150,155)→(300,60)
//   t=0.5 d=0.6: CM→ST pass
//   t=0.8 d=0.7: AM run (250,300)→(280,320)
//   t=1.1 d=0.8: ST→AM backward layoff
//
// ─────────────────────────────────────────────────────────────────────────────
// Verify (c) — routine repositioning run → SILENCE
// A center-back shifts laterally while CM has the ball.
// No signature fires on the CD run.
//
// Expected: only the CM→RB pass clause; no CD clause.
//
// Layout (team A attacks 'up'):
//   CM  (400, 300)  — has ball
//   CD  (500, 450)  — shifts left: (500,450)→(300,450)
//   RB  (650, 420)

import { createEmptyDocument, makePlayer, makeBall, makePass, makeRun, makeBeat } from '../../engine/factory';
import { narrate } from '../narrate';
import { printResult } from './_helpers';

export function run(): void {
  // ── Verify (b) ─────────────────────────────────────────────────────────────
  {
    const beat = makeBeat({ order: 0 });
    const doc = createEmptyDocument({ name: 'Verify (b) — CM long-ball layoff' });
    doc.beats.push(beat);
    doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

    const cm   = makePlayer({ team: 'A', initial: { x: 400, y: 380 }, display: { positionId: 'CM'  } });
    const st   = makePlayer({ team: 'A', initial: { x: 400, y: 200 }, display: { positionId: 'ST'  } });
    const am   = makePlayer({ team: 'A', initial: { x: 250, y: 300 }, display: { positionId: 'CAM' } });
    const lw   = makePlayer({ team: 'A', initial: { x: 150, y: 155 }, display: { positionId: 'LW'  } });
    const ball = makeBall({ initial: { x: 400, y: 380 } });

    doc.entities.push(cm, st, am, lw, ball);

    const lwRun = makeRun({ entityId: lw.id, beatId: beat.id, destination: { x: 300, y: 60  }, start: 0.0, duration: 0.8 });
    const amRun = makeRun({ entityId: am.id, beatId: beat.id, destination: { x: 280, y: 320 }, start: 0.8, duration: 0.7 });
    const p1    = makePass({ entityId: cm.id, beatId: beat.id, target: { entityId: st.id }, start: 0.5, duration: 0.6 });
    const p2    = makePass({ entityId: st.id, beatId: beat.id, target: { entityId: am.id }, start: 1.1, duration: 0.8 });

    doc.actions.push(lwRun, amRun, p1, p2);

    printResult('Verify (b) — CM long-ball layoff', narrate(doc, { register: 'name' }));
  }

  // ── Verify (c) ─────────────────────────────────────────────────────────────
  {
    const beat = makeBeat({ order: 0 });
    const doc = createEmptyDocument({ name: 'Verify (c) — routine repositioning' });
    doc.beats.push(beat);
    doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

    const cm   = makePlayer({ team: 'A', initial: { x: 400, y: 300 }, display: { positionId: 'CM' } });
    const cd   = makePlayer({ team: 'A', initial: { x: 500, y: 450 }, display: { positionId: 'CB' } });
    const rb   = makePlayer({ team: 'A', initial: { x: 650, y: 420 }, display: { positionId: 'RB' } });
    const ball = makeBall({ initial: { x: 400, y: 300 } });

    doc.entities.push(cm, cd, rb, ball);

    const cdRun = makeRun({ entityId: cd.id, beatId: beat.id, destination: { x: 300, y: 450 }, start: 0.0, duration: 1.0 });
    const p1    = makePass({ entityId: cm.id, beatId: beat.id, target: { entityId: rb.id }, start: 0.5, duration: 0.8 });

    doc.actions.push(cdRun, p1);

    printResult('Verify (c) — routine repositioning (CD run should be SILENT)', narrate(doc, { register: 'name' }));
  }
}
