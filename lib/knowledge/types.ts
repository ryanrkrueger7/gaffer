// Shared knowledge-layer types.
// Pure data — no engine or UI imports.

export interface DictionaryEntry {
  /** Discriminant — 'position' | future kinds (e.g. 'concept', 'action'). */
  kind: string;
  /** Stable identifier, e.g. 'pos.cdm'. Never changes after creation. */
  id: string;
  /** Canonical display name, e.g. "Defensive Midfielder". */
  term: string;
  /** All alternate names / spellings coaches use to refer to this concept. */
  aliases: string[];
  /** One plain-English sentence a coach would say out loud. */
  definition: string;
}
