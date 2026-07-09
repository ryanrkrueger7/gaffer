// Shared knowledge-layer types.
// Pure data — no engine or UI imports.

export interface DictionaryEntry {
  /** Discriminant — 'position' | 'zone' | 'constraint' | future kinds. */
  kind: string;
  /**
   * Stable, globally unique identifier. Convention: `{category}.{snake_case_key}`.
   * Examples: "position.cdm", "zone.in_behind", "scoring.real_goal".
   * Never changes after creation — referenced by correction-logging schema.
   */
  id: string;
  /** Canonical display name, e.g. "Defensive Midfielder". */
  term: string;
  /** All alternate names / spellings coaches use to refer to this concept. */
  aliases: string[];
  /** One plain-English sentence a coach would say out loud. */
  definition: string;
}

/**
 * Throws at module-load time if any two entries share the same id.
 * Call once per exported entries array to guard against copy-paste duplicates.
 */
export function assertUniqueIds(entries: DictionaryEntry[]): void {
  const seen = new Set<string>();
  for (const e of entries) {
    if (seen.has(e.id)) {
      throw new Error(`[knowledge] Duplicate dictionary id detected: "${e.id}"`);
    }
    seen.add(e.id);
  }
}
