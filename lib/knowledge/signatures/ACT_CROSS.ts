// ACT_CROSS — a delivery into the penalty box from a wide channel in the attacking third.
//
// Fires on the PASS action. Narrates as "crosses to <receiver>" for a standard delivery;
// when a run term resolves to this pass, narrate.ts emits "meets the cross from <passer>"
// (receiver-first, NO "continuing his run" — that phrase is gated to overlap/underlap/in-behind).
//
// Predicate translation:
//   trigger (action = pass):
//     (a) pass action with a player receiver
//     (b) passer's position at pass.start is in a wide area in the attacking third
//         (zone.wide_area_left or zone.wide_area_right — zoneAt)
//     (c) receiver's position at pass.start + pass.duration is inside the penalty box
//         (BOX_X_MIN–BOX_X_MAX, y ≤ TOP_BOX_Y_MAX for 'up' / y ≥ BOTTOM_BOX_Y_MIN for 'down')
//         Note: triggers (b) + (c) jointly guarantee lateral travel toward the center —
//         a ball from the wide area (flankPos ≤ 0.25 or ≥ 0.75) to inside the box
//         (flankPos ≈ 0.30–0.70) always crosses inward.
//
//   silence:
//     (s1) Cutback — delivery direction is 'backward' per classifyPassDirection.
//          Expressible geometric subset: passes where the ball travels away from the
//          opponent goal. Gap: square or slightly-backward cutbacks that don't reach the
//          'backward' threshold (sin 30° ≈ 0.5) are NOT silenced here. The full CUTBACK
//          term (which would catch all pull-backs regardless of angle) is not in this build.
//
//   never-co-occurs (contradictions):
//     act.switch_play at beat scope — a wide delivery into the box is never a switch.
//
// Specificity: 28 — above ACT_THROUGH_BALL (25) so a delivery into the box with a
// forward runner narrates as "crosses to", not "plays through to."

import type { TermSignature } from './matcher';
import type { PassAction } from '../../engine/types';
import { resolvePosition } from '../../engine/resolve';
import { classifyPassDirection } from '../passDirection';
import { zoneAt } from '../zones';
import {
  BOX_X_MIN,
  BOX_X_MAX,
  TOP_BOX_Y_MAX,
  BOTTOM_BOX_Y_MIN,
} from '../primitives';

export const ACT_CROSS: TermSignature = {
  termId: 'act.cross',
  actor: 'any',
  trigger: [
    // (a) pass action with a player receiver
    (ctx) => {
      if (ctx.action.kind !== 'pass') return false;
      const pass = ctx.action as PassAction;
      if (!('entityId' in pass.target)) return false;
      const receiver = ctx.doc.entities.find(e => e.id === (pass.target as { entityId: string }).entityId);
      return receiver?.kind === 'player';
    },

    // (b) passer is in a wide area of the attacking third at pass.start
    (ctx) => {
      const pass = ctx.action as PassAction;
      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      if (!entity || entity.kind !== 'player') return false;
      const frameTeam = ctx.frame.teams.find(t => t.id === entity.team);
      const attackDir = frameTeam?.attackingDirection;
      if (!attackDir) return false;

      const senderPos = resolvePosition(ctx.doc, ctx.actorId, pass.start);
      const zones = zoneAt(senderPos.x, senderPos.y, attackDir);
      const inWide = zones.includes('zone.wide_area_left') || zones.includes('zone.wide_area_right');
      ctx.debug?.(`passerZones=${zones.join(',')} inWide=${inWide}`);
      return inWide;
    },

    // (c) receiver arrives inside the penalty box
    (ctx) => {
      const pass = ctx.action as PassAction;
      if (!('entityId' in pass.target)) return false;
      const receiverId = (pass.target as { entityId: string }).entityId;

      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      if (!entity || entity.kind !== 'player') return false;
      const frameTeam = ctx.frame.teams.find(t => t.id === entity.team);
      const attackDir = frameTeam?.attackingDirection;
      if (!attackDir) return false;

      const arrivalPos = resolvePosition(ctx.doc, receiverId, pass.start + pass.duration);
      const inBox = arrivalPos.x >= BOX_X_MIN && arrivalPos.x <= BOX_X_MAX &&
        (attackDir === 'up' ? arrivalPos.y <= TOP_BOX_Y_MAX : arrivalPos.y >= BOTTOM_BOX_Y_MIN);
      ctx.debug?.(`arrivalPos=(${Math.round(arrivalPos.x)},${Math.round(arrivalPos.y)}) inBox=${inBox}`);
      return inBox;
    },
  ],
  silence: [
    // (s1) Cutback — delivery is backward (away from goal).
    //      Expressible subset: classifyPassDirection = 'backward'.
    //      Gap: square / slightly-backward pull-backs not caught. ACT_CUTBACK deferred.
    (ctx) => {
      const pass = ctx.action as PassAction;
      if (!('entityId' in pass.target)) return false;

      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      if (!entity || entity.kind !== 'player') return false;
      const frameTeam = ctx.frame.teams.find(t => t.id === entity.team);
      const attackDir = frameTeam?.attackingDirection;
      if (!attackDir) return false;

      const senderPos = resolvePosition(ctx.doc, ctx.actorId, pass.start);
      const receiverPos = resolvePosition(ctx.doc, (pass.target as { entityId: string }).entityId, pass.start + pass.duration);
      const dir = classifyPassDirection(senderPos.x, senderPos.y, receiverPos.x, receiverPos.y, attackDir);
      const isCutback = dir === 'backward';
      ctx.debug?.(`s1 passDir=${dir} isCutback=${isCutback}`);
      return isCutback;
    },
  ],
  contradictions: [
    { termId: 'act.switch_play', scope: 'beat' },
  ],
  anchor: 'ball',
  specificity: 28,
  phrase: {
    primary: 'crosses to',
    variants: ['delivers a cross to', 'whips it in to'],
  },
};
