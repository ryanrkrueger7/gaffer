// Gaffer knowledge layer — position dictionary.
// No UI, no engine imports, no side effects.

import type { DictionaryEntry } from './types';
import { assertUniqueIds } from './types';
import type { PositionId } from './formations';

// ── PositionEntry — DictionaryEntry extended with a typed positionId ───────────
// positionId is the compile-time guarantee that every entry maps to a real
// PositionId from formations.ts. DictionaryEntry.id uses the stable convention
// "position.{positionId lowercased}" — e.g. "position.cdm", "position.lcb".

export interface PositionEntry extends DictionaryEntry {
  positionId: PositionId;
}

// ── Role entries ──────────────────────────────────────────────────────────────
// One entry per PositionId currently defined in formations.ts (20 total).
// id format: 'position.<position_id_lowercase>'
// Positions NOT in the original spec alias list (added by inference): LAM, RAM, CF, SS.
//
// ALIAS COLLISION NOTES
// Intentional multi-maps (both entries should return for these terms):
//   "full back"/"fullback" → LB, RB
//   "wing back"           → LWB, RWB
//   "wide midfielder"     → LM, RM
//   "winger"              → LW, RW
//   "centre back"         → CB, LCB, RCB (generic → all CB variants)
//   "the 4"/"4"           → CB, RCB  (football convention; CB is generic)
//   "the 5"/"5"           → CB, LCB  (football convention; CB is generic)
// Fixed collisions:
//   "the 9"/"9" removed from CF (kept on ST only)
//   "center forward"/"centre forward" removed from CF aliases (still searchable
//     via CF's own `term`; avoids duplicating ST's aliases)
//   "the 10" removed from SS (the 10 = CAM unambiguously)

