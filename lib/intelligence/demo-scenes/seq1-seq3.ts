// Sequences 1–3: original narration demo.
//
// ── Sequence 1: 4-pass 'name' register ──────────────────────────────────────
//   RCB(490)→CDM(370)→LW(350)→CDM(540)→ST(130), team A attacks 'up'
//   Expected ('name'):
//     1. the right center back plays the defensive midfielder
//     2. the defensive midfielder lays it off to the left winger
//     3. the left winger plays the defensive midfielder
//     4. the defensive midfielder plays the striker
//
// ── Sequence 2: 5-pass two-CM disambiguation ────────────────────────────────
//   CB(490)→LCM(370, x=300)→LM(350)→RCM(370, x=500)→RM(200)→ST(130)
//   Expected:
//     1. the center back plays the left-sided central midfielder
//     2. the left-sided central midfielder lays it off to the left midfielder
//     3. the left midfielder plays the right-sided central midfielder
//     4. the right-sided central midfielder lays it off to the right midfielder
//     5. the right midfielder turns and plays the striker
//
// ── Sequence 3: carry + cross + shot (Scope A + B) ──────────────────────────
//   LW carries forward, crosses to ST, ST shoots at goal.
//   Expected:
//     1. the left winger carries forward
//     2. the left winger plays the striker
//     3. the striker shoots

import { createEmptyDocument, makePlayer, makeBall, makePass, makeRun, makeCarry, makeBeat } from '../../engine/factory';
import { narrate } from '../narrate';
import { printResult } from './_helpers';

export function run(): void {
  // ── Sequence 1 ─────────────────────────────────────────────────────────────
  {
    const beat = makeBeat({ order: 0 });
    const doc  = createEmptyDocument({ name: 'Seq1 4-pass name register' });
    doc.beats.push(beat);
    doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

    const rcb  = makePlayer({ team: 'A', initial: { x: 400, y: 490 }, display: { positionId: 'RCB' } });
    const cdm  = makePlayer({ team: 'A', initial: { x: 400, y: 370 }, display: { positionId: 'CDM' } });
    const lw   = makePlayer({ team: 'A', initial: { x: 100, y: 350 }, display: { positionId: 'LW'  } });
    const st   = makePlayer({ team: 'A', initial: { x: 400, y: 130 }, display: { positionId: 'ST'  } });
    const ball = makeBall({ initial: { x: 400, y: 490 } });

    doc.entities.push(rcb, cdm, lw, st, ball);

    const cdmRun = makeRun({ entityId: cdm.id, beatId: beat.id, destination: { x: 400, y: 540 }, start: 0.8, duration: 1.0 });
    const p1 = makePass({ entityId: rcb.id, beatId: beat.id, target: { entityId: cdm.id }, start: 0.0, duration: 0.8 });
    const p2 = makePass({ entityId: cdm.id, beatId: beat.id, target: { entityId: lw.id  }, start: 0.8, duration: 0.8 });
    const p3 = makePass({ entityId: lw.id,  beatId: beat.id, target: { entityId: cdm.id }, start: 1.6, duration: 0.8 });
    const p4 = makePass({ entityId: cdm.id, beatId: beat.id, target: { entityId: st.id  }, start: 2.4, duration: 0.8 });

    doc.actions.push(cdmRun, p1, p2, p3, p4);

    printResult('Sequence 1 — 4-pass name register', narrate(doc, { register: 'name' }));
  }

  // ── Sequence 2 ─────────────────────────────────────────────────────────────
  {
    const beat = makeBeat({ order: 0 });
    const doc  = createEmptyDocument({ name: 'Seq2 5-pass two-CM disambiguation' });
    doc.beats.push(beat);
    doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

    const cb   = makePlayer({ team: 'A', initial: { x: 450, y: 490 }, display: { positionId: 'CB'  } });
    const lcm  = makePlayer({ team: 'A', initial: { x: 300, y: 350 }, display: { positionId: 'CM'  } });
    const lm   = makePlayer({ team: 'A', initial: { x: 100, y: 300 }, display: { positionId: 'LM'  } });
    const rcm  = makePlayer({ team: 'A', initial: { x: 500, y: 350 }, display: { positionId: 'CM'  } });
    const rm   = makePlayer({ team: 'A', initial: { x: 700, y: 300 }, display: { positionId: 'RM'  } });
    const st   = makePlayer({ team: 'A', initial: { x: 500, y: 100 }, display: { positionId: 'ST'  } });
    const ball = makeBall({ initial: { x: 450, y: 490 } });

    doc.entities.push(cb, lcm, lm, rcm, rm, st, ball);

    const p1 = makePass({ entityId: cb.id,  beatId: beat.id, target: { entityId: lcm.id }, start: 0.0, duration: 0.8 });
    const p2 = makePass({ entityId: lcm.id, beatId: beat.id, target: { entityId: lm.id  }, start: 0.8, duration: 0.8 });
    const p3 = makePass({ entityId: lm.id,  beatId: beat.id, target: { entityId: rcm.id }, start: 1.6, duration: 0.8 });
    const p4 = makePass({ entityId: rcm.id, beatId: beat.id, target: { entityId: rm.id  }, start: 2.4, duration: 0.8 });
    const p5 = makePass({ entityId: rm.id,  beatId: beat.id, target: { entityId: st.id  }, start: 3.2, duration: 0.8 });

    doc.actions.push(p1, p2, p3, p4, p5);

    printResult('Sequence 2 — 5-pass two-CM disambiguation', narrate(doc, { register: 'name' }));
  }

  // ── Sequence 3 ─────────────────────────────────────────────────────────────
  {
    const beat = makeBeat({ order: 0 });
    const doc  = createEmptyDocument({ name: 'Seq3 carry+cross+shot' });
    doc.beats.push(beat);
    doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

    const lw   = makePlayer({ team: 'A', initial: { x: 100, y: 350 }, display: { positionId: 'LW' } });
    const st   = makePlayer({ team: 'A', initial: { x: 400, y: 130 }, display: { positionId: 'ST' } });
    const ball = makeBall({ initial: { x: 100, y: 350 } });

    doc.entities.push(lw, st, ball);

    const topGoal = doc.entities.find((e) => e.kind === 'goal' && e.initial.y < 300);

    const carry = makeCarry({ entityId: lw.id, beatId: beat.id, destination: { x: 100, y: 120 }, start: 0.0, duration: 1.0 });
    const cross = makePass({ entityId: lw.id, beatId: beat.id, target: { entityId: st.id }, start: 1.0, duration: 0.6 });

    doc.actions.push(carry, cross);

    if (topGoal) {
      const shot = makePass({ entityId: st.id, beatId: beat.id, target: { entityId: topGoal.id }, start: 1.6, duration: 0.5 });
      doc.actions.push(shot);
    }

    printResult('Sequence 3 — carry + cross + shot', narrate(doc, { register: 'name' }));
  }
}
