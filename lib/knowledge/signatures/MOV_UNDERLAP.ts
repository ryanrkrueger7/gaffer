// MOV_UNDERLAP — mirror of MOV_OVERLAP with pathSide = 'inside'.
// The runner starts behind a teammate with the ball, cuts to the CENTRAL side of
// that teammate, and ends level or beyond — the classic underlapping run.
//
// Shares resolveOverlapCarrier, findLevelCrossing, and OVERLAP_LATERAL_GAP_PX with
// MOV_OVERLAP. pathSide='inside' is the only predicate that differs from overlap.
//
// Predicate translation:
//   trigger (action = run):
//     (a) run action + team has a known attacking direction
//     (b) ownership window: teammate possession context over [run.start, run.end]
//         (same window scan as MOV_OVERLAP: owner or in-flight-passer)
//     (c) startsBehind: runner begins closer to own goal than the ball-carrier
//     (d) pathSide 'inside': runner cuts to the CENTRAL side of the carrier
//         (bezier-aware — uses all path samples, not just midpoint)
//     (e) endsLevelOrBeyond: runner ends at the same depth as or beyond the carrier
//     (f) level-crossing gate: at t*, |runnerX(t*) − carrierX(t*)| <= OVERLAP_LATERAL_GAP_PX
//         AND runner on INTERIOR side of carrier at t*
//
//   silence:
//     (s1) carrier plays a FORWARD pass (not to the runner) before the runner overtakes.
//     (s2) run end is inside the penalty box — into-the-box runs are box runs, not underlaps.
//          Dictionary: underlap ends "into the half-space." A striker cutting in from
//          wide and ending in the box would fire as a box run (ACT_CROSS lifecycle),
//          not an underlap. Box-end silence is NOT mirrored onto MOV_OVERLAP because
//          an overlap runner travels on the touchline side (pathSide='outside'), placing
//          them in x < BOX_X_MIN or x > BOX_X_MAX — outside the box by construction.
//
//   never-co-occurs (contradictions):
//     MOV_OVERLAP at player-beat scope — mutually exclusive by pathSide construction.

import type { TermSignature } from './matcher';
import type { RunAction } from '../../engine/types';
import { resolvePosition } from '../../engine/resolve';
import {
  startsBehind,
  pathSide,
  endsLevelOrBeyond,
  BOX_X_MIN,
  BOX_X_MAX,
  TOP_BOX_Y_MAX,
  BOTTOM_BOX_Y_MIN,
} from '../primitives';
import { classifyPassDirection } from '../passDirection';
import {
  resolveOverlapCarrier,
  findLevelCrossing,
  OVERLAP_LATERAL_GAP_PX,
} from './MOV_OVERLAP';

