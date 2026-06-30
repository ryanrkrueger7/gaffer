# Gaffer — Engine Specification

*Canonical reference for the tactical creation engine. This is simultaneously (a) what Claude Code builds against, (b) the schema narration will later compile into, and (c) the source of truth that prevents drift. Version 0. Storage schema marked "reference — refine in build." Everything else is decided unless flagged open.*

---

## 0. What this document is

This is **not** a rebuild blueprint that says tear down and start over. It is an **engine specification plus a Reuse / Rework / New inventory.** The existing Saideira whiteboard is the foundation we learned from; most of its *visual layer and rendering* survives. What gets replaced is the **data model behind the canvas** — and that single replacement is the entire rebuild.

We are not migrating old Saideira animations. They served their purpose as a test bed and are disposable. We keep assets, field views, the tool shell, and the visual language; we rebuild content fresh on a clean model. This frees the new schema from any backward-compatibility compromise.

---

## 1. Product spine (locked)

- **Gaffer is a coach's tool.** Single user: the person responsible for what the team does on the field. The player/team experience is a *projection* of what the coach creates, never a co-equal product.
- **The product is the creation and sharing of tactical content.** RSVP, organization, and comms are a layer wrapped around the core, addressed later — never co-developed with it.
- **The wedge is a whiteboard so intelligent that creating anything is easy.** Narration / text-to-diagram is a *second input head* built on top of the same model — not the starting point. "Creating from nothing doesn't happen until you can create anything easily while using the system."
- **Platform stays web.** Konva is retained as the renderer. The rebuild is internal: swap the brain behind the canvas, not the canvas.

---

## 2. The engine model

The board at any instant is **computed** from persistent entities and the actions performed on them across a timeline. We never store photographs of the board. This is the reversal of the old `animation_steps` snapshot model and the source of every downstream win (mid-sequence editing, curved movement, real timing, less setup labor).

### 2.1 Entities (persistent objects with identity)

Every entity has one **immutable system ID**. Identity is *only ever* tied to that ID — never to a number, label, or position. This is load-bearing: it is what makes a player "the same player" across a pass and a later run, and what makes mid-sequence editing safe.

| Entity | Notes |
|---|---|
| **Player** | Team A / Team B / neutral. The number a coach sees is a *display layer* (below), not identity. |
| **Ball** | Single entity. State at any time: carried, in-flight, or loose. |
| **Cone / marker** | Passive, placeable. |
| **Mannequin** | Passive static defender for drills. |
| **Goal / mini-goal** | Target; enables shot/finish actions. |
| **Zone** | A named region (press zone, "this channel"). Referenced by annotations and intent arrows; does not move. Replaces most old freeform-shape usage. |

**Player display layers** (all optional, none touch identity):
- `positionSlot` — 1–11 positional number (GK = 1), the tactical role.
- `jerseyNumber` — the real player's number, if representing an actual person.
- `drillLabel` — ad-hoc 1..N label for small-sided setups and the numbered-sequence builder.
- `roleName` — e.g. "LCB", "the 6" — for soccer-relative reference.

When the coach says "1 passes 2," the system resolves the *current* display label to the underlying ID. Renumbering or reusing a drill never breaks references because the ID is constant.

### 2.2 Actions (what animates on the timeline)

Five primitives. Kept deliberately small; richer concepts (overlap, third-man run) decompose into these — they are *directory knowledge*, not new action types.

| Action | Parameters |
|---|---|
| **Pass** | `target` (entity or location); `path` (straight / bezier with control point); `passType` (ground / driven / lofted / cross / switch / shot); `duration` |
| **Run** | `destination` (location or landmark); `path` (straight / bezier); `duration`; `relTiming` |
| **Carry** | `path` (straight / bezier); `duration`. Binds the ball to the player for its duration. |
| **Mark** | Persistent **constraint**, not a one-shot. `assignedTo` (attacker entity) + `offset` vector, or `zonal` (no binding). |
| **Hold** | `duration` only. A beat with no movement — pure pacing. |

**Decisions:**
- **Cross, switch, clearance, shot are a `passType` parameter, not separate actions.** Keeps the primitive set tiny while recognition and narration can still say "cross." Promote one to a first-class action only if it needs genuinely different *behavior* (e.g. a cross that hangs and targets a zone). Bet: parameter is enough for v1.
- **Intensity / pass weight does not exist as a parameter.** It is an emergent reading of distance-over-duration. A run covering more ground in less time reads as a sprint; nothing to set.

