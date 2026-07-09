// Gaffer knowledge layer — position dictionary.
// No UI, no engine imports, no side effects.

import type { DictionaryEntry } from './types';
// PositionId import kept for doc-comment cross-reference; not used at runtime.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { PositionId } from './formations';

// ── Role entries ──────────────────────────────────────────────────────────────
// One entry per PositionId currently defined in formations.ts (20 total).
// id format: 'pos.<position_id_lowercase>'
// Positions NOT in the spec's explicit alias list (flagged): LAM, RAM, CF, SS.

export const ROLE_ENTRIES: DictionaryEntry[] = [
  // ── Goalkeeper ──────────────────────────────────────────────────────────────
  {
    kind: 'position',
    id: 'pos.gk',
    term: 'Goalkeeper',
    aliases: ['GK', 'goalkeeper', 'keeper', 'goalie', 'the 1', '1'],
    definition: 'The player who guards the goal and is the only one permitted to handle the ball with their hands in open play.',
  },

  // ── Back line ───────────────────────────────────────────────────────────────
  {
    kind: 'position',
    id: 'pos.lb',
    term: 'Left Back',
    aliases: ['LB', 'left back', 'left fullback', 'full back', 'fullback', 'the 3', '3'],
    definition: 'A defender stationed on the left side of the back line who marks opposing right wingers and supports attacks down the flank.',
  },
  {
    kind: 'position',
    id: 'pos.cb',
    term: 'Center Back',
    aliases: ['CB', 'center back', 'centre back', 'central defender', 'centerback', 'the 4', 'the 5', '4', '5'],
    definition: 'A central defender responsible for blocking attacks through the middle, winning headers, and organising the defensive line.',
  },
  {
    kind: 'position',
    id: 'pos.lcb',
    term: 'Left Center Back',
    aliases: ['LCB', 'left center back', 'left centre back', 'left central defender', 'centre back', 'the 5', '5'],
    definition: 'The center back positioned to the left of the central defensive partnership, typically stronger in the air on that side.',
  },
  {
    kind: 'position',
    id: 'pos.rcb',
    term: 'Right Center Back',
    aliases: ['RCB', 'right center back', 'right centre back', 'right central defender', 'centre back', 'the 4', '4'],
    definition: 'The center back positioned to the right of the central defensive partnership, typically the more ball-playing of the two.',
  },
  {
    kind: 'position',
    id: 'pos.rb',
    term: 'Right Back',
    aliases: ['RB', 'right back', 'right fullback', 'full back', 'fullback', 'the 2', '2'],
    definition: 'A defender stationed on the right side of the back line who marks opposing left wingers and overlaps into attack.',
  },

  // ── Wing backs ──────────────────────────────────────────────────────────────
  {
    kind: 'position',
    id: 'pos.lwb',
    term: 'Left Wing Back',
    aliases: ['LWB', 'left wing back', 'wing back', 'left wingback'],
    definition: 'A wide defender in a back-three system who pushes high up the left to provide width and deliver crosses, then tracks back when possession is lost.',
  },
  {
    kind: 'position',
    id: 'pos.rwb',
    term: 'Right Wing Back',
    aliases: ['RWB', 'right wing back', 'wing back', 'right wingback'],
    definition: 'A wide defender in a back-three system who pushes high up the right to provide width and deliver crosses, then tracks back when possession is lost.',
  },

  // ── Defensive / holding mid ─────────────────────────────────────────────────
  {
    kind: 'position',
    id: 'pos.cdm',
    term: 'Defensive Midfielder',
    aliases: ['CDM', 'defensive midfielder', 'defensive mid', 'holding mid', 'holding midfielder', 'the 6', 'the pivot', 'anchor', '6'],
    definition: 'A midfielder who sits directly in front of the defense, screens the back line from runners, and recycles possession under pressure.',
  },

  // ── Central midfield ────────────────────────────────────────────────────────
  {
    kind: 'position',
    id: 'pos.lm',
    term: 'Left Midfielder',
    aliases: ['LM', 'left midfielder', 'left mid', 'wide midfielder', 'left wide mid'],
    definition: 'A midfielder operating in the left channel who tracks back to help defensively while providing width and crosses in attack.',
  },
  {
    kind: 'position',
    id: 'pos.cm',
    term: 'Central Midfielder',
    aliases: ['CM', 'central midfielder', 'center mid', 'centre mid', 'the 8', 'box-to-box', 'box to box', '8'],
    definition: 'A midfielder who covers ground across both boxes, winning the ball in tight spaces and distributing it quickly to keep the team ticking.',
  },
  {
    kind: 'position',
    id: 'pos.rm',
    term: 'Right Midfielder',
    aliases: ['RM', 'right midfielder', 'right mid', 'wide midfielder', 'right wide mid'],
    definition: 'A midfielder operating in the right channel who tracks back to help defensively while providing width and crosses in attack.',
  },

  // ── Attacking midfield ──────────────────────────────────────────────────────
  {
    kind: 'position',
    id: 'pos.cam',
    term: 'Attacking Midfielder',
    aliases: ['CAM', 'attacking midfielder', 'attacking mid', 'number 10', 'the 10', 'playmaker', '10'],
    definition: 'A creative midfielder who plays between the lines, linking midfield to attack by finding pockets of space and threading balls through to the strikers.',
  },
  // ⬇ ADDED (not in spec list): LAM
  {
    kind: 'position',
    id: 'pos.lam',
    term: 'Left Attacking Midfielder',
    aliases: ['LAM', 'left attacking midfielder', 'left attacking mid', 'left 10', 'left playmaker'],
    definition: 'An attacking midfielder deployed on the left half-space, combining the creativity of a number 10 with a wider starting position.',
  },
  // ⬇ ADDED (not in spec list): RAM
  {
    kind: 'position',
    id: 'pos.ram',
    term: 'Right Attacking Midfielder',
    aliases: ['RAM', 'right attacking midfielder', 'right attacking mid', 'right 10', 'right playmaker'],
    definition: 'An attacking midfielder deployed on the right half-space, combining the creativity of a number 10 with a wider starting position.',
  },

  // ── Wide attackers ──────────────────────────────────────────────────────────
  {
    kind: 'position',
    id: 'pos.lw',
    term: 'Left Winger',
    aliases: ['LW', 'left winger', 'winger', 'left wing', 'left flank'],
    definition: 'A wide attacker on the left who takes defenders on in one-v-ones, delivers crosses, and cuts inside to create or score goals.',
  },
  {
    kind: 'position',
    id: 'pos.rw',
    term: 'Right Winger',
    aliases: ['RW', 'right winger', 'winger', 'right wing', 'right flank'],
    definition: 'A wide attacker on the right who takes defenders on in one-v-ones, delivers crosses, and cuts inside to create or score goals.',
  },

  // ── Strikers / forwards ─────────────────────────────────────────────────────
  {
    kind: 'position',
    id: 'pos.st',
    term: 'Striker',
    aliases: ['ST', 'striker', 'center forward', 'centre forward', 'the 9', 'forward', '9'],
    definition: 'The primary goal-scoring attacker who leads the line, holds the ball up under pressure, and finishes chances in and around the penalty area.',
  },
  // ⬇ ADDED (not in spec list): CF
  {
    kind: 'position',
    id: 'pos.cf',
    term: 'Center Forward',
    aliases: ['CF', 'center forward', 'centre forward', 'false nine', 'false 9', 'target man', 'the 9', '9'],
    definition: 'A central attacker who combines goal-scoring with link-up play, often dropping deep or drifting wide to create space for teammates.',
  },
  // ⬇ ADDED (not in spec list): SS
  {
    kind: 'position',
    id: 'pos.ss',
    term: 'Second Striker',
    aliases: ['SS', 'second striker', 'support striker', 'shadow striker', 'the 10', '9 and a half'],
    definition: 'An attacker who plays just behind the main striker, dropping into space between the lines to receive, combine, and create goal-scoring opportunities.',
  },
] satisfies DictionaryEntry[];

// ── resolveTerm ───────────────────────────────────────────────────────────────

/**
 * Case-insensitive lookup across term and all aliases.
 * Returns exact matches first, then substring matches. Never throws.
 */
export function resolveTerm(text: string): DictionaryEntry[] {
  const needle = text.toLowerCase().trim();
  if (!needle) return [];

  const exact: DictionaryEntry[] = [];
  const partial: DictionaryEntry[] = [];

  for (const entry of ROLE_ENTRIES) {
    const haystack = [entry.term, ...entry.aliases].map(s => s.toLowerCase());
    if (haystack.some(s => s === needle)) {
      exact.push(entry);
    } else if (haystack.some(s => s.includes(needle))) {
      partial.push(entry);
    }
  }

  return [...exact, ...partial];
}
