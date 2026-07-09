// Gaffer knowledge layer — aggregated entry point.
// Imports all dictionary entries and asserts globally unique ids across
// every category. Any consumer that imports from this module gets the
// cross-file uniqueness check for free at module-load time.

import type { DictionaryEntry } from './types';
import { assertUniqueIds } from './types';

export { ROLE_ENTRIES, resolveTerm } from './roles';
export { ZONE_ENTRIES } from './zones';
export { SCORING_ENTRIES } from './scoring';
export type { DictionaryEntry } from './types';
export { assertUniqueIds } from './types';
export type { PositionEntry } from './roles';
export type { ZoneEntry } from './zones';

import { ROLE_ENTRIES } from './roles';
import { ZONE_ENTRIES } from './zones';
import { SCORING_ENTRIES } from './scoring';

/** Every dictionary entry from every category, combined. */
export const ALL_DICTIONARY_ENTRIES: DictionaryEntry[] = [
  ...ROLE_ENTRIES,
  ...ZONE_ENTRIES,
  ...SCORING_ENTRIES,
];

// Cross-file uniqueness guard — throws on duplicate ids across all categories.
assertUniqueIds(ALL_DICTIONARY_ENTRIES);
