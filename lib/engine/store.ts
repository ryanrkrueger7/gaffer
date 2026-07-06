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

export type Tool = 'select' | 'player' | 'ball' | 'author';

const DEFAULT_ENTITY_RADIUS = 22;
const UNDO_LIMIT = 30;

// Single shared beat — every editor-created action references this beat id.
const _defaultBeat = makeBeat({ order: 0 });
export const DEFAULT_BEAT_ID = _defaultBeat.id;

function makeInitialDoc(): GafferDocument {
  const doc = createEmptyDocument({ name: 'Untitled Drill', type: 'drill' });
  doc.beats.push(_defaultBeat);
  return doc;
}

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
        if ('entityId' in action.target) {
          owner = action.target.entityId;
        } else {
          owner = null;
        }
      }
    }
    return owner;
  }

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

/** Push doc onto history, capped at UNDO_LIMIT entries. */
function pushHistory(history: GafferDocument[], doc: GafferDocument): GafferDocument[] {
  const next = [...history, doc];
  return next.length > UNDO_LIMIT ? next.slice(next.length - UNDO_LIMIT) : next;
}

export interface EditorStore {
  document: GafferDocument;
  tool: Tool;
  selectedEntityId: string | null;
  pendingSourceId: string | null;
  undoHistory: GafferDocument[];
  canUndo: boolean;

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
  /** Remove entity + any actions that reference it. Deleting the ball also removes all carry/pass actions. */
  deleteEntity: (id: string) => void;
  undo: () => void;
}

export const useEditorStore = create<EditorStore>((set) => ({
  document: makeInitialDoc(),
  tool: 'select',
  selectedEntityId: null,
  pendingSourceId: null,
  undoHistory: [],
  canUndo: false,

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
        undoHistory: pushHistory(state.undoHistory, state.document),
        canUndo: true,
      };
    }),

  addBall: (x, y) =>
    set((state) => {
      if (state.document.entities.some((e) => e.kind === 'ball')) return state;
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
        undoHistory: pushHistory(state.undoHistory, state.document),
        canUndo: true,
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
      undoHistory: pushHistory(state.undoHistory, state.document),
      canUndo: true,
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
      if (!ownerId) return state;
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
        undoHistory: pushHistory(state.undoHistory, state.document),
        canUndo: true,
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
        undoHistory: pushHistory(state.undoHistory, state.document),
        canUndo: true,
        pendingSourceId: null,
      };
    }),

  addCarry: (x, y) =>
    set((state) => {
      const startT = maxActionEnd(state.document);
      const ownerId = resolveOwnerAtT(state.document, startT);
      if (!ownerId) return state;
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
        undoHistory: pushHistory(state.undoHistory, state.document),
        canUndo: true,
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
      undoHistory: pushHistory(state.undoHistory, state.document),
      canUndo: true,
    })),

  deleteAction: (id) =>
    set((state) => ({
      document: {
        ...state.document,
        actions: state.document.actions.filter((a) => a.id !== id),
      },
      undoHistory: pushHistory(state.undoHistory, state.document),
      canUndo: true,
    })),

  deleteEntity: (id) =>
    set((state) => {
      const isBall = state.document.entities.find((e) => e.id === id)?.kind === 'ball';
      return {
        document: {
          ...state.document,
          entities: state.document.entities.filter((e) => e.id !== id),
          actions: state.document.actions.filter((a) => {
            if (isBall) {
              // Ball deleted — remove all possession-dependent actions
              return a.kind !== 'pass' && a.kind !== 'carry';
            }
            if (a.entityId === id) return false;
            if (a.kind === 'pass' && 'entityId' in a.target && a.target.entityId === id) return false;
            return true;
          }),
        },
        selectedEntityId: state.selectedEntityId === id ? null : state.selectedEntityId,
        undoHistory: pushHistory(state.undoHistory, state.document),
        canUndo: true,
      };
    }),

  undo: () =>
    set((state) => {
      if (state.undoHistory.length === 0) return {};
      const history = [...state.undoHistory];
      const prev = history.pop()!;
      return {
        document: prev,
        undoHistory: history,
        canUndo: history.length > 0,
        selectedEntityId: null,
        pendingSourceId: null,
      };
    }),
}));