### 2.3 Marking constraint (the highest-value safe-inference tool)

A defender tagged **man-marking** holds a **goal-side offset vector** relative to its assigned attacker, set once at bind time (default: goal-side, tight). From then on the defender's position = attacker's position + offset, every beat. When the attacker runs, the defender's path is the attacker's path shifted by the offset — uniform gap, automatic. A **zonal** defender has no binding and ignores runs. Tagging each defender zonal-or-man once is the entire input. This is what kills the "drag both teams around every step" labor on set pieces and pressing tactics.

### 2.4 Timeline (tracks, not slides)

Actions are **clips on a shared clock** — each has a `start` and a `duration`, and clips **overlap**. The board is computed by sweeping a playhead across all clips. This is what makes a switch-of-play feel continuous: the ball is in flight for two seconds while the far-side block shifts and an annotation appears and clears *during* that flight. The old four-captures-of-a-switch workaround was a symptom of having no way to express concurrent duration; the timeline gives the coach the thing the workaround reached for.

### 2.5 Beat (the authoring handle)

The **beat** is how the coach thinks and how edits are expressed: "set up → now this happens → now this." Underneath, a beat is *a cluster of actions sharing roughly the same start*, plus an optional annotation and a pacing duration. The coach never confronts the raw timeline for simple work; he adds beats. Editing a beat leaves downstream beats intact because entities persist — the "screwed everything after it" problem disappears structurally.

> **Open refinement (build):** exact mapping between beats (authoring) and absolute clip times (engine). Working model: actions carry absolute `start`+`duration`; each belongs to a `beatId`; beats are ordered and carry the annotation + a hold; dragging a beat longer shifts subsequent beats' clips. Validate when wiring playback.

### 2.6 Annotations and labels (system-positioned, not free text)

The old pain was the *absence of a layout system*, not the absence of pop-ups. Two types:

- **Label** — short, entity-anchored, rides with the marker, lives in canvas space, auto-sized and uniform ("6", "GK", "zonal").
- **Annotation** — explanatory ("forces the ball wide"). Lives in a **system-positioned display layer**, not free canvas space. Timeline-bound. The coach writes the words; he never places or sizes the box. Rendering form (card / callout / caption) is a later skin decision; the object is typed and timeline-bound regardless. Multiple-at-once and density limits are display-layer problems solved when that layer is designed.

---

## 3. The timing model (three owners)

| Concern | Owner | What it covers |
|---|---|---|
| **Choreography** | System (never the coach) | Run path smoothing, follow-pass spacing so no one looks like they're dribbling, within-clip motion feel. If the coach ever hand-tunes this, we've failed. |
| **Relational timing** | System proposes, coach overrides | Whether one clip fires *with*, *before*, or *after* another. The give-and-go "run with the ball or after" toggle, generalized to every multi-action moment. |
| **Pacing** | Coach | Clip duration and Holds — how long a moment lasts, where the story breathes. Your "capture twice to hold longer" becomes "drag the beat longer" or "drop a Hold." |

That is the complete timing model. Nothing falls outside it.

---

## 4. Tool taxonomy

There is **one body of soccer knowledge — the directory.** It serves three consumers: *recognition* (so direct manipulation is smart), *generation* (so narration compiles into it), and a small set of *buttons* (express lanes into it). The button question is a narrow filter on top of the directory, not a separate list.

### The button filter (use this to make every future call)

> A concept earns a button only if invoking it **collapses multiple coordinated operations whose relationship the system resolves** into fewer inputs than the manual version — **and** removes timing/spacing the coach would otherwise hand-tune. If the manual version is one drag, there is no button.

### The four tool species

**Mechanical tools** — zero soccer meaning, pure editor ergonomics. Build all.
`align`, `distribute-evenly`, `multi-select-drag`, `duplicate`, `group`, `mirror-across-axis`, `snap-to-shape`.

