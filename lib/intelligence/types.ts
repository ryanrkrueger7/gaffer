// Gaffer narration head — public contract types.
// No engine or UI imports; pure data shapes.

/**
 * One narrated unit of play — a single pass event expressed in soccer language.
 *
 * text      — the human-readable clause, e.g. "the 6 turns and plays the 9"
 * beatIndex — index of this clause in the NarrationResult.clauses array
 * actionId  — the PassAction id this clause was generated from
 * termIds   — stable dictionary ids used: role entry ids + "direction.{forward|square|backward}"
 * entityIds — [passerId, receiverId] UUIDs from doc.entities
 */
export interface NarrationClause {
  text: string;
  beatIndex: number;
  actionId: string;
  termIds: string[];
  entityIds: string[];
}

/**
 * Full narration output for a document.
 *
 * clauses — ordered list of narrated passes (may be empty)
 * ok      — true when at least one clause was produced
 * notes   — graceful-degradation messages (skipped actions, missing entities, etc.)
 */
export interface NarrationResult {
  clauses: NarrationClause[];
  ok: boolean;
  notes: string[];
}

/**
 * A coach's correction of a single narration clause.
 * Logged against the term ids so the dictionary can learn which terms
 * were accepted, rejected, or edited.
 *
 * Wiring a correction store comes in a later milestone; the signature
 * is the contract that logCorrection() exposes today.
 */
export interface CorrectionEvent {
  clauseIndex: number;
  actionId: string;
  termIds: string[];
  verdict: 'accept' | 'reject' | 'edit';
  editedText?: string;
}
