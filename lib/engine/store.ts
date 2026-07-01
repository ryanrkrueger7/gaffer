// Editor state — Zustand store for the authoring surface.
// All document mutations go through factory helpers; never hand-builds objects.

import { create } from 'zustand';
import {
  createEmptyDocument,
  makePlayer,
  makeBall,
  makePass,
  makeRun,
  makeCarry,
  makeBeat,
} from './factory';
import { resolveOwnerAtT } from './resolve';
import type { GafferDocument } from './types';

export type Tool = 'select' | 'player' | 'ball' | 'pass' | 'run' | 'carry';

const DEFAULT_ENTITY_RADIUS = 22;

// Single shared beat — every editor-created action references this beat id.
const _defaultBeat = makeBeat({ order: 0 });
export const DEFAULT_BEAT_ID = _defaultBeat.id;

function makeInitialDoc(): GafferDocument {
  const doc = createEmptyDocument({ name: 'Untitled Drill', type: 'drill' });
  doc.beats.push(_defaultBeat);
  return doc;
}

/**
 * Returns the entity id of whoever currently holds the ball at the END of the
 * authored sequence — i.e., "who has the ball next?". This drives pass/carry
 * authoring: the passer/carrier is always the current owner, never chosen manually.
 *
 * Derivation order:
 *  1. Walk all carry/pass actions in start order; last one wins.
 *  2. If no ball actions exist, fall back to whichever player's initial position
 *     coincides with ball.initial (the snap-to-player placement rule).
 */
/** Returns the time at which the last authored action ends, or 0 if none. */
export function maxActionEnd(doc: GafferDocument): number {
  if (doc.actions.length === 0) return 0;
  return Math.max(...doc.actions.map((a) => a.start + a.duration));
}

export function computeCurrentOwner(doc: GafferDocument): string | null {
  const ballActions = doc.actions
    .filter((a) => a.kind === 'carry' || a.kind === 'pass')
    .sort((a, b) => a.start - b.start);

  if (ballActions.length > 0) {
    let owner: string | null = ballActions[0].entityId;
    for (const action of ballActions) {
      if (action.kind === 'carry') {
        owner = action.entityId;
      } else {
        // pass
        if ('entityId' in action.target) {
          owner = action.target.entityId;
        } else {
          owner = null; // location pass → loose
        }
      }
    }
    return owner;
  }

  // No ball actions: detect initial owner by ball placement proximity.
  const ball = doc.entities.find((e) => e.kind === 'ball');
  if (!ball || !('initial' in ball)) return null;
  const bx = (ball as { initial: { x: number; y: number } }).initial.x;
  const by = (ball as { initial: { x: number; y: number } }).initial.y;

  for (const e of doc.entities) {
    if (e.kind !== 'player') continue;
    const r = e.radius ?? DEFAULT_ENTITY_RADIUS;
    const dx = e.initial.x - bx;
    const dy = e.initial.y - by;
    if (dx * dx + dy * dy <= r * r) return e.id;
  }
  return null;
}

export interface EditorStore {
  document: GafferDocument;
  tool: Tool;
  selectedEntityId: string | null;
  /** Used only by the Run tool (two-click fallback: first click = source player). */
  pendingSourceId: string | null;

  setTool: (tool: Tool) => void;
  setSelected: (id: string | null) => void;
  setPendingSource: (id: string | null) => void;
  addPlayer: (x: number, y: number) => void;
  /**
   * Place the ball. If (x,y) is within a player's radius, snaps ball.initial
   * to that player's center so resolveBallPosition can detect implicit ownership.
   */
  addBall: (x: number, y: number) => void;
  moveEntity: (id: string, x: number, y: number) => void;
  /** Passer = end-of-sequence owner. Relational timing: if target has a Run, aligns pass timing to it. No-op if no end-of-sequence owner. */
  addPass: (targetId: string) => void;
  /** Run added starting at startT. */
  addRun: (playerId: string, x: number, y: number, startT: number) => void;
  /** Carrier = end-of-sequence owner; appends to sequence. No-op if no end-of-sequence owner. */
  addCarry: (x: number, y: number) => void;
  updateAction: (id: string, patch: { start?: number; duration?: number }) => void;
  deleteAction: (id: string) => void;
  /** Remove entity + any actions that reference it (as actor or pass target). */
  deleteEntity: (id: string) => void;
}

