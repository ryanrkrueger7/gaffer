# Gaffer — Engine Specification

*Canonical reference for the tactical creation engine. This is simultaneously (a) what Claude Code builds against, (b) the schema narration will later compile into, and (c) the source of truth that prevents drift. Version 1 — updated after the Day 1–3 engine proof. Storage schema marked "reference — refine in build." Decisions are locked unless flagged open or deferred.*

---

## 0. What this document is

This is **not** a rebuild blueprint that says tear down and start over. It is an **engine specification plus a Reuse / Rework / New inventory.** The old Saideira whiteboard was the foundation we learned from; its visual language and rendering approach inform the new build. What we replaced is the **data model behind the canvas** — and that replacement is the entire rebuild.

We did not migrate old Saideira animations. Saideira is frozen as a portfolio artifact (git tag `saideira-v1`); Gaffer is a clean new repo. The new schema owes nothing to backward compatibility.

---

## CURRENT STATUS (read this first)

**The engine proof (Days 1–3) is complete and validated.** The entity-action-timeline model works end to end: actions authored on a timeline compute a live board state that plays back in real time. Specifically proven on the `/lab/engine` route:

- A pass travels to a **moving** receiver and arrives at the receiver's position *at the moment of arrival* (not his start position).
- On arrival the ball **auto-binds** to the receiver and travels with him.
- The receiver **carries** the ball along a **bezier curve** (real curved motion, not x-y straight lines).
- The ball then **releases** on the next pass to a third player.
- Motion is eased (accelerate/decelerate), playback runs via requestAnimationFrame, with Play/Pause/Restart.

**What this means:** the snapshot model is dead and replaced. The model is no longer a hypothesis — it is working code.

**What is NOT built yet:** any authoring surface. Every document so far has been hand-coded in a demo file. The next phase is the **first authoring tool** — placing entities and drawing actions by hand, then playing back what you built (reproducing the Day-3 sequence, coach-authored rather than hardcoded). The system does not generate anything yet.

**Immediate next build:** `/lab/editor` — place players + ball, draw a pass, draw a run, press play, watch the engine animate the hand-authored document. Introduces the Zustand store. No generation, no NLP.

---

## 1. Product spine (locked)

- **Gaffer is a coach's tool.** Single user: the person responsible for what the team does on the field. The player/team experience is a *projection* of what the coach creates, never a co-equal product.
- **The product is the creation and sharing of tactical content.** RSVP, organization, and comms are a layer wrapped around the core, addressed later — never co-developed with it.
- **The wedge is a whiteboard so intelligent that creating anything is easy.** Narration / text-to-diagram is a *second input head* built on top of the same model — not the starting point. "Creating from nothing doesn't happen until you can create anything easily while using the system."
- **Platform stays web.** Konva is retained as the renderer. The rebuild is internal: swap the brain behind the canvas, not the canvas.

---

## 2. The engine model

The board at any instant is **computed** from persistent entities and the actions performed on them across a timeline. We never store photographs of the board. *(Validated Days 1–3.)*

### 2.1 Entities (persistent objects with identity)

Every entity has one **immutable system ID** (crypto.randomUUID). Identity is *only ever* tied to that ID — never to a number, label, or position. This is what makes a player "the same player" across a pass and a later run, and what makes mid-sequence editing safe.

| Entity | Notes |
|---|---|
| **Player** | Team A / Team B / neutral. The number a coach sees is a *display layer* (below), not identity. |
| **Ball** | Single entity. State at any time: carried/owned, in-flight, or loose. |
| **Cone / marker** | Passive, placeable. |
| **Mannequin** | Passive static defender for drills. |
| **Goal / mini-goal** | Target; enables shot/finish actions. |
| **Zone** | A named region (press zone, "this channel"). Referenced by annotations and intent arrows; does not move. |

**Player display layers** (all optional, none touch identity): `positionSlot` (1–11, GK=1), `jerseyNumber` (real player), `drillLabel` (ad-hoc 1..N for small-sided + the numbered-sequence builder), `roleName` ("LCB", "the 6"). References resolve through the *current* display label to the underlying ID, so renumbering/reuse never breaks references.

### 2.2 Actions (what animates on the timeline)

Five primitives. Richer concepts (overlap, third-man run) decompose into these — they are *directory knowledge*, not new action types.

| Action | Parameters |
|---|---|
| **Pass** | `target` (entity or location); `path` (straight / bezier with control point); `passType` (ground / driven / lofted / cross / switch / shot); `duration` |
| **Run** | `destination` (location or landmark); `path` (straight / bezier); `duration`; `relTiming` |
| **Carry** | `path` (straight / bezier); `duration`. The ball travels with the player. **Carry is a deliberate dribble, not a bookkeeping requirement** — see possession binding. |
| **Mark** | Persistent **constraint**, not one-shot. `assignedTo` (attacker entity) + `offset` vector, or `zonal`. |
| **Hold** | `duration` only. A beat with no movement — pure pacing. |