export const ROLE_ENTRIES: PositionEntry[] = [
  // ── Goalkeeper ──────────────────────────────────────────────────────────────
  {
    kind: 'position',
    positionId: 'GK',
    id: 'position.gk',
    term: 'Goalkeeper',
    aliases: ['GK', 'goalkeeper', 'keeper', 'goalie', 'the 1', '1'],
    definition: 'The player who guards the goal and is the only one permitted to handle the ball with their hands in open play.',
  },

  // ── Back line ───────────────────────────────────────────────────────────────
  {
    kind: 'position',
    positionId: 'LB',
    id: 'position.lb',
    term: 'Left Back',
    aliases: ['LB', 'left back', 'left fullback', 'full back', 'fullback', 'the 3', '3'],
    definition: 'A defender stationed on the left side of the back line who marks opposing right wingers and supports attacks down the flank.',
  },
  {
    kind: 'position',
    positionId: 'CB',
    id: 'position.cb',
    term: 'Center Back',
    aliases: ['CB', 'center back', 'centre back', 'central defender', 'centerback', 'the 4', 'the 5', '4', '5'],
    definition: 'A central defender responsible for blocking attacks through the middle, winning headers, and organising the defensive line.',
  },
  {
    kind: 'position',
    positionId: 'LCB',
    id: 'position.lcb',
    term: 'Left Center Back',
    aliases: ['LCB', 'left center back', 'left centre back', 'left central defender', 'centre back', 'the 5', '5'],
    definition: 'The center back positioned to the left of the central defensive partnership, typically stronger in the air on that side.',
  },
  {
    kind: 'position',
    positionId: 'RCB',
    id: 'position.rcb',
    term: 'Right Center Back',
    aliases: ['RCB', 'right center back', 'right centre back', 'right central defender', 'centre back', 'the 4', '4'],
    definition: 'The center back positioned to the right of the central defensive partnership, typically the more ball-playing of the two.',
  },
  {
    kind: 'position',
    positionId: 'RB',
    id: 'position.rb',
    term: 'Right Back',
    aliases: ['RB', 'right back', 'right fullback', 'full back', 'fullback', 'the 2', '2'],
    definition: 'A defender stationed on the right side of the back line who marks opposing left wingers and overlaps into attack.',
  },

  // ── Wing backs ──────────────────────────────────────────────────────────────
  {
    kind: 'position',
    positionId: 'LWB',
    id: 'position.lwb',
    term: 'Left Wing Back',
    aliases: ['LWB', 'left wing back', 'wing back', 'left wingback'],
    definition: 'A wide defender in a back-three system who pushes high up the left to provide width and deliver crosses, then tracks back when possession is lost.',
  },
  {
    kind: 'position',
    positionId: 'RWB',
    id: 'position.rwb',
    term: 'Right Wing Back',
    aliases: ['RWB', 'right wing back', 'wing back', 'right wingback'],
    definition: 'A wide defender in a back-three system who pushes high up the right to provide width and deliver crosses, then tracks back when possession is lost.',
  },

  // ── Defensive / holding mid ─────────────────────────────────────────────────
  {
    kind: 'position',
    positionId: 'CDM',
    id: 'position.cdm',
    term: 'Defensive Midfielder',
    aliases: ['CDM', 'defensive midfielder', 'defensive mid', 'holding mid', 'holding midfielder', 'the 6', 'the pivot', 'anchor', '6'],
    definition: 'A midfielder who sits directly in front of the defense, screens the back line from runners, and recycles possession under pressure.',
  },

  // ── Central midfield ────────────────────────────────────────────────────────
  {
    kind: 'position',
    positionId: 'LM',
    id: 'position.lm',
    term: 'Left Midfielder',
    aliases: ['LM', 'left midfielder', 'left mid', 'wide midfielder', 'left wide mid'],
    definition: 'A midfielder operating in the left channel who tracks back to help defensively while providing width and crosses in attack.',
  },
  {
    kind: 'position',
    positionId: 'CM',
    id: 'position.cm',
    term: 'Central Midfielder',
    aliases: ['CM', 'central midfielder', 'center mid', 'centre mid', 'the 8', 'box-to-box', 'box to box', '8'],
    definition: 'A midfielder who covers ground across both boxes, winning the ball in tight spaces and distributing it quickly to keep the team ticking.',
  },
  {
    kind: 'position',
    positionId: 'RM',
    id: 'position.rm',
    term: 'Right Midfielder',
    aliases: ['RM', 'right midfielder', 'right mid', 'wide midfielder', 'right wide mid'],
    definition: 'A midfielder operating in the right channel who tracks back to help defensively while providing width and crosses in attack.',
  },

  // ── Attacking midfield ──────────────────────────────────────────────────────
  {
    kind: 'position',
    positionId: 'CAM',
    id: 'position.cam',
    term: 'Attacking Midfielder',
    aliases: ['CAM', 'attacking midfielder', 'attacking mid', 'number 10', 'the 10', 'playmaker', '10'],
    definition: 'A creative midfielder who plays between the lines, linking midfield to attack by finding pockets of space and threading balls through to the strikers.',
  },
  {
    kind: 'position',
    positionId: 'LAM',
    id: 'position.lam',
    term: 'Left Attacking Midfielder',
    aliases: ['LAM', 'left attacking midfielder', 'left attacking mid', 'left 10', 'left playmaker'],
    definition: 'An attacking midfielder deployed on the left half-space, combining the creativity of a number 10 with a wider starting position.',
  },
  {
    kind: 'position',
    positionId: 'RAM',
    id: 'position.ram',
    term: 'Right Attacking Midfielder',
    aliases: ['RAM', 'right attacking midfielder', 'right attacking mid', 'right 10', 'right playmaker'],
    definition: 'An attacking midfielder deployed on the right half-space, combining the creativity of a number 10 with a wider starting position.',
  },

  // ── Wide attackers ──────────────────────────────────────────────────────────
  {
    kind: 'position',
    positionId: 'LW',
    id: 'position.lw',
    term: 'Left Winger',
    aliases: ['LW', 'left winger', 'winger', 'left wing', 'left flank'],
    definition: 'A wide attacker on the left who takes defenders on in one-v-ones, delivers crosses, and cuts inside to create or score goals.',
  },
  {
    kind: 'position',
    positionId: 'RW',
    id: 'position.rw',
    term: 'Right Winger',
    aliases: ['RW', 'right winger', 'winger', 'right wing', 'right flank'],
    definition: 'A wide attacker on the right who takes defenders on in one-v-ones, delivers crosses, and cuts inside to create or score goals.',
  },

  // ── Strikers / forwards ─────────────────────────────────────────────────────
  {
    kind: 'position',
    positionId: 'ST',
    id: 'position.st',
    term: 'Striker',
    aliases: ['ST', 'striker', 'center forward', 'centre forward', 'the 9', 'forward', '9'],
    definition: 'The primary goal-scoring attacker who leads the line, holds the ball up under pressure, and finishes chances in and around the penalty area.',
  },
  {
    // "center forward"/"centre forward" kept only on ST (above) and accessible
    // here via this entry's term; removed from aliases to avoid duplicate collision.
    // "the 9"/"9" removed — those belong to ST only.
    kind: 'position',
    positionId: 'CF',
    id: 'position.cf',
    term: 'Center Forward',
    aliases: ['CF', 'false nine', 'false 9', 'target man'],
    definition: 'A central attacker who combines goal-scoring with link-up play, often dropping deep or drifting wide to create space for teammates.',
  },
  {
    // "the 10" removed — that alias belongs to CAM unambiguously.
    kind: 'position',
    positionId: 'SS',
    id: 'position.ss',
    term: 'Second Striker',
    aliases: ['SS', 'second striker', 'support striker', 'shadow striker', '9 and a half'],
    definition: 'An attacker who plays just behind the main striker, dropping into space between the lines to receive, combine, and create goal-scoring opportunities.',
  },
] satisfies PositionEntry[];

assertUniqueIds(ROLE_ENTRIES);

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
