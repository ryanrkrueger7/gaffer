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
// Expect: check-to-ball clause for LM, third-man-run clause for CM
//         (CB→LB pass is in-flight at CM run start t=0.9, so CM fires MOV_THIRD_MAN_RUN
//         specificity 15 rather than MOV_CHECK_TO_BALL specificity 10),
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
// LB has ball; LM drops in (run away from goal); LB→LM pass; LB runs outside path
// around LM, ending beyond; LM→LB pass into the run.
// Expect: LM drop-in clause (MOV_DROP_IN specificity 12 wins; LM run is away from goal),
//         standard "plays" clause for LB→LM (drop-in skips lifecycle),
//         "the left back overlaps" clause,
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
// Same geometry as Scene B (the overlap). Expected:
//   1. the left midfielder drops in   ← MOV_DROP_IN fires (run is away from goal)
//   2. the left back plays the left midfielder  ← standard pass (drop-in skips lifecycle)
//   3. the left back overlaps
//   4. the left back, continuing his run, receives from the left midfielder
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
//   2. the attacking midfielder makes a third-man run   ← MOV_THIRD_MAN_RUN (CM→ST in-flight at AM run start)
//   3. the central midfielder plays the striker         ← first pass, no reception context
//   4. the attacking midfielder, continuing his run, receives the layoff from the striker
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

