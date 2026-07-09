// Gaffer knowledge layer — named zone dictionary.
// No UI, no engine imports, no side effects.
//
// DUPLICATION NOTE: FIELD_X_MIN/MAX/Y_MIN/MAX are also defined (unexported)
// in positionInference.ts. They are inlined here because positionInference.ts
// does not export them. If these constants ever change, both files must be
// updated. Recommend exporting from a shared lib/knowledge/field.ts in a
// future cleanup pass.

import type { DictionaryEntry } from './types';
import { assertUniqueIds } from './types';

// ── Field boundary reference (mirrors positionInference.ts) ──────────────────
// FIELD_X_MIN=10, FIELD_X_MAX=790, FIELD_Y_MIN=10, FIELD_Y_MAX=590.
// These are used only in the geometryMapping.regions string descriptions below —
// no runtime geometry testing is built here, so no declarations needed.

// ── ZoneEntry — DictionaryEntry extended with geometry description ─────────────
// geometryMapping.regions describes the zone in terms of the normalised
// attackProgress [0-1] and flankPos [0-1] axes defined in positionInference.ts.
// These are string descriptions only — no geometry-testing function is built here.

export interface ZoneEntry extends DictionaryEntry {
  geometryMapping: {
    /**
     * Human-readable range description using the normalised axes:
     *   attackProgress  0 = own goal end, 1 = opponent goal end
     *   flankPos        0 = left flank,   1 = right flank (from team's perspective)
     */
    regions: string;
  };
}

// ── Zone entries ──────────────────────────────────────────────────────────────

export const ZONE_ENTRIES: ZoneEntry[] = [
  // ── Full-length vertical channels (flank axis thirds) ──────────────────────

  {
    kind: 'zone',
    id: 'zone.left_channel',
    term: 'Left Channel',
    aliases: ['left channel', 'left corridor', 'left lane', 'left side', 'the left'],
    definition: "The left third of the pitch running from goal to goal, used to stretch the opponent's shape and deliver crosses.",
    geometryMapping: {
      regions: 'full attackProgress 0.0–1.0, flankPos 0.0–0.33',
    },
  },
  {
    kind: 'zone',
    id: 'zone.central_channel',
    term: 'Central Channel',
    aliases: ['central channel', 'center channel', 'centre channel', 'central corridor', 'the middle', 'the center', 'central lane'],
    definition: 'The central third of the pitch from end to end, where the most congested and decisive play typically happens.',
    geometryMapping: {
      regions: 'full attackProgress 0.0–1.0, flankPos 0.33–0.67',
    },
  },
  {
    kind: 'zone',
    id: 'zone.right_channel',
    term: 'Right Channel',
    aliases: ['right channel', 'right corridor', 'right lane', 'right side', 'the right'],
    definition: "The right third of the pitch running from goal to goal, used to stretch the opponent's shape and deliver crosses.",
    geometryMapping: {
      regions: 'full attackProgress 0.0–1.0, flankPos 0.67–1.0',
    },
  },

  // ── Half-spaces (strips between the central and wide channels) ─────────────

  {
    kind: 'zone',
    id: 'zone.left_half_space',
    term: 'Left Half-Space',
    aliases: ['left half space', 'left half-space', 'left inside channel', 'left inside', 'left 8 zone'],
    definition: 'The strip between the left wide channel and the central channel — a dangerous area where players can combine, shoot across goal, or switch play.',
    geometryMapping: {
      regions: 'full attackProgress 0.0–1.0, flankPos 0.17–0.40',
    },
  },
  {
    kind: 'zone',
    id: 'zone.right_half_space',
    term: 'Right Half-Space',
    aliases: ['right half space', 'right half-space', 'right inside channel', 'right inside', 'right 8 zone'],
    definition: 'The strip between the central channel and the right wide channel — a dangerous area where players can combine, shoot across goal, or switch play.',
    geometryMapping: {
      regions: 'full attackProgress 0.0–1.0, flankPos 0.60–0.83',
    },
  },

  // ── Horizontal thirds (attacking axis) ────────────────────────────────────

  {
    kind: 'zone',
    id: 'zone.defensive_third',
    term: 'Defensive Third',
    aliases: ['defensive third', 'own third', 'back third', 'defending third', 'our third'],
    definition: 'The third of the pitch closest to your own goal, where defending under pressure and winning the ball back without risk is the priority.',
    geometryMapping: {
      regions: 'attackProgress 0.0–0.33, full flankPos 0.0–1.0',
    },
  },
  {
    kind: 'zone',
    id: 'zone.middle_third',
    term: 'Middle Third',
    aliases: ['middle third', 'midfield third', 'middle of the pitch', 'the middle third', 'central third'],
    definition: "The central band of the pitch where possession transitions happen, shape is set, and the game's tempo is controlled.",
    geometryMapping: {
      regions: 'attackProgress 0.33–0.67, full flankPos 0.0–1.0',
    },
  },
  {
    kind: 'zone',
    id: 'zone.attacking_third',
    term: 'Attacking Third',
    aliases: ['attacking third', 'final third', "opponent's third", 'the final third', 'top third'],
    definition: 'The third of the pitch closest to the opponent\'s goal, where chance creation and clinical finishing is the priority.',
    geometryMapping: {
      regions: 'attackProgress 0.67–1.0, full flankPos 0.0–1.0',
    },
  },

  // ── Special zones ─────────────────────────────────────────────────────────

  {
    kind: 'zone',
    id: 'zone.in_behind',
    term: 'In Behind',
    aliases: ['in behind', 'behind the line', 'the space in behind', 'over the top', 'in behind the defense', 'the channel', 'in the channel'],
    definition: 'The space beyond the defensive line nearest the opponent\'s goal — targeted by runs in behind and long balls over the top.',
    geometryMapping: {
      regions: 'attackProgress 0.78–1.0, full flankPos 0.0–1.0',
    },
  },
  {
    kind: 'zone',
    id: 'zone.zone_14',
    term: 'Zone 14',
    aliases: ['zone 14', 'zone fourteen', 'top of the box', 'edge of the box', 'space outside the box', 'the zone'],
    definition: "The central area just outside the opponent's penalty box — a high-value region for combination play, set-up passes, and shots on goal.",
    geometryMapping: {
      regions: 'attackProgress 0.78–0.92, flankPos 0.30–0.70',
    },
  },

  // ── Wide areas in the attacking third only ────────────────────────────────

  {
    kind: 'zone',
    id: 'zone.wide_area_left',
    term: 'Wide Area Left',
    aliases: ['wide left', 'left wing area', 'left flank area', 'wide left area', 'left byline area'],
    definition: 'The left flank strip in the attacking third — where wide players receive, take on defenders, and deliver crosses into the box.',
    geometryMapping: {
      regions: 'attackProgress 0.67–1.0, flankPos 0.0–0.25',
    },
  },
  {
    kind: 'zone',
    id: 'zone.wide_area_right',
    term: 'Wide Area Right',
    aliases: ['wide right', 'right wing area', 'right flank area', 'wide right area', 'right byline area'],
    definition: 'The right flank strip in the attacking third — where wide players receive, take on defenders, and deliver crosses into the box.',
    geometryMapping: {
      regions: 'attackProgress 0.67–1.0, flankPos 0.75–1.0',
    },
  },
] satisfies ZoneEntry[];

assertUniqueIds(ZONE_ENTRIES);
