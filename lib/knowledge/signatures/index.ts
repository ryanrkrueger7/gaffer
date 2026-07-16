// Gaffer — signature registry + convenience matchSignatures wrapper.
// Import this module to get access to all built signatures and the matcher.

export type { TermSignature, PredicateContext, MatchedTerm } from './matcher';
export { matchSignatures as matchSignaturesRaw } from './matcher';

export { MOV_CHECK_TO_BALL }    from './MOV_CHECK_TO_BALL';
export { ACT_LAYOFF_UNDERNEATH } from './ACT_LAYOFF_UNDERNEATH';
export { MOV_RUN_IN_BEHIND }    from './MOV_RUN_IN_BEHIND';
export { MOV_OVERLAP }          from './MOV_OVERLAP';
export { MOV_UNDERLAP }         from './MOV_UNDERLAP';
export { MOV_THIRD_MAN_RUN }    from './MOV_THIRD_MAN_RUN';
export { ACT_ONE_TWO }          from './ACT_ONE_TWO';
export { ACT_SWITCH_PLAY }      from './ACT_SWITCH_PLAY';
export { ACT_THROUGH_BALL }     from './ACT_THROUGH_BALL';
export { ACT_CROSS }            from './ACT_CROSS';
export { MOV_DROP_IN }          from './MOV_DROP_IN';

import { MOV_CHECK_TO_BALL }    from './MOV_CHECK_TO_BALL';
import { ACT_LAYOFF_UNDERNEATH } from './ACT_LAYOFF_UNDERNEATH';
import { MOV_RUN_IN_BEHIND }    from './MOV_RUN_IN_BEHIND';
import { MOV_OVERLAP }          from './MOV_OVERLAP';
import { MOV_UNDERLAP }         from './MOV_UNDERLAP';
import { MOV_THIRD_MAN_RUN }    from './MOV_THIRD_MAN_RUN';
import { ACT_ONE_TWO }          from './ACT_ONE_TWO';
import { ACT_SWITCH_PLAY }      from './ACT_SWITCH_PLAY';
import { ACT_THROUGH_BALL }     from './ACT_THROUGH_BALL';
import { ACT_CROSS }            from './ACT_CROSS';
import { MOV_DROP_IN }          from './MOV_DROP_IN';
import type { TermSignature, MatchedTerm } from './matcher';
import { matchSignatures as matchSignaturesRaw } from './matcher';
import type { GafferDocument } from '../../engine/types';
import type { Frame, Beat } from '../../engine/types';

/** All Tier 1 signatures in priority order (highest specificity last for clarity). */
export const ALL_SIGNATURES: TermSignature[] = [
  MOV_CHECK_TO_BALL,
  ACT_LAYOFF_UNDERNEATH,
  MOV_DROP_IN,
  MOV_THIRD_MAN_RUN,
  ACT_SWITCH_PLAY,
  MOV_RUN_IN_BEHIND,
  ACT_ONE_TWO,
  ACT_THROUGH_BALL,
  ACT_CROSS,
  MOV_OVERLAP,
  MOV_UNDERLAP,
];

/**
 * Run all registered Tier 1 signatures against the document.
 * Returns the complete list of MatchedTerm results.
 *
 * @param debugNotes — when provided, per-predicate pass/fail traces are pushed here (FIX 0).
 */
export function matchSignatures(
  doc: GafferDocument,
  frame: Frame,
  beats: Beat[],
  debugNotes?: string[],
): MatchedTerm[] {
  return matchSignaturesRaw(doc, frame, beats, ALL_SIGNATURES, debugNotes);
}
