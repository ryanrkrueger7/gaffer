# Gaffer — Engine Specification (v2, rewritten to real state)

*Canonical technical source of truth for Claude Code. This document reflects the VERIFIED current state of the repo plus the contracts and fixes required next. It is the schema the narration head will read and the generation head will target. Companion to the North Star (which holds the product intent). Decisions are locked unless flagged open or deferred.*

**Standing rule:** every contract and field name below must be confirmed against actual repo state before building against it. Where this document names a field, treat the NAME as provisional and the SEMANTICS as binding — read the code, reconcile the name, do not freeze from this document's memory. (A prior contract frozen from description pointed at the wrong repo and produced false findings; this is why.)

---

## 0. What this document is

Gaffer's core is a **world model**: the board at any instant is COMPUTED from persistent entities and the actions performed on them across a timeline. We never store board snapshots. On top of the world model sit (a) a soccer **dictionary** (`lib/knowledge`) that maps geometry to terminology, and (b, to be built) **heads** that translate between the model and language. Diagram→text (narration) is the first head. This spec covers the world model, the Frame that contextualizes it, the dictionary as built, the correctness fixes required now, and the build sequence.

---

## 1. CURRENT STATUS (read first)

**Built and working:**
- **World model (Layer 1, `lib/engine`):** entity-action-timeline; immutable `crypto.randomUUID` identity (never tied to number/label/position); five action primitives (pass, run, carry, mark, hold); a single possession resolver as the one authority for ball ownership + position; `resolveBoardState` computing the board at time T; bezier motion + easing; RAF playback (playhead lives in RAF, never in Zustand). A frozen proof route exercises this end to end. **Do not modify the frozen engine proof.**
- **Authoring surface (editor):** Zustand store; modeless grab-and-drag smart gesture (grab ball → drop on player = pass; grab ball → drop in space = carry; grab a non-owner player = run); single scrubbable playhead (scrub, prev/next moment, play/pause/restart, auto-wrap); append-to-sequence authoring (passer = current ball owner at end of sequence, never chosen); one relational-timing rule (a pass to a runner arrives at the runner's destination — system-proposed, coach-overridable); undo (folds draw-then-curve into one step); curve authoring (single free-2D apex dot on the selected action; pull off the chord = bend magnitude, slide along the chord = where the bend concentrates; straight by default; bends runs/passes/carries); individual delete (entity or action; Backspace + Delete, guarded against firing while typing in inputs); ball-ownership-on-placement; possession ring.
- **Passive object toolkit:** cones, mannequins, goals (rendered as posts + crossbar + dashed net), mini-goals, and zones (rect via drag-draw, rendered behind entities, semi-transparent) — all placeable and rendering. Zones are **visual/reference-only** (see §4.4). Marker color + size shipped.
- **Identity input:** smart single-field input anchored at the marker on placement — digits route to jersey number, a known position code routes to the position field, freeform routes to a role name; re-click opens a chip editor to layer multiple identity fields. GK is a render-only flag (square marker variant), decoupled from identity fields.
- **Ghost position suggestion:** `inferPosition()` is wired into placement and drag-end, writing silently to the system-inferred-position field. A dashed ghost label renders only above a confidence threshold and only when no explicit identity is set; clicking it commits the suggestion into the explicit position field; any manual typing kills the ghost.
- **Object action-referencing (partial):** `CarryAction` has an optional destination-entity reference; a `resolveTargetPoint(doc, entityId)` helper resolves a static reference point for goals, mini-goals, cones, mannequins, and zones (via centroid), isolated from the possession/position resolvers. Dragging the ball onto a goal or mini-goal creates a Pass (a shot) resolved via `resolveTargetPoint`.
- **Persistence:** Supabase `documents` table, full serialized document as JSONB, lossless round-trip, save/load/list/rename/delete. RLS off (single-user dev; service-role key server-side only).

**Known correctness bugs (TOP PRIORITY — root causes now verified via recon; both fixes are narrow):**
1. **A near-miss shot/pass falls through to a carry.** The possession resolver is already correct (a pass to a goal releases the ball); the bug is hit-testing: goals have a large visual footprint but a tiny hit radius, so a drop near the goal misses and the drag-end silently creates a carry instead of a shot. Fix is catch-radius/hit-testing in `page.tsx` only — do NOT touch the resolver. See §5.1.
2. **Position inference doesn't mirror the flank axis for a down-attacking team.** `computeAxes` flips the attack (Y) axis for team B but not the flank (X) axis, so opposing-team markers infer the same flank (both "LW"). Fix is one mirror in `positionInference.ts`. See §5.2.

**Not built (the actual frontier):**
- The **Frame** as a first-class, complete part of the document (§3) — partial today (`stage.direction` exists as up/down with a runtime toggle; per-team direction, regime, and identification mode are not yet modeled).
- The **narration head** (`lib/intelligence`, model → terminology) — not started. First milestone in §6.
- **Action-decomposition + recognition-signature** dictionary knowledge — stubbed at best.
- The **correction-logging** pipeline.

---

## 2. The world model (Layer 1 — built, frozen core)

The board at any instant is computed from entities + actions on a shared timeline. Keep the engine **dumb**: it knows positions and motion, not soccer meaning. Meaning lives in `lib/knowledge` and the heads.

### 2.1 Entities
Every entity has one immutable system UUID — the only identity. Kinds: player, ball, cone, mini-goal, goal, mannequin, zone.

**Player `display` fields (VERIFIED against `lib/engine/types.ts`; all optional, none touch identity):**
- `jerseyNumber?: number | null` — UI-writable (digits via the identity input). Display only; NOT identity.
- `positionId?: string | null` — UI-writable (a known position code via the identity input). The explicit, coach-set/confirmed position. Distinct from `positionSlot`.
- `roleName?: string | null` — UI-writable (freeform text, e.g. "the 6").
- `drillLabel?: string | null` — system-auto (store sets "1", "2", … on placement). The unique-mode label.
- `positionSlot?: number | null` — system-assigned from a formation; not directly user-writable via the identity input.
- `isGoalkeeper?: boolean` — UI toggle at placement; pure render hint, disjoint from all identity fields.
- `inferredPositionId?: string | null` — **inference-only**, written by `inferPosition()`, NEVER by UI code. In the engine this is a plain string and must never import the knowledge `PositionId` union — the engine stays decoupled from the vocabulary.

`positionId` (user-typed) vs `inferredPositionId` (system-only) are distinct and unambiguous — no naming inconsistency. References resolve through the current display label to the underlying UUID.

**Editor label priority chain (verified, `app/lab/editor/page.tsx`):** `jerseyNumber → roleName → positionId → inferredPositionId → drillLabel → positionSlot`.

### 2.2 Actions (five primitives)
pass, run, carry, mark, hold. Richer concepts (overlap, third-man run, give-and-go) are **dictionary knowledge that decomposes into these** — not new primitives. Pass carries a `passType` (ground/driven/lofted/cross/switch/shot) and a path (straight / bezier control point). Carry has an optional destination-entity reference (§1). Runs and carries support bezier paths (single control point).

### 2.3 Possession (the single authority)
One resolver is the sole authority for ball ownership and ball position at time T. The ball auto-binds to its last receiver and travels with him until another ball-owning action claims it. A carry is a deliberate dribble, never bookkeeping. **This resolver's correctness is the foundation of all narration** — if it mislabels a pass as a carry, every sentence built on the timeline is wrong. See §5.1 for the required fix.

### 2.4 Timeline / beats
Actions are clips on a shared clock with start + duration; the board is computed by sweeping a playhead. **Ball events (possession changes) are the narration backbone** — each is a beat/moment; off-ball motion is described relative to these beats (§6, and North Star §6).

---

## 3. The Frame (NEW — must become a first-class part of the document)

The Frame is the per-document semantic context that tells every head how to interpret the diagram. **Verified current state:** only a fragment exists — `doc.stage` has `fieldExtent`, a single document-level `direction: 'up' | 'down'` (team A's attacking direction, runtime-toggled), `teams: {id, color}[]` (color only — no per-team direction/regime/mode), and `markingLogic: boolean`. There is **no `scoringDirection` field on the document**: it is derived transiently at render time by `buildScoringDirection(stage.direction)` in `page.tsx`, which sets team B to the opposite direction, and passed into `inferPosition` per call. No identification-mode and no direction-of-play-regime concept exist. This fragment must be generalized into a complete, **persisted** Frame. **Design the Frame contract with the driving chat before building; then freeze it in this spec.**

> **Trap to avoid:** when building the real Frame, per-team direction must become **persisted document state**, retiring the transient `buildScoringDirection` render-layer derivation. Do NOT build new Frame features on top of the transient derivation — that creates a split-brain where the stored Frame and the render-derived direction can disagree. Migrate the single `stage.direction` into per-team Frame state in one move.

The Frame configures:

### 3.1 Teams and direction of play
- A list of teams, each with an id, color, and an **attacking direction**.
- **Default derivation (no manual entry required):** the first team placed attacks *up* (toward the top goal); the second team placed attacks *down* (toward the bottom goal). Set piece: only the top goal exists; the attacking team attacks up. Single-team passing pattern: attacks up.
- Per-team direction populates `scoringDirection` (`Record<teamId, direction>`), which `inferPosition` MUST consume so flank labels flip correctly for opposing teams (§5.2).

### 3.2 Direction-of-play regime
One of:
- **single-direction** — teams attack toward a goal (the common case; enables forward/back reading and "to goal" narration),
- **dynamic / multi-directional** — mini-goals around a box, or bumper/possession play that reverses direction; positions generally stop mattering (identification mode → unique-label),
- **none** — no directional meaning.
The system must know the regime before interpreting passes as forward/square/back.

### 3.3 Scoring targets
real goal (optional keeper) / mini-goal(s) / dual-target (e.g. defenders → mini-goals, attackers → real goal) / no-target. Derived by default from goals present + team assignment; explicitly settable.

### 3.4 Identification mode
- **positional** — markers carry inferred, confirmable, overridable roles. Central-midfield inference may return a generic `CM`; a manual override lets the coach specify 6 / 8 / 10 when he wants, and leave it generic when he doesn't. Positional mode is NOT tied to 11v11 (a back-line drill or a midfield-box drill uses it).
- **unique-label** — markers are "player 1, 2, 3…"; positions are meaningless.
Switchable per document, and per team where needed.

### 3.5 Field extent
full / half / blank. Set pieces default to half.

**Presets:** drill / tactic / set piece are Frame presets that set sensible defaults for the above; they are not separate engines or products.

### 3.6 FROZEN Frame contract (v1) — build against this

`doc.frame` (persisted, first-class; replaces the transient render-layer derivation):

    frame: {
      regime: 'single-direction' | 'multi-directional' | 'none',
      regimeSource: 'derived' | 'explicit',
      teams: Array<{
        id: string,
        color: string,
        attackingDirection: 'up' | 'down' | null,   // null valid when regime ≠ single-direction
        directionSource: 'derived' | 'explicit',
      }>,
      identificationMode: 'positional' | 'unique-label',
      identificationModeSource: 'derived' | 'explicit',
      perTeamIdentificationMode?: Record<teamId, mode>,   // optional override layer
      fieldExtent: 'full' | 'half' | 'blank',
      scoringTargets: 'goal' | 'mini-goals' | 'dual' | 'none',
      scoringTargetsSource: 'derived' | 'explicit',
    }

**Source-flag rule (the core mechanism):** derivation rules may freely rewrite
`derived` values as the scene changes; derivation NEVER touches an `explicit`
value; any coach edit in the Frame UI marks that field explicit.

**Derivation rules (v1, deliberately simple):**
- First team placed → attackingDirection 'up'; second team → 'down'. Set at first placement.
- fieldExtent 'full' seeds two real goal entities (top + bottom); 'half' seeds one (top);
  'blank' seeds none. Seeded goals are ordinary entities — UUID, deletable, shootable.
  Deleting a seeded goal marks scoringTargets explicit.
- Regime: real goal(s) present → 'single-direction'; nothing → 'none'.
  (Mini-goal-placement-flips-regime inference is deferred — the *Source machinery
  exists so it can be added later as a pure derivation-rule change.)
- regime 'multi-directional' or 'none' → propose identificationMode 'unique-label';
  'single-direction' → 'positional'.

**Migration:** existing documents' `stage.direction` becomes team A's attackingDirection
(source 'explicit' — it was a manual toggle); team B derived opposite.
`buildScoringDirection` in page.tsx is deleted; `inferPosition` consumes
`frame.teams[].attackingDirection` directly.

**Narration head reads (§6.1 minimum):** regime, per-team attackingDirection,
identificationMode.

---

## 4. Objects and their semantics

### 4.1 Goals / mini-goals
Valid **shot targets**. A ball-origin drag ending on a goal/mini-goal is a **shot** (a Pass with `passType: shot`). The resolver already releases possession from the shooter and leaves the ball loose at the target — that logic is correct; the only issue is the coach reliably *hitting* the goal (a hit-testing fix, §5.1). Some scenes go to a real goal (optional keeper), some to mini-goals, some dual-target.

### 4.2 Cones / mannequins
Passive. Referenceable by narration ("dribble around the cone," "through the gate" — two cones forming a gate). Cone-referencing action paths (orbit/through) are **deferred** pending a shared "curved reference path" primitive (§7).

### 4.3 Scoring direction
Every scene knows its scoring direction(s) from the Frame so passes/shots/animation and forward/back reading are correct.

### 4.4 Zones (visual/reference-only — do NOT make them action targets)
Zones are descriptive regions (channel, half-space, in-behind) for narration, referenced by annotations/intent arrows. **A zone is never a ball-drop/action target.** Making a zone a Carry/Pass target previously left the ball in a loose state and silently broke subsequent pass authoring; it was fully reverted. A pass "into a zone" is really a pass to a player running into that zone. Keep zones passive.

---

## 5. Required correctness fixes (do these first — highest priority)

### 5.1 Fix target hit-testing so a near-miss shot/pass does not become a carry
**Symptom:** dragging the ball toward a goal (a shot) records as a carry — the ball stays bound to the shooter and both move together.
**Verified root cause (recon-confirmed):** the possession resolver is **already correct** — a Pass landing on a non-player target (goal/mini-goal) releases possession (`resolvePossessionAtT` sets owner = null / ball loose at the target). The bug is purely **hit-testing precision**. `findEntityAtPoint` (`app/lab/editor/page.tsx` ~L82) tests `dx²+dy² <= r²` with `r = entity.radius ?? HIT_RADIUS(22)`. Goals have a large visual footprint (posts + crossbar + net) but a tiny/undefined `radius`, so a drop the coach reads as "on the goal" misses the 22px circle → `targetId` is null → the drag-end fallthrough (~L813) fires `addCarry(x,y)`. So the pass never gets created; a carry does.
**Required fix (narrow — do NOT touch the possession resolver):**
- Give goals/mini-goals a **catch-radius proportional to their visual footprint** (a goal-specific halo), so a drop anywhere near the goal mouth resolves to the goal as a shot target.
- Make the carry fallthrough refuse to fire when the drop is a **near-miss of a valid target** (player or goal/mini-goal) — the carry default should only trigger on a genuine drop in empty space.
- Also confirm the same near-miss issue doesn't affect the specific player-pass case Ryan observed (a pass to one marker becoming a carry) — likely the same radius fallthrough; verify.
- Verify with real playback per target kind: player pass, goal shot, mini-goal shot — each must release the ball.
- Fix scope is `page.tsx` hit-testing/drag-end only. `resolve.ts` possession logic is correct; leave it.

### 5.2 Mirror the flank axis for a down-attacking team in position inference
**Symptom:** a yellow and a blue marker placed symmetrically both infer the same flank (both "LW") instead of opposite flanks.
**Verified root cause (recon-confirmed):** `computeAxes` (`lib/knowledge/positionInference.ts` ~L27) correctly flips the **attack axis (Y)** for a `'down'`-attacking team (`attackProgress = (y - FIELD_Y_MIN)/fh`) but does **not** mirror the **flank axis (X)** — `flankPos = (x - FIELD_X_MIN)/fw` is identical for both directions. So a down-attacking team's canvas-right is treated as their right flank when, from their attacking perspective, it is their left. `buildScoringDirection` (`page.tsx` ~L72) already derives team B's direction as the opposite of `stage.direction` and passes it in correctly; the inference function just ignores it for left/right.
**Required fix (narrow):**
- In `computeAxes`, when the team's attacking direction is `'down'`, mirror the flank axis: `flankPos = (FIELD_X_MAX - x)/fw`. (Generalize cleanly if `'left'`/`'right'` directions are ever used, but only `'up'`/`'down'` exist today.)
- Verify: yellow (up) and blue (down) placed symmetrically infer opposite flanks — one LW-side, the mirrored other RB-side.
- This is a `positionInference.ts` fix only. It is independent of §5.1 and can ship separately.

---

## 6. The narration head (first intelligence build — `lib/intelligence`)

**Goal:** model → terminology. Prove the system understands what is drawn by stating it in soccer language.

### 6.1 First milestone (the testable bar)
A **single-team, ball-only passing pattern** (no runs), in positional identification mode, narrated as connected possession events with roles AND directional interpretation:
- name each pass by role ("the 4 plays the 6"),
- classify each pass relative to the team's attacking direction as **forward / square / backward**,
- infer **turning vs. laying-off/bouncing**: a receiver who then plays forward is turning and playing forward ("the 6 turns and plays the 9"); a receiver who plays it back/square is bouncing/laying it off ("the 6 bounces it back to the right back").
Inputs: the timeline's ball events (from the possession authority), the roles (from `lib/knowledge` `resolveTerm` / `inferPosition`), and the Frame's direction of play. This is tractable geometry + dictionary lookup. **Build and test this before touching runs.**

### 6.2 Next (do not start until 6.1 is solid)
Runs and off-ball movement, described relative to ball beats. High-level rules like "follow your pass" generate timed runs. Simultaneous vs. sequential timing is the coach's finishing touch.

### 6.3 Correction loop (build the hook with 6.1)
Every narration the coach corrects is logged against a dictionary term ID (accept/reject/edit). Design the narration output so each clause is attributable to a term, and emit a loggable event on correction — even before the logging store is wired. This log is the dataset that later makes generation learnable.

### 6.4 FROZEN §6.2 contract — recognition signatures (Tier 1)

Signatures live in lib/knowledge/signatures/ as TypeScript entries; the
human-authored dictionary file is the source of truth for vocabulary,
silence conditions, and contradictions — treated as DRAFT content, audited
term-by-term as each signature is built. Signature shape:

    TermSignature {
      termId: string
      actor: { line?: 'defender'|'midfielder'|'forward'; role?: string[] } | 'any'
      trigger: Predicate[]        // ALL must hold
      silence: Predicate[]        // ANY holding suppresses
      contradictions: Array<{ termId: string, scope: 'beat'|'player-beat'|'possession' }>
      anchor: 'ball'|'teammate'|'structure'
      specificity: number         // same-action collisions: highest rank speaks,
                                  // subsumed termIds still logged in clause termIds
      phrase: { primary: string; variants: string[] }
    }

Predicates draw from a closed primitive vocabulary computed off the world
model (lib/knowledge/primitives): distance-to-ball trend, run vector vs
attack axis, path-inside/outside-teammate, beyond-furthest-teammate (Tier 1
proxy for the last line; true last-line arrives with opponents/Tier 2),
timing-overlap of run and pass, runtime zone containment (zones.ts gains
real geometry — required, retiring its descriptive-only status), and
receiver-of-next-pass.

Run-term lifecycle (across beats): a fired run term attaches to its beat;
if a later ball event delivers to the runner while/after the run, the
narration at THAT beat references the earlier term ("continuing his run").
Matcher maintains fired-unresolved run terms per player per possession.

Tier ordering: Tier 1 (ball + teammates only) is milestone §6.2. Tier 2
(requires opponents: DEF_*, draw/dummy, pin, goal-side, overload) follows.
Tier 3 (body shape/pressure) fires weakly and is tuned by corrections.

---

## 7. Deferred (logged, not lost)
- Directional possession offset — the ball leads the player's travel direction / faces play; a pass leads a moving receiver so it arrives in front of him; a back-to-goal receiver keeps the ball on the arrival side. High value, informed by how dribbling/receiving get authored.
- No-through-marker crossing — an owned ball's side change rides the perimeter arc.
- Cone-referencing / orbit paths and overlap gestures — pending a shared "curved reference path" primitive.
- S-curve / second bezier handle. Polygon zones (type supports it; editor draws rect only). Marker label hierarchy (number prominent, position small). Beat CRUD objects. Full RLS/auth gating.
- Goal entity orientation/rotation (goals currently always face north-south; needed only if horizontal field orientation is ever supported).
- Mini-goal-placement-as-regime-cue derivation (placing mini-goals proposes multi-directional regime + unique-label mode; add as a derivation rule on top of the *Source machinery).

---

## 8. Open (settle before the relevant build)
- ~~Freeze the full Frame contract~~ — FROZEN as §3.6. Build against it.
- Identity field names are **verified** (§2.1) — no reconciliation needed. `positionId` (UI) vs `inferredPositionId` (inference-only) are clean.
- `lib/knowledge` export surface is **mostly clean**: the editor imports `inferPosition` from the `@/lib/knowledge` index (good). `formations.ts` is not re-exported from the index (used internally by `positionInference`) — fine unless a head needs `getFormation` directly, in which case add it to the index. `zones.ts` has geometry as descriptive strings only (no runtime geometry-testing function yet) - zones.ts descriptive-only line resolved-by-§6.4.; `scoring.ts` is descriptive only (no resolution logic) — both fine for narration's first milestone, which doesn't need them.

---

## 9. Environment / build facts (verified — do not re-derive)
- Repo: `github.com/ryanrkrueger7/gaffer`. Deploy: Vercel, auto-deploy on push to main.
- Stack: Next.js 14 (App Router, no src dir, `@/*` alias), TypeScript, Tailwind, Konva + react-konva (pinned `react-konva@18.2.10` / `konva@9.3.6` — do NOT upgrade to 19), Zustand, Supabase, Lucide.
- Coordinate space: **raw pixels, fixed 800×600 canvas, origin top-left, effective field boundary 10,10–790,590, no normalization layer anywhere.** All inference and geometry use this space.
- `next.config.mjs` marks `canvas` as a webpack external. Installs use `--legacy-peer-deps`. No emojis anywhere — Lucide icons only.
- `PositionId` (20 values) and all soccer vocabulary stay confined to `lib/knowledge`. The engine's inferred-position field is a plain string and never imports the union.
- **Dev rules:** Claude Code never runs `npm run dev` (Ryan runs it on :3000); it uses `npm run build` to verify and `npm run engine:demo` for the round-trip check. Commit working state immediately after each green build. Prompts are surgical and scoped (Claude Code over-architects); split fiddly geometry into its own small prompts. **Contracts come from verified repo state, never from memory or description.**

---

## 10. File inventory (verify against repo; names provisional)
```
lib/engine/            # world model: types, factory, serialize, resolve (possession/position/board), playback
lib/knowledge/         # dictionary: types.ts, formations.ts, positionInference.ts, roles.ts, zones.ts, scoring.ts, index
lib/intelligence/      # narration head — TO BE CREATED (§6)
components/…/BoardRenderer  # single unified Konva renderer (shared infra)
app/… editor           # authoring surface (Zustand store, gestures, toolkit, identity input, ghost suggestion)
app/… engine proof     # frozen reference route — do not modify
docs/GAFFER_ENGINE_SPEC.md  # this document
```

---

*End of spec v2. The world model is built. The immediate work is correctness (§5), then the narration head's first milestone (§6.1). Everything is judged by whether it makes the system understand the pitch more accurately.*