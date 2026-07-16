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

// ─────────────────────────────────────────────────────────────────────────────
// Scene A — check + layoff
// CB→LB pass; LM runs closing (check); LB→LM pass; CM runs closing underneath;
// LM→CM backward pass (layoff).
// Expect: check-to-ball clause for LM, check-to-ball clause for CM,
//         layoff phrase on the LM→CM clause (+ lifecycle continuation for CM).
// ─────────────────────────────────────────────────────────────────────────────
// Layout (team A attacks 'up', goal at y=10):
//   CB  (400, 490)  — deep in own half
//   LB  (150, 380)  — left back
//   LM  (250, 280)  — left midfielder, will check back toward ball
//   CM  (400, 340)  — central mid, will check underneath
//   ball at CB initially
//
// Beat sequence (t=time in seconds):
//   t=0.0 d=0.8: CB→LB pass
//   t=0.2 d=1.0: LM run from (250,280) to (250,300) — moving back toward ball (closing)
//   t=0.8 d=0.8: LB→LM pass  (LB→LM: dy=-80, fc≈0.625 → forward ✓ — LAYOFF trigger c)
//   t=0.9 d=0.8: CM run from (400,390) to (260,340) — moves toward LM+ball (closing)
//   t=1.6 d=0.8: LM→CM backward pass  (dy=+40, fc≈-0.97 → backward; CM y=340>LM y=300 → underneath ✓)
//
// Ball position during LM run (perimeter-offset aware):
//   At t=0.2: CB→LB pass in-flight (0→0.8). Ball at CB perimeter → LB perimeter.
//             ease(0.25)≈0.125 → ball near (165,456). LM at (250,280). d≈194px
//   At t=1.2 (run end): LB→LM pass in-flight (0.8→1.6). ease(0.5)=0.5 → ball mid-flight.
//             LB perimeter (150,348) → LM perimeter (250,268). mid ≈ (200,308).
//             LM at (250,300). d≈51px → closing ✓
//
// Ball position during CM run (t=0.9 to t=1.7):
//   At t=0.9: LB→LM pass in-flight (0.8→1.6). ease(0.125)≈0.03 → ball near LB (153,345).
//             CM at (400,390). d≈251px
//   At t=1.7: LM→CM pass in-flight (1.6→2.4). ease(0.125)≈0.03 → ball near LM (250,269).
//             CM at (260,340). d≈72px → closing ✓  (delta≈-179px >> -10 threshold)