**Setup inference** — safe placement cleanup, one-shot, pre-animation, accept-first.
- Formation presets **with auto-mirrored opponent facing the correct direction** (never built before — build now).
- Cone cluster → shape (4 cones → diamond/box; offer, don't force).
- "Place N of color → offer N mirrored of the opposite color."
- Stage presets (see §6).

**Expanders** — one-shot soccer constructs that generate primitives, then they're done. Local value, must clear a higher bar.
- **Give-and-go**: select carrier → select wall player → select end location → choose run-with-ball-or-after. Generates pass + return-run + return-pass with resolved timing.

**Constraints** — persistent, set once, govern every beat. Value compounds over the drill; almost always worth building.
- **Man-mark / zonal tag** (see §2.3).
- **Intent arrow + auto-hold** (the baked-in ritual): draw a forbidden-lane or force-direction arrow → it ghosts the path, shows the annotation, holds the beat to read, then movement plays. The coach's repeated manual sequence (show arrow + label → delete → run) expressed once.

### Typed arrows (most of the tactic-creation intelligence)

Arrows are typed, and type is usually inferable from context:
- **Pass path** (from the ball) → ball movement.
- **Run path** (from a player) → player movement.
- **Carry path** → dribble.
- **Intent arrow** (crossed-out lane / "force here") → stays annotation, never animates.

That single classification is most of the intelligence in tactic creation.

### Directory-only knowledge (no buttons)

Exists for recognition + narration, never adds a button. Grows freely — it is data, not UI: *overlap, underlap, third-man run, near/far-post run, double-movement, check-to-feet, blind-side run, drop/support, rotation, press-trigger, cover-shadow, recovery run, …*

Worked examples of the filter:
- **Overlap → no button.** Manual is one drawn run. A button would add inputs. Directory only.
- **Near/far-post run → no button.** One drag. Directory only.
- **Give-and-go → button.** Many coordinated operations + timing collapse to three clicks and a toggle.
- **Man-mark → button (constraint).** Saves re-dragging across *all* beats.

### The numbered-sequence pass builder (the sleeper — near-term, not far-future)

Entities are placed and named (`drillLabel`). The coach types "1 to 2, 2 to 3, 3 plays 4" and the canvas assembles the passes. This needs no soccer-relative reasoning — it parses `entity → entity` against a closed list of numbers and the word "pass." It is **the first narration**, buildable far earlier than full NLP, and it proves the second-input-head architecture on a tiny unambiguous grammar before "play the winger in behind" is ever attempted.

> Note: a button that *auto-passes the ball around on its own* (the rejected "simulate play") is risky generation — out. The numbered builder is the opposite: the coach specifies the whole sequence; the system only executes it. Safe, in.

---

## 5. Inference posture

**Safe inference only for v1**, always **accept-first** (a suggestion the coach confirms), never an automatic act. Safe inference *cleans what the coach did* (rough drag → clean pass; four cones → diamond; five yellows → offer five mirrored reds).

**Risky inference** — *generating what the coach did not do* (e.g. auto-shifting the whole block on a switch) — is **out** until the model is proven, and even then arrives only as an acceptable suggestion. Low input + high guess = the coach ends up undoing the system's work, which is worse than doing it himself.

### Default-inference rules (what keeps the timeline closed 90% of the time)

The under-the-hood timeline is only trustworthy if the defaults are good:
- **Default durations** — fixed sensible constants by action type (pass short; run scales gently with drawn distance; carry with path length). The coach sets nothing.
- **Default relational timing** by pairing — pass + receiving run overlap so the ball arrives as the runner does; give-and-go return fires after the wall touch; follow-run starts just after its pass so it never reads as dribbling.
- **Default beat spacing** — consecutive beats play back-to-back with a small natural breath; no gap to author, no overlap to fear.
- **Annotation auto-hold** — any beat with an annotation gets enough dwell to read it (length scales to text), and movement in that beat waits behind the annotation. *This is the big one for text-heavy tactics:* the presence of text drives the pacing, so a coach writing lots of description never thinks about timing. The pressing pattern that felt un-narratable now has zero timing labor in the default path.

### Surfaceable timeline

Under the hood by default, **surfaceable on demand**. Simple diagrams: place, drag, done — the timeline never opens. Intricate work (six runners on different counts, heavy annotation) opens the timeline for precise clip tuning. This is *not* the old capture-engineering: there, manual capture was the only unit, so the default *was* the engineering. Here the default is genuinely good and the timeline is a precision instrument for the exception.

---

## 6. Stage presets

Drills, tactics, and scouting are **one engine**; set pieces are the same engine with a different stage. No four separate tools. A stage preset configures:

| Config | Options |
|---|---|
| `fieldExtent` | full / half / blank |
| `direction` | direction of play (toward which goal) |
| `teams` | count + colors (one team, two teams, neutrals/bumpers) |
| `markingLogic` | on / off |
| density expectation | movement-heavy vs. annotation-heavy (tunes default pacing) |

Examples: pressing tactic = (full, both teams, annotation-heavy, sparse movement); passing pattern = (one team + ball, movement-heavy, few annotations); attacking corner = (half, toward goal, both teams, marking on). Two coaches' outputs differ in *content*, never in *tool*.

**Set pieces deliberately resist narration.** Curve, zigzag, momentary stops, and exact run shape are the *content* of a set piece — precisely what words describe badly. Set pieces lean hardest on direct manipulation (great curved-path drawing) + the man-mark constraint. Narration on set pieces is a poor fit we decline on purpose, not a gap.

---

## 7. Reference storage schema

*Reference — refine in build. This replaces the old `Snap` + `animation_steps` JSONB. It is a direct serialization of §2, not an optimization. Serializing the model is also the test that the model is complete.*

```jsonc
{
  "schemaVersion": 1,
  "meta": { "id": "uuid", "name": "", "description": "",
            "type": "drill|tactic|scouting|set_piece",
            "createdBy": "uuid", "createdAt": "iso" },

  "stage": { "fieldExtent": "full|half|blank", "direction": "up|down",
             "teams": [{ "id": "A", "color": "yellow" }],
             "markingLogic": false },

  "entities": [
    { "id": "uuid",                          // immutable identity — the only identity
      "kind": "player|ball|cone|minigoal|mannequin|goal|zone",
      "team": "A|B|neutral|null",
      "initial": { "x": 0, "y": 0 },         // start position; zones carry a region instead
      "display": { "positionSlot": 4, "jerseyNumber": null,
                   "drillLabel": null, "roleName": "LCB" },
      "color": "yellow", "radius": 14 }
  ],

  "actions": [
    { "id": "uuid", "entityId": "uuid", "beatId": "uuid",
      "kind": "pass|run|carry|mark|hold",
      "start": 0.0, "duration": 0.8,         // seconds, absolute on shared clock

      // pass
      "target": { "entityId": "uuid" },       // or { "x", "y" }
      "path": { "type": "bezier", "cx": 0, "cy": 0 },
      "passType": "ground|driven|lofted|cross|switch|shot",

      // run
      "destination": { "x": 0, "y": 0 },       // or { "landmark": "near_post" }

      // mark (persistent constraint)
      "assignedTo": "uuid", "offset": "goal-side-tight",  // or { "dx", "dy" } or "zonal"

      // relational timing (system default unless overridden)
      "relTiming": { "ref": "actionId", "mode": "with|after|before", "gap": 0.2 } }
  ],

  "beats": [
    { "id": "uuid", "order": 0, "annotationIds": ["uuid"], "hold": 0.0 }
  ],

  "annotations": [
    { "id": "uuid", "text": "forces the ball wide",
      "kind": "caption|intent", "beatId": "uuid",
      "anchorEntityId": null, "holdAuto": true }
  ],

  "markup": [                                  // static, non-animated highlight shapes
    { "id": "uuid", "shapeType": "ellipse|rect|line", "x": 0, "y": 0,
      "width": 0, "height": 0, "color": "", "opacity": 0.3 }
  ]
}
```

Notes: `markup` absorbs the legacy freeform shape/triangle tools (highlight regions) that don't become Zone entities. Legacy text boxes migrate to `annotations`; legacy labels/numbers migrate to entity `display`.

---

## 8. Reuse / Rework / New inventory

Grounded in the Claude Code codebase findings. The boundary between "keep" and "replace" must be unambiguous so the swap is surgical.

### Reuse (keep, enhance only visually)

- **Konva as renderer.** Stays.
- **Marker / ball / cone / mini-goal rendering** (Konva primitives) — keep the approach, restyle for polish.
- **Field views** (full / half / blank) — keep the concept.
- **Tool shell** — `TacticalWhiteboard` is effectively standalone (imports only react, react-konva, lucide-react; zero auth/Supabase/team coupling; clean `forwardRef` + `useImperativeHandle` handle). Lifts out cleanly as the coach-tool core.
- **Undo/redo** concept — reconceived as action-level (see Rework).
- **Formation presets** (5 formations) — keep, extend with opponent auto-mirror.

### Rework

- **Data model** — `Snap` (8 flat parallel arrays: markers, arrows, objects, labels, numbers, boxes, shapes, triangles) → **entities + actions + timeline + beats + annotations**. The core rework.
- **Playback** — `DrillPlayer`'s lerp-between-snapshots (ANIM 1200 / PAUSE 800 / ANNOT 2000, markers+objects lerp only, everything else binary-snaps at t=0.5) → **compute board at time T from actions**, with bezier paths and purposeful annotation appearance.
- **Unify the duplicated renderer** — `TacticalWhiteboard` and `DrillPlayer` currently render independently with duplicated code. Collapse into one `renderBoard(computedState)` used by both edit and playback. Eliminates editor/playback drift bugs; enabled for free by the computed-board model.
- **Pitch lines** — currently vector but rough, over a green gradient with a decorative stripe overlay. Redraw as crisp vector at logical resolution. (No raster to swap — it was never an image.)
- **Annotation/label system** — free-placed text boxes (sizing was wonky, had to dodge markers by hand) → system-positioned display-layer annotations + entity-anchored labels.
- **Alignment** — manual align/distribute buttons → safe-inference shape snapping (accept-first), buttons retained as fallback.
- **State management** — local React state + 8 parallel `useRef` arrays (a stale-closure workaround) → a **Zustand store** (already a dependency) for engine state (entities, actions, timeline, playhead, selection, tool). Enables clean action-level undo and the surfaceable timeline.
- **Arrows** — generic run/pass → **typed** (pass / run / carry / intent).

### Build new

- Entity identity model (immutable ID + display layers).
- Five action types with duration + bezier paths.
- Timeline with overlap; beat authoring layer.
- Choreography engine (relational-timing defaults, follow-pass spacing, path smoothing).
- Give-and-go expander.
- Man-mark / zonal constraint (goal-side offset vector).
- Intent-arrow + auto-hold ritual.
- Numbered-sequence pass builder (first narration).
- Opponent auto-mirror on formation presets.
- Stage presets.
- Surfaceable timeline editor.

---

## 9. Terminology directory (parallel track — not a build blocker)

The full dictionary serves recognition and narration, which both come *after* the manual whiteboard is great. The engine build needs only the primitives, the small button list, and the stage presets. So the dictionary is a **living companion document built in parallel**, seeded by scrubbing public soccer-terminology resources, authored and tailored by Ryan.

**Entry structure** (makes each term triple-duty — human-readable, engine-decomposable, recognizable later):

```
Term:         overlap
Aliases:      "overlaps", "goes round the outside", "wide run beyond"
Plain def:    a player runs from behind/inside a teammate to a wider, more advanced position
Decomposes:   Run (bezier, around teammate's outside, to advanced-wide)
Status:       directory-only (no button — one drag)
Rel. timing:  starts as/just before the carrier is engaged
Recognition:  run path originating behind a teammate, curving outside and forward
```

The dictionary grows for years and costs nothing to extend — it is data, not UI.

---

## 10. First three days (build beside the live app, touch nothing that works)

- **Day 1 — Model, no UI.** Stand up entity-action-timeline as pure types/logic. Define entity, the five actions, the timeline, beats. Get it serializing to the §7 schema and back. No Konva yet. Prove the model holds.
- **Day 2 — Model → renderer.** Wire the model to the existing (unified) Konva renderer in an isolated route. Place two player entities and a ball; compute board state at time T and draw it. Prove the kept renderer draws from the new brain.
- **Day 3 — One primitive end-to-end.** Implement **Pass** with duration and a bezier path, playing back through the timeline. One clean animated pass, authored as an action, not a snapshot. That single pass is the proof the whole rebuild rests on; everything else repeats the pattern.

Three days in: a passing ball that proves the model, the renderer reuse, and the serialization — with the live Saideira app still standing untouched.

---

## 11. Open questions (genuinely unresolved)

- **Beat ↔ absolute-time mapping** (§2.5) — confirm the working model when wiring playback.
- **Landmark representation** — how a soccer-relative destination ("near post", "the channel") is stored and resolved to a coordinate at render time. Touches the schema; settle before narration.
- **Markup layer scope** — how much freeform static shape capability to retain vs. push everything into Zone entities + annotations.
- **Cross/shot promotion** — whether any `passType` needs to become a first-class action for distinct behavior. Defer until a concrete case forces it.

---

*End of specification v0. Everything above §11 is decided. Downstream specs (the build-sequencing Claude Code prompts, the player-facing projection, the comms/org layer) inherit from this document.*
