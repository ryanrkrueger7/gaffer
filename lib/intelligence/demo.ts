// Intelligence demo — three verification sequences.
// Run with: npm run intelligence:demo
//
// ── Sequence 1: 4-pass 'name' register (original demo) ──────────────────────
//   RCB(490)→CDM(370)→LW(350)→CDM(540)→ST(130), team A attacks 'up'
//   CDM Run: 0.8→1.8, drops to y=540
//
//   Pass geometry (gy=-1, forward=toward y=0):
//     p1 RCB→CDM: dy=-120           → fc= 1.0  → forward
//     p2 CDM→LW:  dx=-300,dy=-20    → fc= 0.07 → square   [incoming forward → layoff]
//     p3 LW→CDM:  dx=+300,dy=+190   → fc=-0.54 → backward [incoming square  → plain]
//     p4 CDM→ST:  dy=-410           → fc= 1.0  → forward  [incoming backward→ plain]
//
//   Expected ('name'):
//     1. the right center back plays the defensive midfielder
//     2. the defensive midfielder lays it off to the left winger
//     3. the left winger plays the defensive midfielder
//     4. the defensive midfielder plays the striker
//
// ── Sequence 2: 5-pass two-CM disambiguation + no concatenation ─────────────
//   CB(490)→LCM(370, x=300)→LM(350)→RCM(370, x=500)→RM(200)→ST(130)
//   Two CMs with same 'central midfielder' label → should disambiguate.
//   Expected:
//     1. the center back plays the left-sided central midfielder
//     2. the left-sided central midfielder lays it off to the left midfielder
//     3. the left midfielder plays the right-sided central midfielder
//     4. the right-sided central midfielder lays it off to the right midfielder
//     5. the right midfielder turns and plays the striker
//
// ── Sequence 3: carry + cross + shot (Scope A + B) ──────────────────────────
//   LW carries forward, then crosses (pass) to ST, ST shoots at goal
//   Expected:
//     1. the left winger carries forward
//     2. the left winger plays the striker
//     3. the striker shoots

import { createEmptyDocument, makePlayer, makeBall, makePass, makeRun, makeCarry, makeBeat } from '../engine/factory';
import { narrate } from './narrate';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function printResult(title: string, result: ReturnType<typeof narrate>) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 58 - title.length))}`);
  result.clauses.forEach((c, i) => console.log(`  ${i + 1}. ${c.text}`));
  if (result.notes.length > 0) {
    console.log('  notes:');
    result.notes.forEach((n) => console.log(`    • ${n}`));
  }
  console.log(`  ok: ${result.ok}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sequence 1 — 4-pass 'name' register
