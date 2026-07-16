// ACT_LAYOFF_UNDERNEATH — a backward pass to a player checking underneath/behind.
//
// Predicate translation (FIX 2 — added forward-ball and receiver-closing triggers):
//   trigger (action = pass):
//     (a) classifyPassDirection of this pass is 'backward'
//     (b) receiver is closer to own goal than passer at time of pass
//         (i.e., receiver is geometrically "underneath" / in behind the passer)
//     (c) passer received a forward pass ending within LAYOFF_WINDOW seconds before
//         this pass starts — distinguishes first-touch layoffs from general backward
//         distribution (GK, switch of play, etc.)
//     (d) receiver has an active run with distanceToBallTrend='closing' at pass.start
//         — confirms the receiver is actually making a checking run, not standing still
//
//   silence: (none at Tier 1)
//   never-co-occurs: (none at Tier 1)
//
// Narration integration: when this term fires on a pass, its phrase REPLACES the
// reception-classification verb in the clause. The narrate.ts head checks for this
// term on each pass before calling verbFor() and uses the signature phrase instead,
// preventing the double "lays it off / lays it off underneath" collision.

import type { TermSignature } from './matcher';
import type { PassAction, RunAction } from '../../engine/types';
import { resolvePosition } from '../../engine/resolve';
import { classifyPassDirection } from '../passDirection';
import { receiverOf, distanceToBallTrend } from '../primitives';

/** Seconds — how recently the passer must have received a forward ball for layoff to fire. */
const LAYOFF_WINDOW = 2.0;

export const ACT_LAYOFF_UNDERNEATH: TermSignature = {
  termId: 'act.layoff_underneath',
  actor: 'any',
  trigger: [
    // (a) must be a pass action with a player receiver
    (ctx) => {
      if (ctx.action.kind !== 'pass') return false;
      const pass = ctx.action as PassAction;
      return receiverOf(pass, ctx.doc) !== null;
    },

    // (b) pass direction is 'backward' AND receiver is geometrically underneath
    (ctx) => {
      const pass = ctx.action as PassAction;
      const passerEntity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      if (!passerEntity || passerEntity.kind !== 'player') return false;
      const frameTeam = ctx.frame.teams.find(t => t.id === passerEntity.team);
      const attackDir = frameTeam?.attackingDirection;
      if (!attackDir) return false;

      const receiverId = receiverOf(pass, ctx.doc)!;
      const passerPos   = resolvePosition(ctx.doc, ctx.actorId, pass.start);
      const receiverPos = resolvePosition(ctx.doc, receiverId, pass.start + pass.duration);

      const dir = classifyPassDirection(
        passerPos.x, passerPos.y,
        receiverPos.x, receiverPos.y,
        attackDir,
      );
      ctx.debug?.(`passDir=${dir} passerY=${Math.round(passerPos.y)} receiverY=${Math.round(receiverPos.y)}`);
      if (dir !== 'backward') return false;

      // Receiver must be closer to own goal (geometrically "underneath" the passer).
      if (attackDir === 'up') return receiverPos.y > passerPos.y;
      return receiverPos.y < passerPos.y;
    },

    // (c) passer received a FORWARD pass ending within LAYOFF_WINDOW before this pass
    (ctx) => {
      const pass = ctx.action as PassAction;
      const passerEntity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      if (!passerEntity || passerEntity.kind !== 'player') return false;
      const frameTeam = ctx.frame.teams.find(t => t.id === passerEntity.team);
      const attackDir = frameTeam?.attackingDirection;
      if (!attackDir) return false;

      const found = ctx.doc.actions.some(a => {
        if (a.kind !== 'pass') return false;
        const ap = a as PassAction;
        if (!('entityId' in ap.target)) return false;
        if (ap.target.entityId !== ctx.actorId) return false;
        const incomingEnd = ap.start + ap.duration;
        if (incomingEnd > pass.start) return false;       // must arrive before (or at) layoff start
        if (incomingEnd < pass.start - LAYOFF_WINDOW) return false; // too long ago
        const senderPos   = resolvePosition(ctx.doc, ap.entityId, ap.start);
        const receiverPos = resolvePosition(ctx.doc, ctx.actorId, incomingEnd);
        const dir = classifyPassDirection(senderPos.x, senderPos.y, receiverPos.x, receiverPos.y, attackDir);
        return dir === 'forward';
      });

      ctx.debug?.(`recentForwardIncoming=${found} window=${LAYOFF_WINDOW}s`);
      return found;
    },

    // (d) receiver has an active run with closing trend at pass.start
    (ctx) => {
      const pass = ctx.action as PassAction;
      const receiverId = receiverOf(pass, ctx.doc);
      if (!receiverId) return false;

      const activeRun = ctx.doc.actions.find(a =>
        a.kind === 'run' &&
        a.entityId === receiverId &&
        a.start <= pass.start &&
        a.start + a.duration >= pass.start,
      ) as RunAction | undefined;

      if (!activeRun) {
        ctx.debug?.('receiverActiveRun=none');
        return false;
      }

      const trend = distanceToBallTrend(ctx.doc, receiverId, activeRun);
      ctx.debug?.(`receiverRun=[${activeRun.start.toFixed(1)},${(activeRun.start + activeRun.duration).toFixed(1)}] trend=${trend}`);
      return trend === 'closing';
    },
  ],
  silence: [],
  contradictions: [],
  anchor: 'ball',
  specificity: 10,
  phrase: {
    primary: 'lays it off underneath to',
    variants: ['slides it off to', 'lays it back to'],
  },
};
