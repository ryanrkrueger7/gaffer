// Gaffer intelligence layer — public surface.
// lib/engine and lib/knowledge must never import from here.

export { narrate, logCorrection } from './narrate';
export type { NarrationOptions } from './narrate';
export type { NarrationClause, NarrationResult, CorrectionEvent } from './types';
