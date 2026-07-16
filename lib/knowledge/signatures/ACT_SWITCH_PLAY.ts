// ACT_SWITCH_PLAY — a long pass that crosses from one wide lateral channel to the
// opposite side of the field, switching the point of attack.
//
// Uses passLateralBand() from primitives.ts to classify the sender's and receiver's
// x-positions as 'left', 'center', or 'right'. A genuine switch goes from one wide
// channel to the other (left→right or right→left), covering most of the field width.
//
// Predicate translation:
//   trigger (action = pass):
//     (a) pass action with a player receiver
//     (b) pass length ≥ SWITCH_MIN_LENGTH_PX (genuine cross-field ball)
//     (c) sender is in the left or right wide band AND receiver is in the OPPOSITE band
//         (passLateralBand of sender vs receiver crosses center)
//
//   silence: (none at Tier 1)
//   never-co-occurs: (none at Tier 1)
//
// Narration: replaces the pass verb.
//   "${passer} switches the play to ${receiver}"

import type { TermSignature } from './matcher';
import type { PassAction } from '../../engine/types';
import { resolvePosition } from '../../engine/resolve';
import { passLateralBand } from '../primitives';

/**
 * Minimum pass length (canvas px) for a switch of play.
 * ~260px ≈ one-third of the 780px playable width, roughly 20m on a standard pitch.
 * A genuine cross-field switch must cover substantial lateral distance.
 */
export const SWITCH_MIN_LENGTH_PX = 260;

export const ACT_SWITCH_PLAY: TermSignature = {
  termId: 'act.switch_play',
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

    // (b) pass length ≥ SWITCH_MIN_LENGTH_PX
    (ctx) => {
      const pass = ctx.action as PassAction;
      if (!('entityId' in pass.target)) return false;

      const entity = ctx.doc.entities.find(e => e.id === ctx.actorId);
      if (!entity || entity.kind !== 'player') return false;
      const frameTeam = ctx.frame.teams.find(t => t.id === entity.team);
      const attackDir = frameTeam?.attackingDirection;
      if (!attackDir) return false;

      const senderPos   = resolvePosition(ctx.doc, ctx.actorId, pass.start);
      const receiverPos = resolvePosition(ctx.doc, pass.target.entityId, pass.start + pass.duration);
      const length = Math.hypot(receiverPos.x - senderPos.x, receiverPos.y - senderPos.y);
      ctx.debug?.(`passLength=${Math.round(length)}px threshold=${SWITCH_MIN_LENGTH_PX}px`);
      return length >= SWITCH_MIN_LENGTH_PX;
    },

    // (c) sender and receiver are in opposite wide bands (left↔right crossing)
    (ctx) => {
      const pass = ctx.action as PassAction;
      if (!('entityId' in pass.target)) return false;

      const senderPos   = resolvePosition(ctx.doc, ctx.actorId, pass.start);
      const receiverPos = resolvePosition(ctx.doc, pass.target.entityId, pass.start + pass.duration);

      const senderBand   = passLateralBand(senderPos.x);
      const receiverBand = passLateralBand(receiverPos.x);

      const crosses = (senderBand === 'left' && receiverBand === 'right') ||
                      (senderBand === 'right' && receiverBand === 'left');
      ctx.debug?.(`senderBand=${senderBand} receiverBand=${receiverBand} crosses=${crosses}`);
      return crosses;
    },
  ],
  silence: [],
  contradictions: [],
  anchor: 'ball',
  specificity: 15,
  phrase: {
    primary: 'switches the play to',
    variants: ['switches it to', 'plays it long to'],
  },
};