**Decisions:** cross/switch/clearance/shot are a `passType` parameter, not separate actions. Intensity/pass weight does **not** exist as a parameter — it is emergent from distance-over-duration.

### 2.3 Possession binding *(NEW — proven Day 3)*

**The ball auto-binds to its last receiver and stays with him until another ball-owning action claims it.** Rules, as implemented in `resolveBallPosition`:

- Before the first ball action: ball rests at its initial position (or on its initial owner).
- **During a Pass:** in flight — interpolate from passer's position at pass-start to the **receiver's perimeter** position at pass-end (the receiver's position *at arrival time*, which may differ from his start if he is running).
- **After a Pass, until the next ball action:** the ball is **bound to the receiver** and returns the receiver's resolved position (resting or moving). The ball is never abandoned mid-pitch.
- **During a Carry:** the ball follows the carry path with the carrier.
- **After a Carry:** bound to the carrier.

Consequence: a coach never adds a Carry just to keep the ball with a player. The ball stays with whoever last received it automatically. A Carry is only ever a deliberate dribble along a path.

### 2.4 Ball positioning / "in possession" rendering

The ball, when owned by a player, renders **tangent to the marker perimeter** — the player and ball circles touch but never overlap, and the ball is never centered on a marker. The only no-offset state is mid-flight between two perimeters. *(Basic fixed-direction version proven Day 3; offset logic lives in `resolve.ts`, never the renderer, so all views agree.)*

**Deferred refinements (NOT built — for the authoring tool phase):**
- **Directional possession offset:** the ball should trail the player's travel direction rather than sit at a fixed goal-side point. A receiver with his back to goal keeps the ball on the side it arrived from (e.g. a wall-pass layoff does not push the ball through him to be goal-side). Requires the ball's incoming travel vector and updates on direction change.
- **No through-marker crossing:** when an owned ball's side changes, it must ride the **perimeter arc** around the marker (shortest arc at tangent radius), never cross through the player's center. Currently a side-change can visually cross the marker.

These are visual-correctness polish on top of working possession logic. Deferred deliberately to be informed by how dribbling/receiving actually get authored, rather than bolted onto the proof.

### 2.5 Timeline (tracks, not slides)

Actions are **clips on a shared clock** — each has a `start` and `duration`, and clips **overlap**. The board is computed by sweeping a playhead across all clips. This is what makes a switch-of-play feel continuous (ball in flight while the far block shifts and an annotation appears/clears during the flight).

### 2.6 Beat (the authoring handle)

The **beat** is how the coach thinks and how edits are expressed: "set up → now this happens → now this." Underneath, a beat is a cluster of actions sharing roughly the same start, plus an optional annotation and a pacing duration. Editing a beat leaves downstream beats intact because entities persist.

> **Open refinement (build):** exact mapping between beats (authoring) and absolute clip times (engine). Working model: actions carry absolute `start`+`duration` and a `beatId`; beats are ordered and carry annotation + hold; dragging a beat longer shifts subsequent clips.

### 2.7 Annotations and labels (system-positioned, not free text)

- **Label** — short, entity-anchored, rides with the marker, canvas space, auto-sized/uniform ("6", "GK", "zonal").
- **Annotation** — explanatory ("forces the ball wide"). Lives in a **system-positioned display layer** (currently rendered as a fixed band, not free canvas space). Timeline-bound. The coach writes the words; never places or sizes the box. Final rendering form is a later skin decision.

---

## 3. The timing model (three owners)

| Concern | Owner | Covers |
|---|---|---|
| **Choreography** | System (never the coach) | Run path smoothing, follow-pass spacing so no one looks like dribbling, within-clip motion feel, easing. If the coach ever hand-tunes this, we've failed. |
| **Relational timing** | System proposes, coach overrides | Whether one clip fires *with* / *before* / *after* another. The give-and-go toggle, generalized. |
| **Pacing** | Coach | Clip duration and Holds — how long a moment lasts, where the story breathes. |

---

## 4. Tool taxonomy

One body of soccer knowledge — the **directory** — serves three consumers: *recognition* (smart direct manipulation), *generation* (narration compiles into it), and a small set of *buttons* (express lanes).

**The button filter:** a concept earns a button only if invoking it collapses **multiple coordinated operations whose relationship the system resolves** into fewer inputs than the manual version — **and** removes timing/spacing the coach would otherwise hand-tune. One drag = no button.

**Four tool species:**
- **Mechanical** (no soccer meaning, build all): align, distribute-evenly, multi-select-drag, duplicate, group, mirror-across-axis, snap-to-shape.
- **Setup inference** (safe, accept-first): formation presets **with auto-mirrored opponent**, cone-cluster→shape, "N of color → offer N mirrored opposite," stage presets.
- **Expanders** (one-shot, generate primitives, higher bar): **give-and-go**.
- **Constraints** (persistent, set once, govern every beat, usually worth it): **man-mark/zonal tag**, **intent-arrow + auto-hold** (the baked-in ritual: draw forbidden-lane/force arrow → ghost path → show annotation → hold beat → movement plays).

**Typed arrows** (most of the tactic-creation intelligence): pass path (from ball → ball movement), run path (from player → player movement), carry path (dribble), intent arrow (crossed-out/force → annotation, never animates). Type is usually inferable from context.

**Directory-only knowledge** (no buttons; grows freely — it's data, not UI): overlap, underlap, third-man run, near/far-post run, double-movement, check-to-feet, blind-side run, drop/support, rotation, press-trigger, cover-shadow, recovery run, …

**Numbered-sequence pass builder** (the sleeper — near-term, not far-future): entities placed and named (`drillLabel`); coach types "1 to 2, 2 to 3, 3 plays 4" and the canvas assembles passes. No soccer-relative reasoning — parses entity→entity against a closed list. The first narration, buildable before full NLP, proves the second-input-head architecture.

---

## 5. Intelligence posture

**Safe inference only for v1**, always **accept-first** (a suggestion the coach confirms), never automatic. Safe inference *cleans what the coach did* (rough drag → clean pass; four cones → diamond; five yellows → offer five mirrored reds). **Risky inference** (generating what the coach did not do, e.g. auto-shifting a block on a switch) is **out** until the model is proven, and even then only as an acceptable suggestion.

**Default-inference rules** (what keeps the timeline closed 90% of the time): fixed sensible default durations by action type (system owns this — proven); default relational timing by pairing (pass+receiving-run overlap so ball arrives as runner arrives; follow-run starts just after its pass so it never reads as dribbling); default beat spacing (back-to-back with a small breath); **annotation auto-hold** (a beat with an annotation gets dwell scaled to text, movement waits behind it — the presence of text drives pacing).

**Surfaceable timeline:** under the hood by default, surfaceable on demand. Simple diagrams never open it; intricate work opens it for precise clip tuning. This is *not* the old capture-engineering — there manual capture was the only unit, so the default *was* the engineering; here the default is genuinely good and the timeline is a precision instrument for the exception.

---

## 6. Stage presets

Drills, tactics, scouting are **one engine**; set pieces are the same engine with a different stage. A stage preset configures `fieldExtent` (full/half/blank), `direction`, `teams` (count + colors), `markingLogic` (on/off), and density expectation (movement-heavy vs annotation-heavy). Set pieces deliberately resist narration — curve/zigzag/exact run shape are the *content* and are best authored by direct manipulation + the man-mark constraint.

---

## 7. Reference storage schema

*Reference — refine in build. This replaces the old `Snap` + `animation_steps` JSONB. It is a direct serialization of §2, validated by the Day-1 round-trip (serialize → deserialize → re-serialize byte-identical).*

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
      "destination": { "x": 0, "y": 0 },       // or { "landmark": "near_post", "side": "ball_side" } — NOT yet resolved
      "relTiming": { "ref": "actionId", "mode": "with|after|before", "gap": 0.2 },

      // carry
      // path only

      // mark (persistent constraint)
      "assignedTo": "uuid", "offset": "goal-side-tight" }  // or { "dx","dy" } or "zonal"
  ],

  "beats": [
    { "id": "uuid", "order": 0, "annotationIds": ["uuid"], "hold": 0.0 }
  ],

  "annotations": [
    { "id": "uuid", "text": "forces the ball wide",
      "kind": "caption|intent", "beatId": "uuid",
      "anchorEntityId": null, "holdAuto": true }
  ],

  "markup": [
    { "id": "uuid", "shapeType": "ellipse|rect|line", "x": 0, "y": 0,
      "width": 0, "height": 0, "color": "", "opacity": 0.3 }
  ]
}
```

---

## 8. Reuse / Rework / New inventory

### Reuse (visual/approach reference only — built fresh in the new repo)
Konva as renderer; marker/ball/cone/mini-goal shapes; field-view geometry (full/half/blank); formation presets; the easing curve approach. The Saideira files `DrillPlayer.tsx`, `TacticalWhiteboard.tsx`, `CanvasPreview.tsx` are parked in `_reference/` (build-excluded) for visual reference — never imported.

### Rework (done in the proof, or pending)
- **Data model** — `Snap` (8 flat parallel arrays) → entities + actions + timeline + beats + annotations. *(Done.)*
- **Playback** — lerp-between-snapshots → compute board at time T from actions, with bezier + easing. *(Done.)*
- **Unified renderer** — old code duplicated render between editor and player; new `BoardRenderer` is the single renderer for static + playback. *(Done — keep it single; do not split for the editor.)*
- **Pitch lines** — rough vector over green gradient + stripe → crisp vector on solid dark-green, no stripe. *(Done.)*
- **State management** — local refs (Saideira had no store) → **Zustand** for engine/editor state. *(Pending — introduced in the authoring tool build. zustand is installed.)*
- **Arrows** — generic → typed (pass/run/carry/intent). *(Pending in editor.)*
- **Annotations** — free text boxes → system-positioned display layer. *(Basic band done.)*

### Build new (done in proof / pending)
Done: entity identity model; five action types with duration + bezier paths; timeline with overlap; possession binding; compute layer (`resolvePosition`, `resolveBallPosition`, `resolveBoardState`); RAF playback. Pending: beat authoring UI; give-and-go; man-mark/zonal; intent-arrow + auto-hold; numbered-sequence builder; opponent auto-mirror; stage presets; surfaceable timeline editor; landmark resolution.

---

## 9. Current file inventory (gaffer repo)

```
lib/engine/types.ts        # discriminated-union types matching §7
lib/engine/factory.ts      # makeId, createEmptyDocument, makePlayer/Ball/Cone/Pass/Run/Carry/Beat/Annotation
lib/engine/serialize.ts    # serializeDocument / deserializeDocument (+ runtime validation)
lib/engine/resolve.ts      # resolvePosition, resolveBallPosition (possession binding + perimeter offset), resolveBoardState, bezier + easing
lib/engine/demo.ts         # Day-1 round-trip check (npm run engine:demo)
lib/engine/store.ts        # Zustand store — PENDING (authoring tool build)
components/engine/BoardRenderer.tsx  # the single unified Konva renderer
app/lab/engine/page.tsx    # Day-3 playback proof (Play/Pause/Restart)
app/lab/editor/page.tsx    # first authoring surface — PENDING (next build)
docs/GAFFER_ENGINE_SPEC.md # this document
_reference/                # Saideira files, build-excluded, reference only
```

---

## 10. Environment / build facts (do not re-derive)

- **Repo:** new `gaffer` repo (github.com/ryanrkrueger7/gaffer). Saideira preserved at tag `saideira-v1`, not migrated.
- **Stack:** Next.js 14 (App Router, no src dir, `@/*` alias), TypeScript, Tailwind, Konva + react-konva, Zustand, Lucide. Supabase installed but **unused** (no tables yet; RLS off — turn on with the schema at the persistence phase).
- **Pinned versions (React 18 compatibility):** `react-konva@18.2.10`, `konva@9.3.6`. react-konva 19 requires React 19 — do not let it upgrade.
- **`next.config.mjs`** marks `canvas` as a webpack external (Konva pulls an optional Node `canvas` dep that breaks the Next build otherwise).
- **npm:** use `--legacy-peer-deps` for installs (react-konva peer constraints).
- **Dev rules (carried from Saideira):** Claude Code **never** runs `npm run dev` (Ryan runs it manually on :3000). Claude Code uses `npm run build` to verify and `npm run engine:demo` for the round-trip check. No emojis anywhere — Lucide icons only.
- **Workflow:** two-agent — this strategy chat authors decisions + Claude Code prompts; Claude Code (terminal) implements. Commit working state immediately (Days 1–3 were nearly lost as uncommitted work during a stash).
- **Claude Code tends to over-architect** — prompts must be surgical and scoped. A single over-broad prompt (directional offset + perimeter-arc geometry) ran 30+ min and was discarded; split fiddly geometry into its own small prompts.

---

## 11. Open + deferred items

**Open (settle before the relevant build):**
- Beat ↔ absolute-time mapping (§2.6) — confirm when building the beat authoring UI.
- Landmark representation — three kinds defined conceptually (fixed pitch geometry; relative-to-entity; tactical-space). **Decision made:** tactical-space references resolve to a coordinate **at authoring time** and store the label for later, never live-recompute in v1 (that's risky inference). **Not yet implemented** — engine uses explicit coordinates only. Build the resolution layer after the authoring tool basics; it sits cleanly on top since `destination`/`target` already allow a landmark variant.

**Deferred (logged, not lost):**
- Directional possession offset (§2.4) — ball trails travel direction; back-to-goal receiver keeps ball on arrival side.
- No through-marker crossing (§2.4) — owned-ball side changes ride the perimeter arc.
- Cross/shot promotion to first-class actions — only if a concrete case needs distinct behavior.
- Terminology directory — living companion doc, built in parallel by scrubbing public soccer-terminology resources (Marco explicitly not involved). Not a build blocker; entry structure defined (term / aliases / plain def / decomposes-to / status / relational timing / recognition signature).

---

*End of specification v1. The engine proof is complete. The next phase is the authoring tool. Downstream specs (player-facing projection, comms/org layer, persistence + RLS, narration) inherit from this document.*
