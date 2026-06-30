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
import type { GafferDocument } from './types';

export type Tool = 'select' | 'player' | 'ball' | 'pass' | 'run' | 'carry';

// Single shared beat — every editor-created action references this beat id.
const _defaultBeat = makeBeat({ order: 0 });
export const DEFAULT_BEAT_ID = _defaultBeat.id;

function makeInitialDoc(): GafferDocument {
  const doc = createEmptyDocument({ name: 'Untitled Drill', type: 'drill' });
  doc.beats.push(_defaultBeat);
  return doc;
}

function maxActionEnd(doc: GafferDocument): number {
  return doc.actions.reduce((m, a) => Math.max(m, a.start + a.duration), 0);
}

export interface EditorStore {
  document: GafferDocument;
  tool: Tool;
  selectedEntityId: string | null;
  pendingSourceId: string | null;

  setTool: (tool: Tool) => void;
  setSelected: (id: string | null) => void;
  setPendingSource: (id: string | null) => void;
  addPlayer: (x: number, y: number) => void;
  addBall: (x: number, y: number) => void;
  moveEntity: (id: string, x: number, y: number) => void;
  // Phase 2 — two-click action tools
  addPass: (sourceId: string, targetId: string) => void;
  addRun: (playerId: string, x: number, y: number) => void;
  addCarry: (playerId: string, x: number, y: number) => void;
  updateAction: (id: string, patch: { start?: number; duration?: number }) => void;
  deleteAction: (id: string) => void;
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
      const ball = makeBall({ initial: { x, y } });
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

  addPass: (sourceId, targetId) =>
    set((state) => {
      const start = maxActionEnd(state.document);
      const pass = makePass({
        entityId: sourceId,
        beatId: DEFAULT_BEAT_ID,
        target: { entityId: targetId },
        start,
        duration: 0.8,
      });
      return {
        document: {
          ...state.document,
          actions: [...state.document.actions, pass],
        },
        pendingSourceId: null,
      };
    }),

  addRun: (playerId, x, y) =>
    set((state) => {
      const start = maxActionEnd(state.document);
      const run = makeRun({
        entityId: playerId,
        beatId: DEFAULT_BEAT_ID,
        destination: { x, y },
        start,
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

  addCarry: (playerId, x, y) =>
    set((state) => {
      const start = maxActionEnd(state.document);
      // Carry binds ball; a concurrent Run provides movement.
      const carry = makeCarry({
        entityId: playerId,
        beatId: DEFAULT_BEAT_ID,
        start,
        duration: 1.0,
      });
      const run = makeRun({
        entityId: playerId,
        beatId: DEFAULT_BEAT_ID,
        destination: { x, y },
        start,
        duration: 1.0,
      });
      return {
        document: {
          ...state.document,
          actions: [...state.document.actions, carry, run],
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
}));