// ─────────────────────────────────────────────────────────────────────────────
// Verification scene (e) — run-meets-pass overlap  ← FIX 2
// LB passes to CM; CM holds; CM→LB pass is authored concurrent with LB's
// overlap run (pass in flight for the run's entire window). resolveOwnerAtT
// returns null at every sample; the in-flight-passer condition finds CM as
// carrier (carrierVia='in-flight-passer').
//
// Layout (team A attacks 'up', goal at y=10):
//   LB  (150, 400)  — left back, starts with ball
//   CM  (350, 350)  — central midfielder
//
// Timeline:
//   t=0.0 d=0.8: LB→CM pass (LB gives ball to CM)
//   t=1.0 d=1.0: LB overlap run (150,400)→(80,200)   — starts after pass
//   t=1.0 d=1.0: CM→LB pass concurrent with run      — in flight [1.0, 2.0]
//
// resolveOverlapCarrier scan over [1.0, 2.0]:
//   Every sample: resolveOwnerAtT = null (CM→LB in-flight)
//   condition (b): CM→LB pass in flight, passer=CM ≠ LB, same team
//   → {carrierId: CM, sampleT: 1.00, carrierVia: 'in-flight-passer'}
//
// Geometry (carrier = CM):
//   startsBehind: LB y=400 > CM y=350 → behind ✓  (at t=1.0, 'up' attack)
//   pathSide: midX=(150+80)/2=115; CM x=350, nearerTouchline=10, dist 340;
//             runner dist=105 < 340 → outside ✓
//   endsLevelOrBeyond: LB end y=200 ≤ CM y=350 at t=2.0 → beyond ✓
//
// CHECK_TO_BALL: silenced (runVector toward-goal, fc≈0.94)
// RUN_IN_BEHIND: fails beyondFurthestTeammate (CM y=350 < LB y=400 for 'up')
// → only OVERLAP fires
//
// Expected clauses:
//   1. the left back plays the central midfielder
//   2. the left back overlaps
//   3. the left back, continuing his run, receives from the central midfielder
// Debug notes should contain:
//   carrierId=<cm_id> sampleT=1.00 carrierVia=in-flight-passer
// ─────────────────────────────────────────────────────────────────────────────
{
  const beat = makeBeat({ order: 0 });
  const doc = createEmptyDocument({ name: 'Verify (e) — run-meets-pass overlap' });
  doc.beats.push(beat);
  doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

  const lb   = makePlayer({ team: 'A', initial: { x: 150, y: 400 }, display: { positionId: 'LB' } });
  const cm   = makePlayer({ team: 'A', initial: { x: 350, y: 350 }, display: { positionId: 'CM' } });
  const ball = makeBall({ initial: { x: 150, y: 400 } }); // LB has ball

  doc.entities.push(lb, cm, ball);

  // LB passes to CM to set up the overlap, then CM delivers back concurrently with LB's run.
  const p1    = makePass({ entityId: lb.id, beatId: beat.id, target: { entityId: cm.id }, start: 0.0, duration: 0.8 });
  const lbRun = makeRun({ entityId: lb.id, beatId: beat.id, destination: { x: 80, y: 200 }, start: 1.0, duration: 1.0 });
  // CM→LB pass concurrent with LB's run: ball in flight [1.0, 2.0] for the entire run window.
  const p2    = makePass({ entityId: cm.id, beatId: beat.id, target: { entityId: lb.id }, start: 1.0, duration: 1.0 });

  doc.actions.push(p1, lbRun, p2);

  // debug: true — to see carrierId/sampleT/carrierVia in the overlap trigger[1] note.
  printResult('Verify (e) — run-meets-pass overlap (FIX 2)', narrate(doc, { register: 'name', debug: true }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Verification scene (f) — run chaining (extension run)
// LB→LM pass; LM bounces to CM; LB overlap run R1 (unresolved on that leg);
// LB second run R2 continuing from R1's end; CM→LB pass meeting R2.
//
// Without the fix: R2 independently matches CHECK_TO_BALL (spurious clause),
// R2 overwrites R1 in resolvedRunAtPass → continuation phrase lost.
// With the fix: R2 detected as EXTENSION of R1 → skipped from matching entirely;
// R1 (OVERLAP) resolves to CM→LB pass; continuation phrase preserved.
//
// Layout (team A attacks 'up', goal at y=10):
//   LB  (150, 400)  — left back, starts with ball
//   LM  (250, 300)  — left midfielder
//   CM  (350, 290)  — central midfielder
//
// Timeline:
//   t=0.0 d=0.8: LB→LM pass
//   t=0.8 d=0.8: LM→CM pass (bounce)
//   t=1.6 d=1.0: LB overlap run R1: (150,400)→(80,250), ends t=2.6
//   t=2.7 d=0.8: LB second run R2: (80,250)→(80,100)   ← extension of R1
//   t=2.7 d=0.8: CM→LB pass: meets R2, arrives t=3.5
//
// Extension detection for R2:
//   temporal: 2.7 - 2.6 = 0.1s ≤ 1.5s ✓
//   spatial:  LB at R1.end (t=2.6) = (80,250); LB at R2.start (t=2.7) = (80,250)
//             dist = 0 ≤ 40px ✓
//
// Overlap geometry for R1 (carrier = CM via resolveOwnerAtT at t=1.6):
//   startsBehind: LB y=400 > CM y=290 → behind ✓
//   pathSide: midX=115, CM x=350, nearer touchline x=10; 105 < 340 → outside ✓
//   endsLevelOrBeyond: LB end y=250 ≤ CM y=290 at t=2.6 → beyond ✓
//
// Lifecycle: resolveRunLifecycle(R1) finds CM→LB pass (starts t=2.7 ≥ R1.start=1.6)
//   R1.resolution = { receivingPassActionId: CM→LB pass }
//   R2 skipped → resolvedRunAtPass[CM→LB] stays as R1 (OVERLAP) → continuation ✓
//
// Expected clauses:
//   1. the left back plays the left midfielder
//   2. the left midfielder lays it off to the central midfielder
//   3. the left back overlaps
//   4. the left back, continuing his run, receives from the central midfielder
// Debug notes should contain:
//   [<R2_id>] run EXTENSION of [<R1_id>] (term mov.overlap)
// ─────────────────────────────────────────────────────────────────────────────
{
  const beat = makeBeat({ order: 0 });
  const doc = createEmptyDocument({ name: 'Verify (f) — run chaining (extension run)' });
  doc.beats.push(beat);
  doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

  const lb   = makePlayer({ team: 'A', initial: { x: 150, y: 400 }, display: { positionId: 'LB' } });
  const lm   = makePlayer({ team: 'A', initial: { x: 250, y: 300 }, display: { positionId: 'LM' } });
  const cm   = makePlayer({ team: 'A', initial: { x: 350, y: 290 }, display: { positionId: 'CM' } });
  const ball = makeBall({ initial: { x: 150, y: 400 } }); // LB has ball

  doc.entities.push(lb, lm, cm, ball);

  const p1    = makePass({ entityId: lb.id, beatId: beat.id, target: { entityId: lm.id }, start: 0.0, duration: 0.8 });
  const p2    = makePass({ entityId: lm.id, beatId: beat.id, target: { entityId: cm.id }, start: 0.8, duration: 0.8 });
  // R1: LB overlap run — ball not delivered on this leg.
  const lbR1  = makeRun({ entityId: lb.id, beatId: beat.id, destination: { x: 80, y: 250 }, start: 1.6, duration: 1.0 });
  // R2: LB second run continuing from R1's end — extension.
  const lbR2  = makeRun({ entityId: lb.id, beatId: beat.id, destination: { x: 80, y: 100 }, start: 2.7, duration: 0.8 });
  // CM delivers to LB into R2.
  const p3    = makePass({ entityId: cm.id, beatId: beat.id, target: { entityId: lb.id }, start: 2.7, duration: 0.8 });

  doc.actions.push(p1, p2, lbR1, lbR2, p3);

  // debug: true — to see the EXTENSION log line in notes.
  printResult('Verify (f) — run chaining (FIX)', narrate(doc, { register: 'name', debug: true }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Scene G — false-positive proximity gate  ← FIX 3
// LM (far left touchline) makes a forward run straight up the left channel while
// CM (center-left) concurrent pass is in-flight. ALL four relational predicates
// pass (startsBehind/pathSide=outside/endsLevelOrBeyond), but LM is ~316px from
// CM — nowhere near "going around" anyone.
// OVERLAP must NOT match (proximity minDist ≫ OVERLAP_PROXIMITY_PX=250px).
// The proximity gate is the decisive discriminator (trigger[5]=false).
//
// pathSide logic: CM at x=350 < pitchCenterX=400 → nearerTouchlineX=10 (left).
// LM mid x=50: dist to left touchline=40. CM dist=340. 40<340 → outside ✓.
// But minDist=√((50-350)²+(400-300)²)≈316px > 250px → trigger[5] false ✓.
//
// Layout (team A attacks 'up', goal at y=10):
//   CB  (400, 490)  — center back, starts with ball
//   CM  (350, 300)  — left-center midfielder   ← the carrier (left of center)
//   LM  (50,  400)  — left midfielder (far left touchline, behind CM)
//
// Timeline:
//   t=0.0 d=0.8: CB→CM pass (CM gets ball at t=0.8)
//   t=1.0 d=1.0: LM run (50,400)→(50,80)   ← straight up left touchline, t=[1.0,2.0]
//   t=1.0 d=1.0: CM→LM pass concurrent with run (in-flight [1.0,2.0])
//
// resolveOverlapCarrier: CM→LM in-flight → {carrierId: CM, sampleT: 1.0, carrierVia: 'in-flight-passer'}
//
// Relational predicates vs CM (x=350, y=300):
//   startsBehind: LM y=400 > CM y=300 → behind ✓
//   pathSide: LM mid x=50. CM x=350. Left touchline x=10.
//             LM dist=|50-10|=40. CM dist=|350-10|=340. 40<340 → outside ✓
//   endsLevelOrBeyond: LM end y=80 ≤ CM y=300 → beyond ✓
//
// Proximity check (LM path vs CM position):
//   CM stays at (350,300). LM runs straight up from (50,400) to (50,80).
//   At i=0: dist=√((50-350)²+(400-300)²)=√(90000+10000)≈316px
//   At midpoint (u=0.5): LM=(50,240), dist=√((50-350)²+(240-300)²)=√(90000+3600)≈306px
//   minDist≈306px ≫ 250px → trigger[5] false → OVERLAP rejected ✓
//
// MOV_CHECK_TO_BALL: LM run toward-goal (fc=1.0) → silence[0] fires → SILENCED
// MOV_RUN_IN_BEHIND: LM y=400 > CM y=300 → beyondFurthestTeammate=false → trigger[1] false
//
// Expected output:
//   1. the center back plays the central midfielder
//   2. the central midfielder plays through to the left midfielder
//   LM run: SILENT (MOV_OVERLAP: proximity gate blocks at minDist≈306px; MOV_RUN_IN_BEHIND:
//     LM not beyond furthest teammate; MOV_CHECK_TO_BALL: silenced — run is toward-goal not closing)
//   ACT_THROUGH_BALL fires on CM→LM: receiver has active toward-goal run + beyond furthest teammate ✓
// ─────────────────────────────────────────────────────────────────────────────
{
  const beat = makeBeat({ order: 0 });
  const doc = createEmptyDocument({ name: 'Scene G — false-positive proximity gate' });
  doc.beats.push(beat);
  doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

  const cb   = makePlayer({ team: 'A', initial: { x: 400, y: 490 }, display: { positionId: 'CB' } });
  // CM is left of center so its nearerTouchline=x=10; LM at x=50 is correctly 'outside'
  const cm   = makePlayer({ team: 'A', initial: { x: 350, y: 300 }, display: { positionId: 'CM' } });
  const lm   = makePlayer({ team: 'A', initial: { x: 50,  y: 400 }, display: { positionId: 'LM' } });
  const ball = makeBall({ initial: { x: 400, y: 490 } });

  doc.entities.push(cb, cm, lm, ball);

  const p1    = makePass({ entityId: cb.id, beatId: beat.id, target: { entityId: cm.id }, start: 0.0, duration: 0.8 });
  // LM runs straight up the far left touchline while CM's concurrent pass is in flight.
  const lmRun = makeRun({ entityId: lm.id, beatId: beat.id, destination: { x: 50, y: 80 }, start: 1.0, duration: 1.0 });
  const p2    = makePass({ entityId: cm.id, beatId: beat.id, target: { entityId: lm.id }, start: 1.0, duration: 1.0 });

  doc.actions.push(p1, lmRun, p2);

  // debug: true — proximity gate is decisive: all 4 relational triggers pass, trigger[5] fails.
  printResult('Scene G — false-positive proximity (OVERLAP must NOT match)', narrate(doc, { register: 'name', debug: true }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Scene H — true-positive real overlap  ← FIX 3 (passes)
// LM makes a genuine around-the-outside run close to CM during CM's in-flight pass.
// OVERLAP must match; proximity minDist ≤ 90px reported in debug.
//
// Layout (team A attacks 'up', goal at y=10):
//   CB  (400, 490)  — center back, starts with ball
//   CM  (200, 350)  — central midfielder   ← the carrier
//   LM  (150, 420)  — left midfielder      ← the real overlapper (tight to CM)
//
// Timeline:
//   t=0.0 d=0.8: CB→CM pass (CM gets ball at t=0.8)
//   t=0.8 d=1.0: LM run (150,420)→(80,200)  ← outside arc, t=[0.8,1.8]
//   t=0.8 d=1.0: CM→LM pass concurrent with run (run-meets-pass; in-flight [0.8,1.8])
//
// resolveOverlapCarrier: at each sample in [0.8,1.8], CM→LM in-flight
//   → {carrierId: CM, sampleT: 0.8, carrierVia: 'in-flight-passer'}
//
// Relational predicates vs CM (x=200, y=350):
//   startsBehind: LM y=420 > CM y=350 → behind ✓
//   pathSide: LM start x=150, end x=80, mid x=115. CM x=200. Nearer touchline x=10.
//             LM dist to touchline = 115-10=105. CM dist = 200-10=190. 105<190 → outside ✓
//   endsLevelOrBeyond: LM end y=200 ≤ CM y=350 → beyond ✓
//
// Proximity check (LM path vs CM position):
//   CM stays at (200,350) for the run window. LM starts at (150,420), ends at (80,200).
//   At closest approach (sampleT≈1.05, u=0.25): dist≈69px
//   69 ≤ 250 → proximity PASSES → OVERLAP matches ✓
//
// MOV_CHECK_TO_BALL: silenced (LM run dy=-220, toward-goal)
// MOV_RUN_IN_BEHIND: LM y=420 > CM y=350 for 'up' → LM is NOT beyond CM → trigger[1] false
// → only OVERLAP fires
//
// Expected clauses:
//   1. the center back plays the central midfielder
//   2. the left midfielder overlaps
//   3. the left midfielder, continuing his run, receives from the central midfielder
// Debug: proximity minDist≈69px at sampleT≈1.05 threshold=250px
// ─────────────────────────────────────────────────────────────────────────────
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
  // LM overlap run concurrent with CM→LM pass.
  const lmRun = makeRun({ entityId: lm.id, beatId: beat.id, destination: { x: 80, y: 200 }, start: 0.8, duration: 1.0 });
  const p2    = makePass({ entityId: cm.id, beatId: beat.id, target: { entityId: lm.id }, start: 0.8, duration: 1.0 });

  doc.actions.push(p1, lmRun, p2);

  // debug: true — to see proximity minDist in OVERLAP trigger[5] note.
  printResult('Scene H — real overlap, proximity passes (FIX 3)', narrate(doc, { register: 'name', debug: true }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Scene I — MOV_UNDERLAP
// LM starts behind CM (y=420 > y=350) and makes a run to the CENTRAL/INSIDE side
// of CM (runner x increases toward center, pathSide='inside'), ending level/beyond.
//
// Layout (team A attacks 'up', goal at y=10):
//   CB  (400, 490)  — center back, starts with ball
//   CM  (200, 350)  — left-center midfielder, left of center (nearerTouchline=x=10)
//   LM  (250, 420)  — left midfielder — RIGHT of CM (central side of CM = inside)
//
// pathSide 'inside' check:
//   CM x=200, nearerTouchline=10, tmDistToTouchline=190
//   LM mid x=(250+280)/2=265. distToTouchline=|265-10|=255. 255>190 → NOT outside → inside ✓
//
// Timeline:
//   t=0.0 d=0.8: CB→CM pass (CM has ball at t=0.8)
//   t=0.8 d=1.0: LM run (250,420)→(280,200) concurrent with CM→LM pass (run-meets-pass)
//   t=0.8 d=1.0: CM→LM pass delivers into LM's run
//
// Underlap geometry (carrier = CM via in-flight-passer):
//   startsBehind: LM y=420 > CM y=350 → behind ✓
//   pathSide: mid x=265, CM x=200, nearerTouchline=10;
//             distRunner=255 > distCM=190 → inside ✓
//   endsLevelOrBeyond: LM end y=200 ≤ CM y=350 → beyond ✓
//   proximity: dist at start √((250-200)²+(420-350)²)≈86px ≤ 250px ✓
//
// Expected clauses:
//   1. the center back plays the central midfielder
//   2. the left midfielder underlaps
//   3. the left midfielder, continuing his run, receives from the central midfielder
// ─────────────────────────────────────────────────────────────────────────────
{
  const beat = makeBeat({ order: 0 });
  const doc = createEmptyDocument({ name: 'Scene I — underlap' });
  doc.beats.push(beat);
  doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

  const cb   = makePlayer({ team: 'A', initial: { x: 400, y: 490 }, display: { positionId: 'CB' } });
  const cm   = makePlayer({ team: 'A', initial: { x: 200, y: 350 }, display: { positionId: 'CM' } });
  // LM is to the RIGHT (central side) of CM — makes the run more central = inside
  const lm   = makePlayer({ team: 'A', initial: { x: 250, y: 420 }, display: { positionId: 'LM' } });
  const ball = makeBall({ initial: { x: 400, y: 490 } });

  doc.entities.push(cb, cm, lm, ball);

  const p1    = makePass({ entityId: cb.id, beatId: beat.id, target: { entityId: cm.id }, start: 0.0, duration: 0.8 });
  // LM cuts inside (central side of CM), concurrent with CM→LM pass.
  const lmRun = makeRun({ entityId: lm.id, beatId: beat.id, destination: { x: 280, y: 200 }, start: 0.8, duration: 1.0 });
  const p2    = makePass({ entityId: cm.id, beatId: beat.id, target: { entityId: lm.id }, start: 0.8, duration: 1.0 });

  doc.actions.push(p1, lmRun, p2);

  printResult('Scene I — underlap (MOV_UNDERLAP)', narrate(doc, { register: 'name', debug: true }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Scene J — MOV_THIRD_MAN_RUN
// CB→LM pass (A→B) is in flight while AM (P = third man) starts a run.
// AM is neither A nor B. LM then delivers to AM (B→P), resolving the lifecycle.
//
// Layout (team A attacks 'up', goal at y=10):
//   CB  (400, 490)  — center back (A), starts with ball
//   LM  (150, 360)  — left midfielder (B), receives from CB
//   AM  (300, 280)  — attacking midfielder (P), the third man
//
// Timeline:
//   t=0.0 d=0.8: CB→LM pass (A→B, in-flight [0.0, 0.8])
//   t=0.2 d=1.0: AM run (300,280)→(250,160) — starts DURING CB→LM in-flight ← third-man window
//   t=0.8 d=0.6: LM→AM pass (B→P, delivers into AM's run)
//
// Third-man trigger checks:
//   (b) CB→LM in-flight at t=0.2 ✓ (passer=CB ≠ AM, same team A)
//   (c) AM ≠ CB (passer) ≠ LM (receiver) ✓ → isThirdMan=true
//   (d) AM run: dist=√(50²+120²)≈130px ≥ 30px ✓
//   silence(s1): LM next pass after t=0.2 is LM→AM (target=AM ≠ CB) → no bounce-back ✓
//
// Expected clauses:
//   1. the center back plays the left midfielder
//   2. the attacking midfielder makes a third-man run
//   3. the attacking midfielder, continuing his run, receives from the left midfielder
// ─────────────────────────────────────────────────────────────────────────────
{
  const beat = makeBeat({ order: 0 });
  const doc = createEmptyDocument({ name: 'Scene J — third-man run' });
  doc.beats.push(beat);
  doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

  const cb   = makePlayer({ team: 'A', initial: { x: 400, y: 490 }, display: { positionId: 'CB'  } });
  const lm   = makePlayer({ team: 'A', initial: { x: 150, y: 360 }, display: { positionId: 'LM'  } });
  const am   = makePlayer({ team: 'A', initial: { x: 300, y: 280 }, display: { positionId: 'CAM' } });
  const ball = makeBall({ initial: { x: 400, y: 490 } });

  doc.entities.push(cb, lm, am, ball);

  const p1    = makePass({ entityId: cb.id, beatId: beat.id, target: { entityId: lm.id }, start: 0.0, duration: 0.8 });
  // AM starts running while CB→LM is still in flight (t=0.2 < 0.8 = pass end)
  const amRun = makeRun({ entityId: am.id, beatId: beat.id, destination: { x: 250, y: 160 }, start: 0.2, duration: 1.0 });
  // LM delivers to AM — the third-man lifecycle resolution
  const p2    = makePass({ entityId: lm.id, beatId: beat.id, target: { entityId: am.id }, start: 0.8, duration: 0.6 });

  doc.actions.push(p1, amRun, p2);

  printResult('Scene J — third-man run (MOV_THIRD_MAN_RUN)', narrate(doc, { register: 'name', debug: true }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Scene K — ACT_ONE_TWO
// LB plays to CM (A→B), LB immediately advances forward, CM returns immediately (B→A).
// ACT_ONE_TWO fires on the return pass (CM→LB).
//
// Layout (team A attacks 'up', goal at y=10):
//   LB  (150, 420)  — left back (A), starts with ball
//   CM  (250, 350)  — central midfielder (B)
//
// Timeline:
//   t=0.0 d=0.5: LB→CM pass (A→B). Ends t=0.5.
//   t=0.5 d=0.6: LB run (150,420)→(160,340) — LB advances after playing (y: 420→340)
//   t=0.5 d=0.4: CM→LB pass (B→A return). Ends t=0.9.
//
// One-two trigger checks (on CM→LB pass):
//   A = LB (target), B = CM (passer of return)
//   (b) first-leg: LB→CM ended at t=0.5, return starts at t=0.5; gap=0.0 ≤ 4.0s ✓
//   (c) B's control window: 0.5 - 0.5 = 0.0s ≤ 1.5s ✓
//   (d) LB advance: pos0 at firstLeg.start=0.0: (150,420). pos1 at returnEnd=0.9:
//       LB run [0.5,1.1], at t=0.9: u=(0.9-0.5)/0.6=0.67; y=420-0.67*80≈366.
//       advance = 420-366 = 54px ≥ 20px ✓
//
// Expected clauses:
//   1. the left back plays the central midfielder
//   2. the left back runs  (run clause, since the run fires — but wait, what term fires?)
//      Actually: LB run goes from y=420 to y=340 → runVector: dy=-80 → fc=1.0 → 'toward-goal'.
//      beyondFurthestTeammate at t=0.5: CM y=350 < LB y=420 → LB NOT beyond CM (CM is closer to goal). False.
//      So MOV_RUN_IN_BEHIND fails. CHECK_TO_BALL: LB run → runVector=toward-goal → silenced.
//      DROP_IN: runVector=toward-goal ≠ away → fails. OVERLAP: no carrier (no pass to LB in flight at t=0.5).
//      Actually wait — CM→LB IS in flight at t=0.5 (it starts at t=0.5), but the run also starts at t=0.5.
//      resolveOverlapCarrier would find CM as in-flight-passer. But startsBehind: LB y=420 > CM y=350 → behind ✓.
//      pathSide: LB mid x=155, CM x=250, nearerTouchline x=10; |155-10|=145 < |250-10|=240 → outside ✓.
//      endsLevelOrBeyond: LB end y=340 ≤ CM y=350 → beyond ✓.
//      proximity: dist at start = √((150-250)²+(420-350)²)=√(10000+4900)≈122px ≤ 250px ✓.
//      So MOV_OVERLAP WOULD fire on LB's run! That means we get an overlap clause too.
//
// Hmm, this is a problem. To avoid the overlap, I need to ensure the overlap conditions fail.
// Let me redesign so LB runs to the OTHER side of CM (inside run) or fails proximity/startsBehind.
// Easiest fix: make LB's run destination go to x=350 (same x as CM or inside it), making pathSide='inside'
// or 'neither', so overlap fails but underlap or nothing fires.
//
// Actually: if I put CM at x=350 (right of center, nearerTouchline=x=790):
//   LB runs from (150,420) to (160,340).
//   pathSide: mid x=155. CM x=350. nearerTouchline=790. |155-790|=635 < |350-790|=440 → 635 > 440 → inside.
//   Wait: |155-790|=635, |350-790|=440. 635 < 440? No, 635 > 440 → NOT outside → inside.
//   And underlap: pathSide=inside ✓. But startsBehind: LB y=420 > CM y=350 → behind ✓.
//   endsLevelOrBeyond: LB end y=340 ≤ CM y=350 → beyond ✓.
//   proximity: √((155-350)²+(380-350)²)≈√(38025+900)≈197px ≤ 250px → MOV_UNDERLAP fires!
//
// Even more problems. The simplest approach: make LB run AFTER the one-two return is complete
// (so no in-flight pass context), and make the run go sideways (lateral), so no overlap/underlap.
// Or just ensure the run doesn't match overlap: if LB is to the right of CM (and CM is left of center),
// the runner would be on the INSIDE. But we don't have an underlap claim if we use a unique design.
//
// Simplest redesign: no explicit run for LB. Just use a CB→LB hold sequence.
// LB "advances" is checked by resolvePosition at the time the pass fires, not necessarily via a RunAction.
// The one-two trigger (d) checks resolvePosition(aId, returnEnd) vs resolvePosition(aId, firstLeg.start).
// If LB doesn't have a run, LB stays at initial.y throughout → advance = 0 → trigger fails.
//
// So I DO need LB to run. Let me use a run that's clearly not an overlap:
// LB runs AWAY from goal first (to pick up the ball lower), then… no, that fails trigger (d).
// Actually: have LB run forward (y decreasing) but make overlap fail via startsBehind.
//
// Key insight: if LB starts at y=420 and CM is at y=300 (CM is MORE advanced), then startsBehind=true
// and overlap could still fire. Need CM to be more advanced than LB by less than LB's end position...
// Actually if LB ends at y=340 and CM is at y=300, then endsLevelOrBeyond: 340 > 300 → NOT beyond → fails (c)!
//
// Let me set: CM at (250, 300). LB runs from (150,420) to (160,360).
// endsLevelOrBeyond: LB end y=360 > CM y=300 → 360 ≤ 300? No → beyond=false → OVERLAP fails on (e)! ✓
// advance: from y=420 to ~y=400 at returnEnd → advance=20px → borderline.
//
// Better: CM at (250, 280). LB runs to (160,340).
// endsLevelOrBeyond: LB end y=340 > CM y=280 → beyond=false → OVERLAP fails ✓
// advance: 420-340=80px ≥ 20px ✓
// One-two fires on return, overlap does NOT fire on LB run.
// LB run: runVector: dy=-80 → toward-goal. beyondFurthestTeammate at t=0.5: CM y=280 < LB y=420 → LB NOT beyond CM. False. ✓ RUN_IN_BEHIND fails.
// DROP_IN: toward-goal run → (c) runVector='toward-goal' ≠ 'away' → fails ✓
// CHECK_TO_BALL: toward-goal run → silenced ✓
//
// So with CM at y=280: NO run term fires on LB's run. OVERLAP fails at (e) because LB end y=340 > CM y=280.
// But wait — what about ACT_THROUGH_BALL on the CM→LB return pass?
// through-ball trigger (c): receiver (LB) has active toward-goal run at pass.start=0.5?
// LB run [0.5, 1.1] starts at 0.5 (active AT pass.start). runVector='toward-goal'. Yes!
// through-ball trigger (d): beyondFurthestTeammate(LB, passEnd=0.9, 'up')?
// LB at t=0.9: ~y=396. CM at y=280. 280 < 396 → LB NOT beyond CM → beyondFurthestTeammate=false.
// So through-ball fails (d) ✓.
//
// What about ACT_ONE_TWO vs ACT_THROUGH_BALL on the CM→LB return pass?
// Both are pass terms. Through-ball fails (d). One-two fires. ✓ Clean.
//
// Expected output with CM at (250, 280), LB run (150,420)→(160,340):
//   1. the left back plays the central midfielder   ← first pass LB→CM, no reception context
//   2. the central midfielder plays a one-two with the left back   ← ACT_ONE_TWO on CM→LB return
// (LB run is SILENT — no term fires on it)
// ─────────────────────────────────────────────────────────────────────────────
{
  const beat = makeBeat({ order: 0 });
  const doc = createEmptyDocument({ name: 'Scene K — one-two' });
  doc.beats.push(beat);
  doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

  // CM is at y=280 (more advanced than LB y=420). LB run ends at y=340 — NOT beyond CM (340 > 280),
  // so MOV_OVERLAP fails on (e). ACT_ONE_TWO fires on the return pass.
  const lb   = makePlayer({ team: 'A', initial: { x: 150, y: 420 }, display: { positionId: 'LB' } });
  const cm   = makePlayer({ team: 'A', initial: { x: 250, y: 280 }, display: { positionId: 'CM' } });
  const ball = makeBall({ initial: { x: 150, y: 420 } }); // LB has ball

  doc.entities.push(lb, cm, ball);

  // LB plays to CM, immediately advances; CM returns immediately.
  const p1    = makePass({ entityId: lb.id, beatId: beat.id, target: { entityId: cm.id }, start: 0.0, duration: 0.5 });
  const lbRun = makeRun({ entityId: lb.id, beatId: beat.id, destination: { x: 160, y: 340 }, start: 0.5, duration: 0.6 });
  // CM returns immediately — control window = 0.5 - 0.5 = 0.0s ≤ 1.5s ✓
  const p2    = makePass({ entityId: cm.id, beatId: beat.id, target: { entityId: lb.id }, start: 0.5, duration: 0.4 });

  doc.actions.push(p1, lbRun, p2);

  printResult('Scene K — one-two (ACT_ONE_TWO)', narrate(doc, { register: 'name', debug: true }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Scene L — ACT_SWITCH_PLAY
// CB plays a long diagonal pass from the left channel to the right channel,
// switching the point of attack across the full width of the pitch.
//
// Layout (team A attacks 'up', goal at y=10):
//   CB  (150, 450)  — center back, starts with ball (left channel: x=150, fp≈0.18 ≤ 0.25)
//   RB  (650, 400)  — right back, receives (right channel: x=650, fp≈0.82 ≥ 0.75)
//
// Switch trigger checks:
//   (a) pass with player receiver ✓
//   (b) length: √((650-150)²+(400-450)²)=√(250000+2500)≈502px ≥ 260px ✓
//   (c) senderBand: fp=(150-10)/780≈0.18 ≤ 0.25 → 'left'
//       receiverBand: fp=(650-10)/780≈0.82 ≥ 0.75 → 'right' → crosses ✓
//
// Expected clauses:
//   1. the center back switches the play to the right back
// ─────────────────────────────────────────────────────────────────────────────
{
  const beat = makeBeat({ order: 0 });
  const doc = createEmptyDocument({ name: 'Scene L — switch play' });
  doc.beats.push(beat);
  doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

  const cb   = makePlayer({ team: 'A', initial: { x: 150, y: 450 }, display: { positionId: 'CB' } });
  const rb   = makePlayer({ team: 'A', initial: { x: 650, y: 400 }, display: { positionId: 'RB' } });
  const ball = makeBall({ initial: { x: 150, y: 450 } }); // CB has ball

  doc.entities.push(cb, rb, ball);

  // CB switches the ball across the field to RB — long diagonal.
  const p1 = makePass({ entityId: cb.id, beatId: beat.id, target: { entityId: rb.id }, start: 0.0, duration: 1.0 });

  doc.actions.push(p1);

  printResult('Scene L — switch play (ACT_SWITCH_PLAY)', narrate(doc, { register: 'name', debug: true }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Scene M — ACT_THROUGH_BALL + MOV_RUN_IN_BEHIND (composed)
// ST runs in behind while CM plays a through ball into that run.
// Both terms fire: MOV_RUN_IN_BEHIND on the run, ACT_THROUGH_BALL on the pass.
// narrate.ts composes: run clause + "plays [receiver] through, continuing his run".
//
// Layout (team A attacks 'up', goal at y=10):
//   CM  (400, 320)  — central midfielder, has ball initially
//   ST  (400, 200)  — striker, makes run in behind
//
// Timeline:
//   t=0.0 d=1.0: ST run (400,200)→(380,60) — toward goal, toward box, in behind
//   t=0.5 d=0.8: CM→ST pass (forward, delivers into ST's run)
//
// MOV_RUN_IN_BEHIND checks on ST run:
//   (a) runVector: ST(400,200)→(380,60): dy=-140, fc≈0.98 → 'toward-goal' ✓
//   (b) beyondFurthestTeammate at t=0.0: only ST and CM. CM y=320, ST y=200.
//       For 'up': further from goal = higher y. CM y=320 > ST y=200 → CM is behind ST?
//       Actually: for 'up' attacking direction, MORE advanced = LOWER y (closer to y=10).
//       beyondFurthestTeammate: returns true if player is MORE advanced than ALL teammates.
//       ST at y=200. CM at y=320. For 'up': tp.y <= pp.y → is CM y=320 ≤ ST y=200? No (320>200).
//       So CM is NOT more advanced than ST → ST IS beyond furthest teammate ✓
//   (c) towardBox: ST destination (380,60). x∈[250,550] ✓. y=60 ≤ 90 (TOP_BOX_Y_MAX) ✓
//
// ACT_THROUGH_BALL checks on CM→ST pass:
//   (a) pass with player receiver ✓
//   (b) passDirection: CM(400,320)→ST(400,200 at pass end? actually ST moves):
//       at pass.end (t=1.3): ST at (400,200)+(0.8/1.0)*(380-400, 60-200)=(400-16, 200-112)=(384,88)
//       classifyPassDirection(400,320, 384,88): dy=-232, dx=-16 → fc=232/232.6≈0.997 → 'forward' ✓
//   (c) active toward-goal run at pass.start=0.5: ST run [0.0,1.0] active ✓. runVector='toward-goal' ✓
//   (d) beyondFurthestTeammate(ST, passEnd=1.3): ST at t=1.3: (400,200)+(1.0/1.0)*(380-400,60-200)=(380,60).
//       CM at t=1.3: (400,320) (no run). tp.y=320 ≤ pp.y=60? No → ST IS beyond ✓
//
// Expected clauses:
//   1. the striker runs in behind
//   2. the central midfielder plays the striker through, continuing his run
// ─────────────────────────────────────────────────────────────────────────────
{
  const beat = makeBeat({ order: 0 });
  const doc = createEmptyDocument({ name: 'Scene M — through ball (composed)' });
  doc.beats.push(beat);
  doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

  const cm   = makePlayer({ team: 'A', initial: { x: 400, y: 320 }, display: { positionId: 'CM' } });
  const st   = makePlayer({ team: 'A', initial: { x: 400, y: 200 }, display: { positionId: 'ST' } });
  const ball = makeBall({ initial: { x: 400, y: 320 } }); // CM has ball

  doc.entities.push(cm, st, ball);

  const stRun = makeRun({ entityId: st.id, beatId: beat.id, destination: { x: 380, y: 60 }, start: 0.0, duration: 1.0 });
  const p1    = makePass({ entityId: cm.id, beatId: beat.id, target: { entityId: st.id }, start: 0.5, duration: 0.8 });

  doc.actions.push(stRun, p1);

  printResult('Scene M — through ball + run in behind (composed)', narrate(doc, { register: 'name', debug: true }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Scene N — MOV_DROP_IN
// ST (forward line) drops away from goal into midfield space while CM has the ball.
// Only the drop-in run fires; the CM→ST pass follows as a standard reception clause.
//
// Layout (team A attacks 'up', goal at y=10):
//   CM  (400, 320)  — central midfielder, has ball
//   ST  (400, 180)  — striker, drops back into space
//
// ST run analysis:
//   (a) run action ✓, attackDir='up' ✓
//   (b) actorLine(ST): positionId='ST' → roleToLine('ST') → 'forward' ✓
//   (c) runVector: ST(400,180)→(400,320): dy=+140, fc=-0.98 → 'away' ✓
//   (d) deeperEnd: for 'up', endY=320 > startY=180 → deeper ✓
//   (e) distanceToBallTrend: ST moves away from CM (ball at CM). d0=|180-320|=140. d1=|320-320|=0.
//       wait — CM has ball, and after the pass is in flight…
//       Actually the run is [0.0, 0.8] and the CM→ST pass is [0.5, 1.1]. Ball at CM until t=0.5.
//       t0=0.0: ST at (400,180). Ball (owned by CM) at (400,288) (perimeter offset: ownedBallPos CM).
//             d0=√(0²+(180-288)²)=108px.
//       t1=0.8: ST at (400,320). Ball in-flight [0.5,1.1], ease(0.5)≈0.5: ball≈(400,204).
//             d1=√(0²+(320-204)²)=116px. delta=+8px → 'flat' (FLAT_MARGIN_PX=10). → NOT 'closing' ✓
//       So distanceToBallTrend ≠ 'closing' ✓
//   (f) distance: √((400-400)²+(320-180)²)=140px ≥ 30px ✓
//
// Expected clauses:
//   1. the striker drops in
//   2. the central midfielder plays the striker   ← standard pass clause; CM→ST
// ─────────────────────────────────────────────────────────────────────────────
{
  const beat = makeBeat({ order: 0 });
  const doc = createEmptyDocument({ name: 'Scene N — drop-in' });
  doc.beats.push(beat);
  doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

  const cm   = makePlayer({ team: 'A', initial: { x: 400, y: 320 }, display: { positionId: 'CM' } });
  const st   = makePlayer({ team: 'A', initial: { x: 400, y: 180 }, display: { positionId: 'ST' } });
  const ball = makeBall({ initial: { x: 400, y: 320 } }); // CM has ball

  doc.entities.push(cm, st, ball);

  // ST drops from y=180 to y=320 — away from goal, into midfield space.
  const stRun = makeRun({ entityId: st.id, beatId: beat.id, destination: { x: 400, y: 320 }, start: 0.0, duration: 0.8 });
  const p1    = makePass({ entityId: cm.id, beatId: beat.id, target: { entityId: st.id }, start: 0.5, duration: 0.6 });

  doc.actions.push(stRun, p1);

  printResult('Scene N — drop-in (MOV_DROP_IN)', narrate(doc, { register: 'name', debug: true }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Scene O — the coach's cross scene: one-two, carry, cross into the box, shot.
//
// "LM plays CM, one-two return, LM carries down the left line, ST runs into the
//  box, LM's delivery meets him, ST shoots. NO underlap anywhere."
//
// Layout (team A attacks 'up', goal at y=10):
//   LM  (100, 320)  — left midfielder, has ball
//   CM  (300, 220)  — central midfielder, more advanced + central
//   ST  (400, 200)  — striker
//
// ACT_ONE_TWO (fires on p2, the return CM→LM):
//   B=CM, A=LM. first-leg A→B (p1) ends at 0.6 = p2.start → gap=0 ≤ ONE_TWO_TIME_WINDOW=4.0 ✓
//   controlWindow = 0.0 ≤ 1.5s ✓
//   A advance: LM at p1.start=(100,320); LM at p2.end=t=1.0=(100,280) (from lmFwdRun).
//   advance = 320-280 = 40px ≥ ONE_TWO_ADVANCE_PX=20 ✓
//
// lmFwdRun (t=0.0, d=1.0): LM(100,320)→(100,280) — forward run during the one-two.
//   runVector=toward-goal → MOV_CHECK_TO_BALL silenced (s1) ✓
//   MOV_RUN_IN_BEHIND: beyondFurthestTeammate(LM, t=1.0)=false (ST y=200 < LM y=280) ✓
//   → lmFwdRun is SILENT ✓
//
// Carry (t=1.0, d=1.5): LM(100,280)→(100,100) — LM runs the ball down the left line.
//   "the left midfielder carries forward" ✓
//
// ACT_CROSS (fires on p3, LM→ST):
//   (b) LM at (100,100): ap=(590-100)/580≈0.845 → attacking_third ✓;
//       fp=(100-10)/780≈0.115 ≤ 0.25 → wide_area_left ✓
//   (c) ST at p3.end=t=3.5: stRun (t=2.0,d=1.5) end=(400,60). x=400∈[250,550] ✓, y=60≤90 ✓
//   (s1) passDir: LM(100,100)→ST(400,60): dx=300,dy=-40. fc=40/302≈0.13 → square (not backward) ✓
//   Specificity 28 > ACT_THROUGH_BALL 25 (also fires: receiver has toward-goal run + beyond ✓)
//
// MOV_RUN_IN_BEHIND (fires on stRun):
//   runVector=toward-goal ✓; beyondFurthestTeammate at p3.end=3.5:
//   LM at (100,100), CM at (300,220). ST y=60 < LM y=100 < CM y=220 → ST is furthest ✓
//   towardBox: (400,60) → x∈[250,550] ✓, y≤90 ✓
//   → "the striker runs in behind"; lifecycle resolves to p3 (ACT_CROSS)
//
// MOV_UNDERLAP does NOT fire on stRun:
//   proximity: runner ST(400,200), carrier LM(100,159) at t=2.0 → dist≈302px > 160px ✗
//   box-end silence (s2): stRun ends at (400,60) — inside box ✗ (belt+suspenders)
//
// Narration (ACT_CROSS + lifecycle):
//   isCross=true, resolvedRun=MOV_RUN_IN_BEHIND
//   → "the striker meets the cross from the left midfielder" (not "continuing his run")
//
// Expected clauses:
//   1. the left midfielder plays the central midfielder   ← p1 (standard, first clause)
//   2. the central midfielder plays a one-two with the left midfielder  ← p2 + ACT_ONE_TWO
//   3. the left midfielder carries forward                ← carry
//   4. the striker runs in behind                        ← stRun + MOV_RUN_IN_BEHIND
//   5. the striker meets the cross from the left midfielder  ← p3 + ACT_CROSS + lifecycle
//   6. the striker shoots                                ← p4
// ─────────────────────────────────────────────────────────────────────────────
{
  const beat = makeBeat({ order: 0 });
  const doc  = createEmptyDocument({ name: 'Scene O — cross' });
  doc.beats.push(beat);
  doc.frame.teams = [{ id: 'A', color: '#FFD700', attackingDirection: 'up', directionSource: 'derived' }];

  const lm   = makePlayer({ team: 'A', initial: { x: 100, y: 320 }, display: { positionId: 'LM'  } });
  const cm   = makePlayer({ team: 'A', initial: { x: 300, y: 220 }, display: { positionId: 'CM'  } });
  const st   = makePlayer({ team: 'A', initial: { x: 400, y: 200 }, display: { positionId: 'ST'  } });
  const ball = makeBall({ initial: { x: 100, y: 320 } }); // LM has ball

  doc.entities.push(lm, cm, st, ball);

  // LM runs forward during the one-two exchange.
  const lmFwdRun = makeRun({ entityId: lm.id, beatId: beat.id, destination: { x: 100, y: 280 }, start: 0.0, duration: 1.0 });
  // First leg: LM→CM
  const p1       = makePass({ entityId: lm.id, beatId: beat.id, target: { entityId: cm.id }, start: 0.0, duration: 0.6 });
  // Return: CM→LM (immediately; controlWindow=0) → ACT_ONE_TWO fires
  const p2       = makePass({ entityId: cm.id, beatId: beat.id, target: { entityId: lm.id }, start: 0.6, duration: 0.4 });
  // LM carries down the left line to the byline area.
  const carry    = makeCarry({ entityId: lm.id, beatId: beat.id, destination: { x: 100, y: 100 }, start: 1.0, duration: 1.5 });
  // ST runs into the box.
  const stRun    = makeRun({ entityId: st.id, beatId: beat.id, destination: { x: 400, y: 60  }, start: 2.0, duration: 1.5 });
  // LM crosses from wide area — ACT_CROSS fires; ST in box at delivery.
  const p3       = makePass({ entityId: lm.id, beatId: beat.id, target: { entityId: st.id }, start: 2.5, duration: 1.0 });

  doc.actions.push(lmFwdRun, p1, p2, carry, stRun, p3);

  const topGoal = doc.entities.find(e => e.kind === 'goal' && e.initial.y < 300);
  if (topGoal) {
    const shot = makePass({ entityId: st.id, beatId: beat.id, target: { entityId: topGoal.id }, start: 3.5, duration: 0.4 });
    doc.actions.push(shot);
  }

  printResult('Scene O — cross (ACT_CROSS)', narrate(doc, { register: 'name', debug: true }));
}