export const MOV_UNDERLAP: TermSignature = {
  termId: 'mov.underlap',
  actor: 'any',
  trigger: [
    // (a) run action + team has a known attacking direction
    (ctx) => {
      if (ctx.action.kind !== 'run') return false;
      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      if (!entity || entity.kind !== 'player') return false;
      const frameTeam = ctx.frame.teams.find(t => t.id === entity.team);
      return frameTeam?.attackingDirection != null;
    },

    // (b) ownership window: teammate possession context exists at some t in [run.start, run.end]
    (ctx) => {
      const run = ctx.action as RunAction;
      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      const found = resolveOverlapCarrier(
        ctx.doc, run, ctx.actorId, (entity as { team?: string } | undefined)?.team,
      );
      ctx.debug?.(`carrierId=${found?.carrierId ?? 'null'} sampleT=${found ? found.sampleT.toFixed(2) : 'n/a'} carrierVia=${found?.carrierVia ?? 'n/a'}`);
      return found !== null;
    },

    // (c) runner starts behind the carrier on the attack axis
    (ctx) => {
      const run = ctx.action as RunAction;
      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      const frameTeam = ctx.frame.teams.find(t => t.id === (entity as { team?: string } | undefined)?.team)!;
      const attackDir = frameTeam.attackingDirection!;
      const found = resolveOverlapCarrier(
        ctx.doc, run, ctx.actorId, (entity as { team?: string } | undefined)?.team,
      );
      if (!found) return false;
      const behind = startsBehind(ctx.doc, ctx.actorId, found.carrierId, run.start, attackDir);
      ctx.debug?.(`startsBehind=${behind} attackDir=${attackDir}`);
      return behind;
    },

    // (d) runner's path is on the INSIDE (central side) of the carrier — the underlap path
    (ctx) => {
      const run = ctx.action as RunAction;
      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      const found = resolveOverlapCarrier(
        ctx.doc, run, ctx.actorId, (entity as { team?: string } | undefined)?.team,
      );
      if (!found) return false;
      const side = pathSide(ctx.doc, run, found.carrierId);
      ctx.debug?.(`pathSide=${side} runPathType=${run.path.type}`);
      return side === 'inside';
    },

    // (e) runner ends level or beyond the carrier on the attack axis
    (ctx) => {
      const run = ctx.action as RunAction;
      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      const frameTeam = ctx.frame.teams.find(t => t.id === (entity as { team?: string } | undefined)?.team)!;
      const attackDir = frameTeam.attackingDirection!;
      const found = resolveOverlapCarrier(
        ctx.doc, run, ctx.actorId, (entity as { team?: string } | undefined)?.team,
      );
      if (!found) return false;
      const beyond = endsLevelOrBeyond(ctx.doc, run, found.carrierId, attackDir);
      ctx.debug?.(`endsLevelOrBeyond=${beyond}`);
      return beyond;
    },

    // (f) level-crossing gate: at t* where runner's attack-axis progress crosses the
    //     carrier's, require:
    //       (i)  |runnerX(t*) − carrierX(t*)| <= OVERLAP_LATERAL_GAP_PX (lateral close)
    //       (ii) runner on INTERIOR side of carrier at t*               (cuts inside)
    (ctx) => {
      const run = ctx.action as RunAction;
      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      const frameTeam = ctx.frame.teams.find(t => t.id === (entity as { team?: string } | undefined)?.team)!;
      const attackDir = frameTeam.attackingDirection!;
      const found = resolveOverlapCarrier(
        ctx.doc, run, ctx.actorId, (entity as { team?: string } | undefined)?.team,
      );
      if (!found) return false;

      const runnerStart = resolvePosition(ctx.doc, run.entityId, run.start);
      const runnerEnd: { x: number; y: number } = 'x' in run.destination
        ? { x: run.destination.x, y: run.destination.y }
        : resolvePosition(ctx.doc, run.entityId, run.start + run.duration);

      const crossing = findLevelCrossing(
        ctx.doc, run, found.carrierId, attackDir, runnerStart, runnerEnd,
      );
      if (!crossing) {
        ctx.debug?.(`levelCrossing: no t* (runner never reaches carrier level)`);
        return false;
      }

      const { tStar, lateralDist, isOutside } = crossing;
      ctx.debug?.(`levelCrossing tStar=${tStar.toFixed(2)} lateralDist=${Math.round(lateralDist)}px threshold=${OVERLAP_LATERAL_GAP_PX}px outside=${isOutside}`);
      return lateralDist <= OVERLAP_LATERAL_GAP_PX && !isOutside; // interior side for underlap
    },
  ],
  silence: [
    // (s1) Carrier plays a forward pass to someone other than the runner before run ends.
    (ctx) => {
      if (ctx.action.kind !== 'run') return false;
      const run = ctx.action as RunAction;
      const runEnd = run.start + run.duration;

      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      if (!entity || entity.kind !== 'player') return false;
      const frameTeam = ctx.frame.teams.find(t => t.id === entity.team);
      const attackDir = frameTeam?.attackingDirection;
      if (!attackDir) return false;

      const found = resolveOverlapCarrier(ctx.doc, run, ctx.actorId, entity.team);
      if (!found) return false;
      const ownerId = found.carrierId;

      for (const a of ctx.doc.actions) {
        if (a.kind !== 'pass') continue;
        if (a.entityId !== ownerId) continue;
        if (a.start >= runEnd) continue;
        if (!('entityId' in a.target)) continue;
        if (a.target.entityId === ctx.actorId) continue;

        const pp = resolvePosition(ctx.doc, a.entityId, a.start);
        const rp = resolvePosition(ctx.doc, a.target.entityId, a.start + a.duration);
        const dir = classifyPassDirection(pp.x, pp.y, rp.x, rp.y, attackDir);
        if (dir === 'forward') return true;
      }
      return false;
    },

    // (s2) Run end is inside the penalty box — into-the-box runs are box runs, not underlaps.
    //      Dictionary: underlap ends "into the half-space."
    (ctx) => {
      const run = ctx.action as RunAction;
      if (!('x' in run.destination)) return false; // landmark — can't evaluate

      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      const frameTeam = ctx.frame.teams.find(t => t.id === (entity as { team?: string } | undefined)?.team);
      const attackDir = frameTeam?.attackingDirection;
      if (!attackDir) return false;

      const { x: endX, y: endY } = run.destination;
      const inBox = endX >= BOX_X_MIN && endX <= BOX_X_MAX &&
        (attackDir === 'up' ? endY <= TOP_BOX_Y_MAX : endY >= BOTTOM_BOX_Y_MIN);
      ctx.debug?.(`s2 endsInBox=${inBox} endX=${Math.round(endX)} endY=${Math.round(endY)}`);
      return inBox;
    },
  ],
  contradictions: [
    { termId: 'mov.overlap', scope: 'player-beat' },
  ],
  anchor: 'teammate',
  specificity: 30,
  phrase: {
    primary: 'underlaps',
    variants: ['makes a run inside', 'cuts inside on the underlap'],
  },
};
