// Gaffer knowledge layer — scoring constraint dictionary.
// No UI, no engine imports, no side effects.
// These are descriptive entries only — no logic that resolves whether a given
// action counts as a goal. That is a future consumer's job.

import type { DictionaryEntry } from './types';

// ── Scoring entries ───────────────────────────────────────────────────────────

export const SCORING_ENTRIES: DictionaryEntry[] = [
  {
    kind: 'constraint',
    id: 'scoring.real_goal',
    term: 'Real Goal',
    aliases: ['real goal', 'standard goal', 'full goal', 'big goal', 'goal', 'normal goal'],
    definition: 'A point is scored when the ball crosses the full-size goal line between the posts and under the crossbar; an optional goalkeeper defends the goal.',
  },
  {
    kind: 'constraint',
    id: 'scoring.mini_goal',
    term: 'Mini Goal',
    aliases: ['mini goal', 'small goal', 'mini target', 'small target', 'gate', 'small sided goal'],
    definition: 'A point is scored when the ball passes through or is played into a small target goal; no goalkeeper is used, so scoring rewards accuracy and quick combinations.',
  },
  {
    kind: 'constraint',
    id: 'scoring.dual_target',
    term: 'Dual Target',
    aliases: ['dual target', 'mixed goals', 'opposite goals', 'asymmetric goals', 'transition goals'],
    definition: 'One team scores on a full-size real goal (with or without a goalkeeper) while the other scores on one or more mini goals — common in possession and transition drills to create asymmetric pressing incentives.',
  },
  {
    kind: 'constraint',
    id: 'scoring.no_target',
    term: 'No Target',
    aliases: ['no target', 'possession', 'rondo', 'keep ball', 'keep-ball', 'no goal', 'ball retention'],
    definition: 'There is no scoring target; success is defined by retaining possession for a set number of passes, a set duration, or until the coach signals — used in rondos, possession drills, and warm-ups.',
  },
] satisfies DictionaryEntry[];
