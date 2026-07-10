// Editor state — Zustand store for the authoring surface.
// All document mutations go through factory helpers; never hand-builds objects.

import { create } from 'zustand';
import {
  createEmptyDocument,
  makePlayer,
  makeBall,
  makeCone,
  makeMinigoal,
  makeMannequin,
  makeGoal,
  makePass,
  makeRun,
  makeCarry,
  makeBeat,
} from './factory';
import { resolveOwnerAtT, resolvePosition } from './resolve';
import type { GafferDocument, PlayerEntity } from './types';

export type Tool = 'select' | 'player' | 'ball' | 'cone' | 'minigoal' | 'goal' | 'mannequin' | 'author';

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

/** Returns the perpendicular distance from point (px,py) to segment (ax,ay)→(bx,by). */
function distanceToSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Returns the chord start/end points for an action, used to compute bezier control points.
 * Run/Carry: entity position at action.start → destination.
 * Pass: passer center at action.start → receiver center at action.start + action.duration.
 */
export function getActionChordEndpoints(
  doc: GafferDocument,
  actionId: string,
): { start: { x: number; y: number }; end: { x: number; y: number } } | null {
  const action = doc.actions.find((a) => a.id === actionId);
  if (!action) return null;
  if (action.kind === 'run') {
    if (!('x' in action.destination)) return null;
    return {
      start: resolvePosition(doc, action.entityId, action.start),
      end: action.destination as { x: number; y: number },
    };
  }
  if (action.kind === 'carry') {
    if (!action.destination) return null;
    return {
      start: resolvePosition(doc, action.entityId, action.start),
      end: action.destination,
    };
  }
  if (action.kind === 'pass') {
    const start = resolvePosition(doc, action.entityId, action.start);
    const end = 'entityId' in action.target
      ? resolvePosition(doc, action.target.entityId, action.start + action.duration)
      : { x: action.target.x, y: action.target.y };
    return { start, end };
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
  selectedActionId: string | null;
  lastCreatedActionId: string | null;
  /** History depth at the point the last action was created — used to detect intervening mutations. */
  lastCreatedUndoDepth: number;
  /** Id of the entity most recently placed via addPlayer — cleared by undo / loadDocument. */
  lastCreatedEntityId: string | null;
  /** Team colour applied to the next placed player. */
  placementTeam: 'A' | 'B' | 'neutral';
  /** When true, next placed player gets roleName = 'GK' and this resets to false. */
  placementIsGk: boolean;
  /** Radius class for the next placed player. */
  placementSize: 'small' | 'medium' | 'large';

  setTool: (tool: Tool) => void;
  setSelected: (id: string | null) => void;
  setPendingSource: (id: string | null) => void;
  addPlayer: (x: number, y: number) => void;
  /**
   * Place the ball. If (x,y) is within a player's radius, snaps ball.initial
   * to that player's center so resolveBallPosition can detect implicit ownership.
   */
  addBall: (x: number, y: number) => void;
  addCone: (x: number, y: number) => void;
  addMinigoal: (x: number, y: number) => void;
  addMannequin: (x: number, y: number) => void;
  addGoal: (x: number, y: number) => void;
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
  selectAction: (id: string | null) => void;
  /** Set the bezier curve for an action by specifying an apex point (or null to straighten). */
  setActionCurve: (actionId: string, apexX: number | null, apexY: number | null) => void;
  setPlacementTeam: (team: 'A' | 'B' | 'neutral') => void;
  setPlacementIsGk: (v: boolean) => void;
  setPlacementSize: (size: 'small' | 'medium' | 'large') => void;
  /** Update display fields on a player entity. Does not push to undo history. */
  updatePlayerDisplay: (id: string, patch: Partial<NonNullable<PlayerEntity['display']>>) => void;
  /** Update doc.meta.name on the live document (mirror of a DB rename). */
  renameDocument: (name: string) => void;
  /** Replace the current document entirely (e.g. loading from persistence). Resets all transient state. */
  loadDocument: (doc: GafferDocument) => void;
}

export const useEditorStore = create<EditorStore>((set) => ({
  document: makeInitialDoc(),
  tool: 'select',
  selectedEntityId: null,
  pendingSourceId: null,
  undoHistory: [],
  canUndo: false,
  selectedActionId: null,
  lastCreatedActionId: null,
  lastCreatedUndoDepth: 0,
  lastCreatedEntityId: null,
  placementTeam: 'A',
  placementIsGk: false,
  placementSize: 'medium',

  setTool: (tool) => set({ tool, pendingSourceId: null }),
  setSelected: (id) => set({ selectedEntityId: id }),
  setPendingSource: (id) => set({ pendingSourceId: id }),
  setPlacementTeam: (team) => set({ placementTeam: team }),
  setPlacementIsGk: (v) => set({ placementIsGk: v }),
  setPlacementSize: (size) => set({ placementSize: size }),

  updatePlayerDisplay: (id, patch) =>
    set((state) => ({
      document: {
        ...state.document,
        entities: state.document.entities.map((e) =>
          e.id === id && e.kind === 'player'
            ? { ...e, display: { ...e.display, ...patch } }
            : e,
        ),
      },
    })),

  addPlayer: (x, y) =>
    set((state) => {
      const count = state.document.entities.filter((e) => e.kind === 'player').length;
      const radiusMap = { small: 16, medium: 22, large: 28 } as const;
      // EntityBase uses `team` (not `teamId`) for logical team membership.
      // `color` is an explicit display hint derived from `team`; BoardRenderer also
      // derives color from `team` alone when `color` is absent, so storing it here
      // just makes the document self-contained and survives theme changes.
      const colorMap = { A: '#FFD700', B: '#3B82F6', neutral: '#9CA3AF' } as const;
      const player = makePlayer({
        team: state.placementTeam,
        radius: radiusMap[state.placementSize],
        color: colorMap[state.placementTeam],
        initial: { x, y },
        display: {
          drillLabel: String(count + 1),
          // GK toggle sets isGoalkeeper only — a pure render flag entirely disjoint
          // from the identity fields (jerseyNumber, roleName, positionId) and from
          // inferredPositionId (system-only). A "#1" typed via the identity input
          // afterwards writes only to jerseyNumber and has zero interaction with this flag.
          ...(state.placementIsGk ? { isGoalkeeper: true } : {}),
        },
      });
      return {
        document: {
          ...state.document,
          entities: [...state.document.entities, player],
        },
        undoHistory: pushHistory(state.undoHistory, state.document),
        canUndo: true,
        lastCreatedEntityId: player.id,
        placementIsGk: false,
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

  addCone: (x, y) =>
    set((state) => {
      const cone = makeCone({ initial: { x, y } });
      return {
        document: { ...state.document, entities: [...state.document.entities, cone] },
        undoHistory: pushHistory(state.undoHistory, state.document),
        canUndo: true,
      };
    }),

  addMinigoal: (x, y) =>
    set((state) => {
      const minigoal = makeMinigoal({ initial: { x, y } });
      return {
        document: { ...state.document, entities: [...state.document.entities, minigoal] },
        undoHistory: pushHistory(state.undoHistory, state.document),
        canUndo: true,
      };
    }),

  addMannequin: (x, y) =>
    set((state) => {
      const mannequin = makeMannequin({ initial: { x, y } });
      return {
        document: { ...state.document, entities: [...state.document.entities, mannequin] },
        undoHistory: pushHistory(state.undoHistory, state.document),
        canUndo: true,
      };
    }),

  addGoal: (x, y) =>
    set((state) => {
      const goal = makeGoal({ initial: { x, y } });
      return {
        document: { ...state.document, entities: [...state.document.entities, goal] },
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
      const newHistory = pushHistory(state.undoHistory, state.document);
      return {
        document: {
          ...state.document,
          actions: [...state.document.actions, pass],
        },
        undoHistory: newHistory,
        canUndo: true,
        pendingSourceId: null,
        lastCreatedActionId: pass.id,
        lastCreatedUndoDepth: newHistory.length,
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
      const newHistory = pushHistory(state.undoHistory, state.document);
      return {
        document: {
          ...state.document,
          actions: [...state.document.actions, run],
        },
        undoHistory: newHistory,
        canUndo: true,
        pendingSourceId: null,
        lastCreatedActionId: run.id,
        lastCreatedUndoDepth: newHistory.length,
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
      const newHistory = pushHistory(state.undoHistory, state.document);
      return {
        document: {
          ...state.document,
          actions: [...state.document.actions, carry],
        },
        undoHistory: newHistory,
        canUndo: true,
        pendingSourceId: null,
        lastCreatedActionId: carry.id,
        lastCreatedUndoDepth: newHistory.length,
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
        selectedActionId: null,
        lastCreatedActionId: null,
        lastCreatedUndoDepth: 0,
        lastCreatedEntityId: null,
      };
    }),

  selectAction: (id) => set({ selectedActionId: id }),

  renameDocument: (name) =>
    set((state) => ({
      document: {
        ...state.document,
        meta: { ...state.document.meta, name },
      },
    })),

  loadDocument: (doc) =>
    set({
      document: doc,
      tool: 'select',
      selectedEntityId: null,
      pendingSourceId: null,
      undoHistory: [],
      canUndo: false,
      selectedActionId: null,
      lastCreatedActionId: null,
      lastCreatedUndoDepth: 0,
      lastCreatedEntityId: null,
    }),

  setActionCurve: (actionId, apexX, apexY) =>
    set((state) => {
      const action = state.document.actions.find((a) => a.id === actionId);
      if (!action) return state;
      if (action.kind !== 'run' && action.kind !== 'carry' && action.kind !== 'pass') return state;
      const endpoints = getActionChordEndpoints(state.document, actionId);
      if (!endpoints) return state;
      const { start: startPt, end: endPt } = endpoints;
      const mx = (startPt.x + endPt.x) / 2;
      const my = (startPt.y + endPt.y) / 2;
      let newPath: { type: 'straight' } | { type: 'bezier'; cx: number; cy: number };
      if (apexX == null || apexY == null) {
        newPath = { type: 'straight' };
      } else {
        const dist = distanceToSegment(apexX, apexY, startPt.x, startPt.y, endPt.x, endPt.y);
        if (dist <= 8) {
          newPath = { type: 'straight' };
        } else {
          newPath = { type: 'bezier', cx: 2 * apexX - mx, cy: 2 * apexY - my };
        }
      }
      // Fold into the creation snapshot when no other mutation has intervened since
      // the action was created — so one undo removes the drawn+curved action entirely.
      const isJustCreated =
        actionId === state.lastCreatedActionId &&
        state.undoHistory.length === state.lastCreatedUndoDepth;
      const newUndoHistory = isJustCreated
        ? state.undoHistory
        : pushHistory(state.undoHistory, state.document);
      return {
        document: {
          ...state.document,
          actions: state.document.actions.map((a) =>
            a.id === actionId ? { ...a, path: newPath } : a,
          ),
        },
        undoHistory: newUndoHistory,
        canUndo: newUndoHistory.length > 0,
        // After folding, clear the "just created" marker so a second curve on the
        // same action pushes a normal undo entry.
        ...(isJustCreated ? { lastCreatedActionId: null, lastCreatedUndoDepth: 0 } : {}),
      };
    }),
}));
