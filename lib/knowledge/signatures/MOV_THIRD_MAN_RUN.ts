// MOV_THIRD_MAN_RUN — player P runs while pass A→B is in flight; P is neither the
// passer (A) nor the receiver (B); the next pass B→P delivers the ball to P's run.
//
// The "third man" in the combination is the player who makes a run while play goes
// through two other teammates — a classic 3-man combination. The run is detected at
// the time of the run action; the delivering pass (B→P) resolves the lifecycle.
//
// Predicate translation:
//   trigger (action = run):
//     (a) run action + actor has an attacking direction
//     (b) at run.start, exactly one pass A→B is in flight belonging to a teammate
//         — this is the "first leg" that creates the third-man context
//     (c) actor P is neither the passer (A) nor the intended receiver (B) of that pass
//     (d) run travel distance ≥ THIRD_MAN_MIN_DISTANCE_PX (not a trivial twitch)
//
//   silence:
//     (s1) the sequence bounces back to A — the next pass from B (at any point after
//          run.start) targets A rather than P (the run was to create space, not to receive)
//
//   lifecycle: resolves when B plays P (standard resolveRunLifecycle finds it).
//
//   never-co-occurs: (none at Tier 1)

import type { TermSignature } from './matcher';
import type { RunAction, PassAction } from '../../engine/types';
import { resolvePosition } from '../../engine/resolve';

/**
 * Minimum run distance (px) for a third-man run.
 * Runs below this threshold are treated as trivial re-positioning, not purposeful third-man movement.
 */
export const THIRD_MAN_MIN_DISTANCE_PX = 30;

export const MOV_THIRD_MAN_RUN: TermSignature = {
  termId: 'mov.third_man_run',
  actor: 'any',
  trigger: [
    // (a) run action + attacking direction exists for this player's team
    (ctx) => {
      if (ctx.action.kind !== 'run') return false;
      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      if (!entity || entity.kind !== 'player') return false;
      const frameTeam = ctx.frame.teams.find(t => t.id === entity.team);
      return frameTeam?.attackingDirection != null;
    },

    // (b) a teammate's pass A→B is in flight at run.start
    (ctx) => {
      const run = ctx.action as RunAction;
      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      if (!entity || entity.kind !== 'player') return false;

      for (const a of ctx.doc.actions) {
        if (a.kind !== 'pass') continue;
        const passEnd = a.start + a.duration;
        // in-flight at run.start: pass has started but not yet arrived
        if (run.start < a.start || run.start >= passEnd) continue;
        // passer must be a teammate (not the runner)
        if (a.entityId === ctx.actorId) continue;
        const passerEntity = ctx.doc.entities.find(e => e.id === a.entityId);
        if (!passerEntity || passerEntity.kind !== 'player') continue;
        if ((passerEntity as { team?: string }).team !== entity.team) continue;
        // receiver must be a player (not a goal/zone)
        if (!('entityId' in a.target)) continue;
        ctx.debug?.(`inFlightPass passerId=${a.entityId} receiverId=${a.target.entityId} passEnd=${passEnd.toFixed(2)}`);
        return true;
      }
      return false;
    },

    // (c) actor P is neither passer A nor receiver B of the in-flight pass
    (ctx) => {
      const run = ctx.action as RunAction;
      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      if (!entity || entity.kind !== 'player') return false;

      for (const a of ctx.doc.actions) {
        if (a.kind !== 'pass') continue;
        const passEnd = a.start + a.duration;
        if (run.start < a.start || run.start >= passEnd) continue;
        if (a.entityId === ctx.actorId) continue;
        const passerEntity = ctx.doc.entities.find(e => e.id === a.entityId);
        if (!passerEntity || passerEntity.kind !== 'player') continue;
        if ((passerEntity as { team?: string }).team !== entity.team) continue;
        if (!('entityId' in a.target)) continue;

        const receiverId = a.target.entityId;
        const isThirdMan = receiverId !== ctx.actorId;
        ctx.debug?.(`isThirdMan=${isThirdMan} (passerId=${a.entityId} receiverId=${receiverId} runnerId=${ctx.actorId})`);
        return isThirdMan;
      }
      return false;
    },

    // (d) run distance is above the minimum threshold (not a trivial twitch)
    (ctx) => {
      const run = ctx.action as RunAction;
      if (!('x' in run.destination)) {
        ctx.debug?.(`distance=n/a (landmark destination)`);
        return true; // can't compute — assume valid
      }
      const start = resolvePosition(ctx.doc, run.entityId, run.start);
      const dist = Math.hypot(run.destination.x - start.x, run.destination.y - start.y);
      ctx.debug?.(`distance=${Math.round(dist)}px threshold=${THIRD_MAN_MIN_DISTANCE_PX}px`);
      return dist >= THIRD_MAN_MIN_DISTANCE_PX;
    },
  ],
  silence: [
    // (s1) the sequence bounces back to A — the pass from B (after run.start) goes
    //      back to A instead of to P, indicating this was not a third-man scenario.
    (ctx) => {
      const run = ctx.action as RunAction;
      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      if (!entity || entity.kind !== 'player') return false;

      // Find the in-flight pass A→B at run.start
      let inFlightPass: PassAction | null = null;
      for (const a of ctx.doc.actions) {
        if (a.kind !== 'pass') continue;
        const passEnd = a.start + a.duration;
        if (run.start < a.start || run.start >= passEnd) continue;
        if (a.entityId === ctx.actorId) continue;
        const passerEntity = ctx.doc.entities.find(e => e.id === a.entityId);
        if (!passerEntity || passerEntity.kind !== 'player') continue;
        if ((passerEntity as { team?: string }).team !== entity.team) continue;
        if (!('entityId' in a.target)) continue;
        if (a.target.entityId === ctx.actorId) continue;
        inFlightPass = a as PassAction;
        break;
      }
      if (!inFlightPass || !('entityId' in inFlightPass.target)) return false;

      const passerId = inFlightPass.entityId;     // A
      const receiverId = inFlightPass.target.entityId; // B

      // Find the first pass from B after run.start
      const returnPass = ctx.doc.actions
        .filter(a => a.kind === 'pass' && a.entityId === receiverId && a.start >= run.start)
        .sort((a, b) => a.start - b.start)[0];

      if (!returnPass || returnPass.kind !== 'pass') return false;
      if (!('entityId' in returnPass.target)) return false;

      const bouncesBack = returnPass.target.entityId === passerId;
      ctx.debug?.(`s1 bouncesBack=${bouncesBack} (B=${receiverId} nextPassTarget=${returnPass.target.entityId} A=${passerId})`);
      return bouncesBack;
    },
  ],
  contradictions: [],
  anchor: 'ball',
  specificity: 15,
  phrase: {
    primary: 'makes a third-man run',
    variants: ['runs as the third man', 'makes a run as the third man'],
  },
};