// ─────────────────────────────────────────────────────────────────────────────

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

  // CDM drops deep after passing square — makes pass 3 receiver position y=540
  const cdmRun = makeRun({ entityId: cdm.id, beatId: beat.id, destination: { x: 400, y: 540 }, start: 0.8, duration: 1.0 });
  const p1 = makePass({ entityId: rcb.id, beatId: beat.id, target: { entityId: cdm.id }, start: 0.0, duration: 0.8 });
  const p2 = makePass({ entityId: cdm.id, beatId: beat.id, target: { entityId: lw.id  }, start: 0.8, duration: 0.8 });
  const p3 = makePass({ entityId: lw.id,  beatId: beat.id, target: { entityId: cdm.id }, start: 1.6, duration: 0.8 });
  const p4 = makePass({ entityId: cdm.id, beatId: beat.id, target: { entityId: st.id  }, start: 2.4, duration: 0.8 });

  doc.actions.push(cdmRun, p1, p2, p3, p4);

  printResult('Sequence 1 — 4-pass name register', narrate(doc, { register: 'name' }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Sequence 2 — 5-pass two-CM disambiguation (no concatenation)
// ─────────────────────────────────────────────────────────────────────────────
//
// Pass geometry (team A attacks 'up', gy=-1):
//   CB (450,490) → LCM(300,350): dy=-140, dx=-150 → fc=140/204≈0.69 → forward ✓
//   LCM(300,350) → LM (100,300): dy=-50,  dx=-200 → fc=50/206≈0.24  → square
//      [reception: forward+square → layoff → "lays it off to"]
//   LM (100,300) → RCM(500,350): dy=+50,  dx=+400 → fc=-50/403≈-0.12 → square
//      [reception: square+square → plain → "plays"]
//   RCM(500,350) → RM (700,300): dy=-50,  dx=+200 → fc=50/206≈0.24  → square
//      [reception: square+square → plain → "lays it off to"? no, square→square is plain → "plays" then square → layoff]
//      Wait: incoming=square, outgoing=square → plain → "plays"... but "lays it off" is for forward+square
//      Let me recalculate: RCM receives square from LM, passes square to RM
//      classifyReception(square, square, midfielder) → plain → "plays"
//   RM (700,300) → ST (400,130): dy=-170, dx=-300 → fc=170/340≈0.5  → borderline, ≈THRESHOLD (0.5)
//      fc=0.5 which is exactly threshold, 'forward' since forwardComponent > THRESHOLD
//      Wait: exactly equal is NOT > THRESHOLD, so it returns 'square'. Let me adjust ST x.
//      Let's put ST at (350,130): dx=350-700=-350, dy=130-300=-170, dist=√(350²+170²)=√(122500+28900)=√151400≈389.1
//      fc=170/389.1≈0.437 → square. That's not what we want.
//      Let's try ST at (500,100): dx=500-700=-200, dy=100-300=-200, dist=√(200²+200²)=282.8
//      fc=200/282.8≈0.707 → forward ✓ "turns and plays"
//      [reception: square+forward + midfielder → half-turn → "receives on the half turn and plays"]
//
// Updated geometry:
//   CB  (450, 490)
//   LCM (300, 350) — left-sided central midfielder (lower x)
//   LM  (100, 300) — left midfielder
//   RCM (500, 350) — right-sided central midfielder (higher x)
//   RM  (700, 300) — right midfielder
//   ST  (500, 100) — striker

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

// ─────────────────────────────────────────────────────────────────────────────
// Sequence 3 — carry + cross + shot (Scope A + B)
// ─────────────────────────────────────────────────────────────────────────────
//
// LW  (100, 350) carries forward to (100, 120) — dy=-230 → fc=1.0 → forward
// LW  (100, 120) → ST (400, 130): dx=300, dy=10, fc≈-0.03 → square (cross)
//     verb: no incomingDir (carry reset lastIncomingDir) → "plays"
// ST  (400, 130) → seeded_goal (400, 10): shot

{
  const beat = makeBeat({ order: 0 });
  const doc  = createEmptyDocument({ name: 'Seq3 carry+cross+shot' });
  doc.beats.push(beat);
  doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

  const lw   = makePlayer({ team: 'A', initial: { x: 100, y: 350 }, display: { positionId: 'LW' } });
  const st   = makePlayer({ team: 'A', initial: { x: 400, y: 130 }, display: { positionId: 'ST' } });
  const ball = makeBall({ initial: { x: 100, y: 350 } });

  doc.entities.push(lw, st, ball);

  // Find the seeded top goal (y=10, at x=400)
  const topGoal = doc.entities.find((e) => {
    if (e.kind !== 'goal') return false;
    return e.initial.y < 300;
  });

  const carry = makeCarry({ entityId: lw.id, beatId: beat.id, destination: { x: 100, y: 120 }, start: 0.0, duration: 1.0 });
  const cross = makePass({ entityId: lw.id, beatId: beat.id, target: { entityId: st.id }, start: 1.0, duration: 0.6 });

  doc.actions.push(carry, cross);

  if (topGoal) {
    const shot = makePass({ entityId: st.id, beatId: beat.id, target: { entityId: topGoal.id }, start: 1.6, duration: 0.5 });
    doc.actions.push(shot);
  }

  printResult('Sequence 3 — carry + cross + shot', narrate(doc, { register: 'name' }));
}

console.log('\n───────────────────────────────────────────────────────────────\n');