{
  const beat = makeBeat({ order: 0 });
  const doc = createEmptyDocument({ name: 'Scene A — check + layoff' });
  doc.beats.push(beat);
  doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

  const cb   = makePlayer({ team: 'A', initial: { x: 400, y: 490 }, display: { positionId: 'CB' } });
  const lb   = makePlayer({ team: 'A', initial: { x: 150, y: 380 }, display: { positionId: 'LB' } });
  const lm   = makePlayer({ team: 'A', initial: { x: 250, y: 280 }, display: { positionId: 'LM' } });
  // LM run ends at y=300 so that LB→LM pass direction is 'forward':
  //   LB(150,380)→LM(250,300): dy=-80, fc=80/128≈0.625 → forward ✓ (required by LAYOFF trigger c)
  // LM→CM pass: LM at (250,300) → CM at (380,480). dx=130, dy=180 → fc≈-0.81 → backward ✓
  // Receiver CM y=480 > passer LM y=300 → "underneath" ✓ → ACT_LAYOFF_UNDERNEATH fires.
  const cm   = makePlayer({ team: 'A', initial: { x: 400, y: 390 }, display: { positionId: 'CM' } });
  const ball = makeBall({ initial: { x: 400, y: 490 } });

  doc.entities.push(cb, lb, lm, cm, ball);

  const p1    = makePass({ entityId: cb.id,  beatId: beat.id, target: { entityId: lb.id  }, start: 0.0, duration: 0.8 });
  const lmRun = makeRun({ entityId: lm.id,  beatId: beat.id, destination: { x: 250, y: 300 }, start: 0.2, duration: 1.0 });
  const p2    = makePass({ entityId: lb.id,  beatId: beat.id, target: { entityId: lm.id  }, start: 0.8, duration: 0.8 });
  const cmRun = makeRun({ entityId: cm.id,  beatId: beat.id, destination: { x: 260, y: 340 }, start: 0.9, duration: 0.8 });
  const p3    = makePass({ entityId: lm.id,  beatId: beat.id, target: { entityId: cm.id  }, start: 1.6, duration: 0.8 });

  doc.actions.push(p1, lmRun, p2, cmRun, p3);

  printResult('Scene A — check + layoff', narrate(doc, { register: 'name' }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Scene B — the coach's overlap
// LB has ball; LM checks (run closing); LB→LM pass; LB runs outside path
// around LM, ending beyond; LM→LB pass into the run.
// Expect: LM check-to-ball clause, "the left back overlaps" clause,
//         lifecycle receiving clause for the LM→LB pass.
// ─────────────────────────────────────────────────────────────────────────────
// Layout (team A attacks 'up', goal at y=10):
//   LB  (150, 400)  — left back, has ball initially
//   LM  (250, 280)  — left midfielder
//
// Beat sequence:
//   t=0.0 d=0.8: LM run from (250,280) to (250,360) — checks back toward LB+ball (closing)
//   t=0.8 d=0.8: LB→LM pass (ball goes to LM at y=360)
//   t=0.8 d=1.6: LB run from (150,400) to (80,200)  — overlapping run
//                  • starts behind LM (LB y=400 > LM y=360 for 'up' attack) ✓
//                  • path goes to x=80, LM is at x=250 → runner is outside (nearer touchline x=10) ✓
//                  • ends at y=200 which is < LM y=280 (initial) and < 360 (after check) ✓ (beyond)
//   t=1.6 d=0.8: LM→LB pass — delivers to LB who is running
//
// Check: LM run at t=0.0
//   Ball at t=0: LB has ball, pos near LB (150,400). LM at (250,280). d=√(100²+120²)=156px
//   Ball at t=0.8: LB→LM pass just delivered, LM at (250,360). Ball near LM.
//                  LM is now at (250,360). Distance ~ 0 (LM HAS ball).
//   → closing ✓
//
// Overlap: LB run starts at t=0.8
//   resolveOwnerAtT(t=0.8): p2 (LB→LM) starts at 0.8, so ball is in-flight at exactly 0.8.
//   Actually ownership: LB owned ball until pass starts (t=0.8 = pass start). At t=0.8
//   the pass just started, so ownership = in-flight. The resolveOwnerAtT returns null for in-flight.
//   We need LM to be owner. Let's shift: LB run starts at t=0.85 (just after LB→LM pass starts,
//   so LM won't be owner yet either — ball still in flight).
//   Better: LB run starts at t=1.6 (after LB→LM pass finishes at 0.8+0.8=1.6).
//   At t=1.6: LM owns ball (received from LB). LB is behind LM.
//   LB run: t=1.6, d=1.0 — from (150,400) to (80,200).
//
// Revised timing:
//   t=0.0 d=0.8: LM run (checks) from (250,280) to (250,360)
//   t=0.8 d=0.8: LB→LM pass (LM receives at t=1.6)
//   t=1.6 d=1.0: LB run (overlap) from (150,400) to (80,200)
//   t=2.0 d=0.8: LM→LB pass (ball to LB during/after overlap run; LB receives at t=2.8)
//
// Overlap check at t=1.6:
//   resolveOwnerAtT(t=1.6): LB→LM ended at 1.6, so LM owns. ✓ (teammate of LB)
//   startsBehind(LB, LM, t=1.6): LB at (150,400), LM at (250,360). 400>360 → LB behind LM ✓
//   pathSide: LB midpath x=(150+80)/2=115. LM at x=250. nearerTouchline=10.
//             LB dist to touchline=|115-10|=105. LM dist=|250-10|=240. 105<240 → outside ✓
//   endsLevelOrBeyond: LB ends at (80,200). LM at t=2.6 (run.end): LM has no run, stays at (250,360).
//                      LB y=200 < LM y=360 → beyond ✓ (attacking 'up', lower y = more advanced)

{
  const beat = makeBeat({ order: 0 });
  const doc = createEmptyDocument({ name: 'Scene B — the overlap' });
  doc.beats.push(beat);
  doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

  const lb   = makePlayer({ team: 'A', initial: { x: 150, y: 400 }, display: { positionId: 'LB' } });
  const lm   = makePlayer({ team: 'A', initial: { x: 250, y: 280 }, display: { positionId: 'LM' } });
  const ball = makeBall({ initial: { x: 150, y: 400 } }); // LB has ball

  doc.entities.push(lb, lm, ball);

  const lmRun  = makeRun({ entityId: lm.id, beatId: beat.id, destination: { x: 250, y: 360 }, start: 0.0, duration: 0.8 });
  const p1     = makePass({ entityId: lb.id, beatId: beat.id, target: { entityId: lm.id }, start: 0.8, duration: 0.8 });
  const lbRun  = makeRun({ entityId: lb.id, beatId: beat.id, destination: { x: 80,  y: 200 }, start: 1.6, duration: 1.0 });
  const p2     = makePass({ entityId: lm.id, beatId: beat.id, target: { entityId: lb.id }, start: 2.0, duration: 0.8 });

  doc.actions.push(lmRun, p1, lbRun, p2);

  printResult('Scene B — the overlap', narrate(doc, { register: 'name' }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Scene C — run in behind, no defenders
// ST runs toward-goal, beyond furthest teammate, toward box, while CM passes in.
// Expect: "the striker runs in behind" clause + lifecycle receiving clause.
// ─────────────────────────────────────────────────────────────────────────────
// Layout (team A attacks 'up', goal at y=10):
//   CM  (400, 300)  — central mid, has ball
//   ST  (400, 160)  — striker, ahead of CM, will run into box
//   (Only two players — ST is beyond furthest teammate trivially)
//
// ST run: from (400,160) to (400,60) — into top penalty box (x=250-550,y=10-90)
//   runVectorVsAttack: dy=60-160=-100 → toward y=10 → 'toward-goal' ✓
//   beyondFurthestTeammate at t=0: ST y=160, CM y=300. 160<300 (for 'up') → ST is furthest ✓
//   towardBox: destination (400,60) → x in [250,550] ✓, y=60 in [10,90] ✓ → in box ✓
//
// CM→ST pass: starts at t=0.5 (during ST run), delivers ST to box
//   timingOverlap: ST run [0,1.0], pass [0.5,1.1] → run active at release ✓

{
  const beat = makeBeat({ order: 0 });
  const doc = createEmptyDocument({ name: 'Scene C — run in behind' });
  doc.beats.push(beat);
  doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

  const cm   = makePlayer({ team: 'A', initial: { x: 400, y: 300 }, display: { positionId: 'CM' } });
  const st   = makePlayer({ team: 'A', initial: { x: 400, y: 160 }, display: { positionId: 'ST' } });
  const ball = makeBall({ initial: { x: 400, y: 300 } }); // CM has ball

  doc.entities.push(cm, st, ball);

  const stRun = makeRun({ entityId: st.id, beatId: beat.id, destination: { x: 400, y: 60 }, start: 0.0, duration: 1.0 });
  const p1    = makePass({ entityId: cm.id, beatId: beat.id, target: { entityId: st.id }, start: 0.5, duration: 0.6 });

  doc.actions.push(stRun, p1);

  printResult('Scene C — run in behind', narrate(doc, { register: 'name' }));
}

console.log('\n═══════════════════════════════════════════════════════════════\n');

// ─────────────────────────────────────────────────────────────────────────────
// Verification scene (a) — coach overlap
// Same geometry as Scene B (the overlap). Expected after FIX 4:
//   1. the left midfielder checks to ball
//   2. the left midfielder, continuing his run, receives from the left back
//   3. the left back overlaps
//   4. the left back, continuing his run, receives from the left midfielder
// Note: "the left midfielder, continuing his run" comes BEFORE the source name (FIX 4 ✓)
// ─────────────────────────────────────────────────────────────────────────────
{
  const beat = makeBeat({ order: 0 });
  const doc = createEmptyDocument({ name: 'Verify (a) — coach overlap' });
  doc.beats.push(beat);
  doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

  const lb   = makePlayer({ team: 'A', initial: { x: 150, y: 400 }, display: { positionId: 'LB' } });
  const lm   = makePlayer({ team: 'A', initial: { x: 250, y: 280 }, display: { positionId: 'LM' } });
  const ball = makeBall({ initial: { x: 150, y: 400 } });

  doc.entities.push(lb, lm, ball);

  // LM checks (drops back, closing to LB+ball)
  const lmRun  = makeRun({ entityId: lm.id, beatId: beat.id, destination: { x: 250, y: 360 }, start: 0.0, duration: 0.8 });
  // LB→LM pass (forward: LB(150,400)→LM(250,360), dy=-40 → fc≈0.37 → square — not layoff eligible)
  const p1     = makePass({ entityId: lb.id, beatId: beat.id, target: { entityId: lm.id }, start: 0.8, duration: 0.8 });
  // LB overlapping run: outside path, starts behind LM, ends beyond
  const lbRun  = makeRun({ entityId: lb.id, beatId: beat.id, destination: { x: 80,  y: 200 }, start: 1.6, duration: 1.0 });
  // LM→LB forward pass into the overlap
  const p2     = makePass({ entityId: lm.id, beatId: beat.id, target: { entityId: lb.id }, start: 2.0, duration: 0.8 });

  doc.actions.push(lmRun, p1, lbRun, p2);

  printResult('Verify (a) — coach overlap', narrate(doc, { register: 'name' }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Verification scene (b) — CM long-ball layoff
// CM plays forward to ST (back to goal); ST lays off to checking AM; LW runs in behind.
//
// Layout (team A attacks 'up', goal at y=10):
//   CM  (400, 380)  — central mid, has ball
//   ST  (400, 200)  — striker, back to goal
//   AM  (250, 300)  — attacking mid, makes closing run toward ST
//   LW  (150, 155)  — left winger, runs in behind into box
//
// Timeline:
//   t=0.0 d=0.8: LW run from (150,155) to (300,60) — toward box, in behind
//   t=0.5 d=0.6: CM → ST pass (forward, ends t=1.1)
//   t=0.8 d=0.7: AM run from (250,300) to (280,320) — closing toward ST+ball (ends t=1.5)
//   t=1.1 d=0.8: ST → AM pass (backward layoff, ends t=1.9)
//
// Pass geometry:
//   CM→ST: (400,380)→(400,200): dy=-180, fc=1.0 → forward ✓ (LAYOFF trigger c for ST)
//   ST→AM: (400,200)→(280,320): dx=-120,dy=120, fc≈-0.707 → backward ✓; AM y=320>ST y=200 → underneath ✓
//
// LAYOFF trigger checks:
//   (c) ST received CM→ST forward pass ending at t=1.1, ST→AM starts t=1.1. gap=0 ≤ 2.0s ✓
//   (d) AM run [0.8,1.5] active at pass.start=1.1 ✓; AM closing to ball:
//       t0=0.8: ball mid-flight CM→ST → (400,258). AM at (250,300). d0≈156px
//       t1=1.5: ball mid-flight ST→AM → (340,228). AM at (280,320). d1≈110px → closing ✓
//
// LW run-in-behind checks:
//   runVectorVsAttack: LW(150,155)→(300,60): dy=-95, fc≈0.56 → toward-goal ✓
//   beyondFurthestTeammate at t=0: LW y=155, ST y=200, AM y=300, CM y=380 → LW is furthest ✓
//   towardBox: (300,60) → x∈[250,550] ✓, y∈[10,90] ✓
//
// Expected output:
//   1. the left winger runs in behind
//   2. the attacking midfielder checks to ball
//   3. the central midfielder plays the striker         ← first pass, no reception context
//   4. the attacking midfielder, continuing his run, receives the layoff from the striker  ← FIX 4 ✓
// ─────────────────────────────────────────────────────────────────────────────
{
  const beat = makeBeat({ order: 0 });
  const doc = createEmptyDocument({ name: 'Verify (b) — CM long-ball layoff' });
  doc.beats.push(beat);
  doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

  const cm   = makePlayer({ team: 'A', initial: { x: 400, y: 380 }, display: { positionId: 'CM' } });
  const st   = makePlayer({ team: 'A', initial: { x: 400, y: 200 }, display: { positionId: 'ST' } });
  const am   = makePlayer({ team: 'A', initial: { x: 250, y: 300 }, display: { positionId: 'CAM' } });
  const lw   = makePlayer({ team: 'A', initial: { x: 150, y: 155 }, display: { positionId: 'LW' } });
  const ball = makeBall({ initial: { x: 400, y: 380 } });

  doc.entities.push(cm, st, am, lw, ball);

  const lwRun  = makeRun({ entityId: lw.id, beatId: beat.id, destination: { x: 300, y: 60  }, start: 0.0, duration: 0.8 });
  const amRun  = makeRun({ entityId: am.id, beatId: beat.id, destination: { x: 280, y: 320 }, start: 0.8, duration: 0.7 });
  const p1     = makePass({ entityId: cm.id, beatId: beat.id, target: { entityId: st.id }, start: 0.5, duration: 0.6 });
  const p2     = makePass({ entityId: st.id, beatId: beat.id, target: { entityId: am.id }, start: 1.1, duration: 0.8 });

  doc.actions.push(lwRun, amRun, p1, p2);

  printResult('Verify (b) — CM long-ball layoff', narrate(doc, { register: 'name' }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Verification scene (c) — routine repositioning run → SILENCE
// A center-back shifts laterally while CM has the ball.
// No signature should fire on the CD run (not closing, not outside, not toward-goal).
//
// Layout (team A attacks 'up'):
//   CM  (400, 300)  — has ball
//   CD  (300, 450)  — shifts right: (300,450) → (500,450)
//
// CD starts at x=500, runs LEFT to x=300 — away from CM→RB pass (which goes right to x=650).
//
// CD run analysis (perimeter-offset aware):
//   closing? t0=0: CM owns ball, ball at (400,268). CD at (500,450). d0≈208px
//            t1=1.0: CM→RB pass in-flight (0.5→1.3). ease(0.625)≈0.719.
//            ball from CM-perimeter (400,268) → RB-perimeter (650,388); lerp at 0.719≈(580,355).
//            CD at (300,450). d1≈√(280²+95²)≈295px. delta=+87 → 'opening' → CHECK fails ✓
//   overlap? tmX=CM.x=400. CD midpath x=(500+300)/2=400 → same column → 'neither' ✓
//   in-behind? runVector: dx=-200,dy=0 → fc=0 → 'lateral' → fails ✓
//
// Expected output: only the CM→RB pass clause; no CD clause.
// ─────────────────────────────────────────────────────────────────────────────
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

  // CD lateral shift — should be silent (no signature)
  const cdRun = makeRun({ entityId: cd.id, beatId: beat.id, destination: { x: 300, y: 450 }, start: 0.0, duration: 1.0 });
  // A pass so the scene has narrable events
  const p1    = makePass({ entityId: cm.id, beatId: beat.id, target: { entityId: rb.id }, start: 0.5, duration: 0.8 });

  doc.actions.push(cdRun, p1);

  printResult('Verify (c) — routine repositioning (CD run should be SILENT)', narrate(doc, { register: 'name' }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Verification scene (d) — pass-and-go overlap  ← FIX 1
// LB plays to LM then immediately starts an overlapping run while the ball is
// still in flight. LM receives and plays back into LB's run.
//
// Key property: at run.start (t=0.3) the ball is inFlight → resolveOwnerAtT
// returns null. resolveOverlapCarrier scans [0.3, 1.5] and finds LM as owner
// at sampleT=0.90 (pass completes at t=0.8; first window point ≥ 0.8 is i=4).
//
// Layout (team A attacks 'up', goal at y=10):
//   LB  (150, 400)  — left back, starts with ball
//   LM  (250, 280)  — left midfielder
//
// Timeline:
//   t=0.0 d=0.8: LB→LM pass (ball in-flight until t=0.8)
//   t=0.3 d=1.2: LB overlap run (150,400)→(80,180) — starts DURING ball flight
//   t=1.0 d=0.8: LM→LB pass (delivers into run)
//
// Overlap geometry (carrier = LM found at sampleT=0.90):
//   startsBehind: LB y=400 > LM y=280 → behind ✓  (at t=0.3, 'up' attack)
//   pathSide: midX=(150+80)/2=115 < LM x=250; dist to touchline x=10: 105 < 240 → outside ✓
//   endsLevelOrBeyond: LB end y=180 ≤ LM y=280 → beyond ✓
//
// Other signatures:
//   CHECK_TO_BALL: silenced — runVectorVsAttack='toward-goal' (fc≈0.95)
//   RUN_IN_BEHIND: fails beyondFurthestTeammate (LM y=280 < LB y=400 for 'up')
//   → only OVERLAP fires on LB run
//
// Expected clauses:
//   1. the left back plays the left midfielder
//   2. the left back overlaps
//   3. the left back, continuing his run, receives from the left midfielder
// Debug notes should contain the ownership-window line from OVERLAP trigger[1]:
//   carrierId=<id> sampleT=0.90
// ─────────────────────────────────────────────────────────────────────────────
{
  const beat = makeBeat({ order: 0 });
  const doc = createEmptyDocument({ name: 'Verify (d) — pass-and-go overlap' });
  doc.beats.push(beat);
  doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

  const lb   = makePlayer({ team: 'A', initial: { x: 150, y: 400 }, display: { positionId: 'LB' } });
  const lm   = makePlayer({ team: 'A', initial: { x: 250, y: 280 }, display: { positionId: 'LM' } });
  const ball = makeBall({ initial: { x: 150, y: 400 } }); // LB has ball

  doc.entities.push(lb, lm, ball);

  // LB passes to LM, then immediately starts the overlap run while ball is in flight.
  const p1    = makePass({ entityId: lb.id, beatId: beat.id, target: { entityId: lm.id }, start: 0.0, duration: 0.8 });
  const lbRun = makeRun({ entityId: lb.id, beatId: beat.id, destination: { x: 80, y: 180 }, start: 0.3, duration: 1.2 });
  // LM plays back to LB into the overlap run (lifecycle continuation).
  const p2    = makePass({ entityId: lm.id, beatId: beat.id, target: { entityId: lb.id }, start: 1.0, duration: 0.8 });

  doc.actions.push(p1, lbRun, p2);

  // debug: true — so the ownership-window line from OVERLAP trigger[1] appears in notes.
  printResult('Verify (d) — pass-and-go overlap (FIX 1)', narrate(doc, { register: 'name', debug: true }));
}