export const useEditorStore = create<EditorStore>((set) => ({
  document: makeInitialDoc(),
  tool: 'select',
  selectedEntityId: null,
  pendingSourceId: null,

  setTool: (tool) => set({ tool, pendingSourceId: null }),
  setSelected: (id) => set({ selectedEntityId: id }),
  setPendingSource: (id) => set({ pendingSourceId: id }),

  addPlayer: (x, y) =>
    set((state) => {
      const count = state.document.entities.filter((e) => e.kind === 'player').length;
      const player = makePlayer({
        team: 'A',
        initial: { x, y },
        display: { drillLabel: String(count + 1) },
      });
      return {
        document: {
          ...state.document,
          entities: [...state.document.entities, player],
        },
      };
    }),

  addBall: (x, y) =>
    set((state) => {
      if (state.document.entities.some((e) => e.kind === 'ball')) return state;
      // Snap ball.initial onto the nearest player within radius so the engine
      // can detect implicit ownership at t=0 via position coincidence.
      let snapX = x;
      let snapY = y;
      for (const e of state.document.entities) {
        if (e.kind !== 'player') continue;
        const r = e.radius ?? DEFAULT_ENTITY_RADIUS;
        const dx = e.initial.x - x;
        const dy = e.initial.y - y;
        if (dx * dx + dy * dy <= r * r) {
          snapX = e.initial.x;
          snapY = e.initial.y;
          break;
        }
      }
      const ball = makeBall({ initial: { x: snapX, y: snapY } });
      return {
        document: {
          ...state.document,
          entities: [...state.document.entities, ball],
        },
      };
    }),

  moveEntity: (id, x, y) =>
    set((state) => ({
      document: {
        ...state.document,
        entities: state.document.entities.map((e) =>
          e.id === id && 'initial' in e ? { ...e, initial: { x, y } } : e,
        ),
      },
    })),

  addPass: (targetId) =>
    set((state) => {
      // Relational timing rule: if the target has an existing Run, align pass to it
      // so the ball arrives exactly when the runner reaches their destination.
      const targetRun = state.document.actions.find(
        (a) => a.kind === 'run' && a.entityId === targetId,
      );
      const startT = targetRun ? targetRun.start : maxActionEnd(state.document);
      const duration = targetRun ? targetRun.duration : 0.8;

      const ownerId = resolveOwnerAtT(state.document, startT);
      if (!ownerId) return state; // no ball owner at sequence end — no-op
      const pass = makePass({
        entityId: ownerId,
        beatId: DEFAULT_BEAT_ID,
        target: { entityId: targetId },
        start: startT,
        duration,
      });
      return {
        document: {
          ...state.document,
          actions: [...state.document.actions, pass],
        },
        pendingSourceId: null,
      };
    }),

  addRun: (playerId, x, y, startT) =>
    set((state) => {
      const run = makeRun({
        entityId: playerId,
        beatId: DEFAULT_BEAT_ID,
        destination: { x, y },
        start: startT,
        duration: 1.5,
      });
      return {
        document: {
          ...state.document,
          actions: [...state.document.actions, run],
        },
        pendingSourceId: null,
      };
    }),

  addCarry: (x, y) =>
    set((state) => {
      const startT = maxActionEnd(state.document);
      const ownerId = resolveOwnerAtT(state.document, startT);
      if (!ownerId) return state; // no ball owner at sequence end — no-op
      const carry = makeCarry({
        entityId: ownerId,
        beatId: DEFAULT_BEAT_ID,
        destination: { x, y },
        start: startT,
        duration: 1.0,
      });
      return {
        document: {
          ...state.document,
          actions: [...state.document.actions, carry],
        },
        pendingSourceId: null,
      };
    }),

  updateAction: (id, patch) =>
    set((state) => ({
      document: {
        ...state.document,
        actions: state.document.actions.map((a) =>
          a.id === id ? { ...a, ...patch } : a,
        ),
      },
    })),

  deleteAction: (id) =>
    set((state) => ({
      document: {
        ...state.document,
        actions: state.document.actions.filter((a) => a.id !== id),
      },
    })),

  deleteEntity: (id) =>
    set((state) => ({
      document: {
        ...state.document,
        entities: state.document.entities.filter((e) => e.id !== id),
        actions: state.document.actions.filter((a) => {
          if (a.entityId === id) return false;
          if (a.kind === 'pass' && 'entityId' in a.target && a.target.entityId === id) return false;
          return true;
        }),
      },
      selectedEntityId: state.selectedEntityId === id ? null : state.selectedEntityId,
    })),
}));
