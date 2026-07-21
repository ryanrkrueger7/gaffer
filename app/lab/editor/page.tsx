'use client';

// Authoring surface — place entities, author actions by gesture, play through the engine.
// Author mode: drag ball/owner → infer pass or carry; drag player → run.

import dynamic from 'next/dynamic';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  MousePointer2,
  UserPlus,
  Circle,
  Hand,
  ArrowRight,
  Footprints,
  Move,
  Play,
  Pause,
  RotateCcw,
  Trash2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Undo2,
  Save,
  FolderOpen,
  Pencil,
  Cone,
  Frame,
  Goal as GoalIcon,
  PersonStanding,
  BoxSelect,
} from 'lucide-react';
import { useEditorStore, maxActionEnd, getActionChordEndpoints } from '@/lib/engine/store';
import BeatStrip from '@/components/engine/BeatStrip';
import type { Tool } from '@/lib/engine/store';
import { ROLE_ENTRIES, inferPosition, INFER_CONFIDENCE_THRESHOLD } from '@/lib/knowledge';
import { saveDoc, listDocs, fetchDoc, renameDoc, deleteDoc } from '@/app/actions/documents';
import type { DocSummary } from '@/app/actions/documents';
import { resolveBoardState, resolveOwnerAtT, resolvePosition, resolveTargetPoint } from '@/lib/engine/resolve';
import type { EntitySnapshot } from '@/lib/engine/resolve';
import type { GafferDocument, Action, PlayerEntity, ZoneEntity, FrameTeam, GoalEntity } from '@/lib/engine/types';
import type { BoardRendererProps, ActionOverlay } from '@/components/engine/BoardRenderer';
import { narrate } from '@/lib/intelligence';
import type { NarrationResult } from '@/lib/intelligence';

const BoardRenderer = dynamic<BoardRendererProps>(
  () => import('@/components/engine/BoardRenderer'),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          width: 800,
          height: 648,
          background: '#0d1a0f',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#4a7a4e',
          fontFamily: 'monospace',
          fontSize: 13,
        }}
      >
        Loading canvas...
      </div>
    ),
  },
);

// Known position IDs for identity parsing (e.g. "ST", "CAM").
const POSITION_ID_SET = new Set<string>(ROLE_ENTRIES.map((e) => e.positionId));

/** Constructs the scoringDirection Record expected by inferPosition() from frame.teams. */
function buildFrameScoringDirection(
  frameTeams: FrameTeam[],
): Record<string, 'up' | 'down' | 'left' | 'right'> {
  const result: Record<string, 'up' | 'down' | 'left' | 'right'> = {};
  for (const t of frameTeams) {
    if (t.attackingDirection != null) result[t.id] = t.attackingDirection;
  }
  // Neutral entities inherit the first team's direction, or 'up' as a safe fallback.
  const firstDir = frameTeams.find((t) => t.attackingDirection != null)?.attackingDirection ?? 'up';
  result['neutral'] = firstDir;
  return result;
}

const HIT_RADIUS = 22;
const DEFAULT_ENTITY_RADIUS = 22;
const BALL_RADIUS = 9;

/** Find entity id at (x,y) using resolved positions from boardState (players/cones/etc., not ball). */
function findEntityAtPoint(entities: EntitySnapshot[], x: number, y: number): string | null {
  for (const e of entities) {
    const r = e.radius ?? HIT_RADIUS;
    const dx = e.x - x;
    const dy = e.y - y;
    if (dx * dx + dy * dy <= r * r) return e.id;
  }
  return null;
}

// ── Authoring-only hit-test margins ───────────────────────────────────────────
// These enlarged regions apply ONLY when resolving a ball-origin drag target.
// They are NOT used for selection / delete / reposition click hit-testing.

// GoalMarker rendered bounds (BoardRenderer.tsx GoalMarker):
//   outer posts x ∈ [-28, 28], crossbar/post height y ∈ [-16, 16].
//   +20 px halo on every side → half-extents 48 × 36.
const GOAL_HIT_HALF_W = 48;
const GOAL_HIT_HALF_H = 36;

// MinigoalMarker rendered bounds (BoardRenderer.tsx MinigoalMarker):
//   outer posts x ∈ [-20, 20], y ∈ [-14, 14].
//   +20 px halo on every side → half-extents 40 × 34.
const MINIGOAL_HIT_HALF_W = 40;
const MINIGOAL_HIT_HALF_H = 34;

// Extra px beyond entity.radius for player targets during a ball-origin drag.
// Covers a drop landing ~15 px outside the edge of a medium (r=22) marker.
const NEAR_MISS_MARGIN = 15;

/**
 * Find a valid ball-action target at (x, y) for a ball-origin authoring drag.
 *
 * Goals and mini-goals use a rectangular hit region proportional to their visual
 * footprint plus a 20 px halo (see constants above). Players use their stored
 * radius plus NEAR_MISS_MARGIN. Cones, mannequins, and zones are never returned.
 *
 * Player wins over goal when both are in range — a pass to a player near the
 * goal mouth is more common than a shot intended at a player standing on the line.
 *
 * excludeId is the current ball owner; they are excluded so the owner cannot
 * be the pass target (self-pass is nonsense). Pass null when there is no owner.
 *
 * Does NOT affect selection, deletion, or repositioning hit-testing.
 */
function findBallDropTarget(
  entities: EntitySnapshot[],
  x: number,
  y: number,
  excludeId: string | null,
): string | null {
  // Pass 1 — players (priority: first matching player is returned immediately).
  for (const e of entities) {
    if (e.id === excludeId || e.kind !== 'player') continue;
    const r = (e.radius ?? HIT_RADIUS) + NEAR_MISS_MARGIN;
    const dx = e.x - x, dy = e.y - y;
    if (dx * dx + dy * dy <= r * r) return e.id;
  }
  // Pass 2 — goals and mini-goals (rectangular, proportional to visual footprint).
  for (const e of entities) {
    if (e.kind === 'goal' && Math.abs(e.x - x) <= GOAL_HIT_HALF_W && Math.abs(e.y - y) <= GOAL_HIT_HALF_H) return e.id;
    if (e.kind === 'minigoal' && Math.abs(e.x - x) <= MINIGOAL_HIT_HALF_W && Math.abs(e.y - y) <= MINIGOAL_HIT_HALF_H) return e.id;
  }
  return null;
}


function entityLabel(doc: GafferDocument, id: string): string {
  const e = doc.entities.find((e) => e.id === id);
  if (!e) return '?';
  if (e.kind === 'player') {
    // Priority: jersey# → roleName → positionId → inferredPositionId → drillLabel → slot.
    // positionId  = user-typed PositionId via identity input (distinct bucket from inferredPositionId).
    // inferredPositionId = system-only; written by inferPosition() in Part B.
    return (
      e.display?.jerseyNumber?.toString() ??
      e.display?.roleName ??
      e.display?.positionId ??
      e.display?.inferredPositionId ??
      e.display?.drillLabel ??
      e.display?.positionSlot?.toString() ??
      '?'
    );
  }
  return e.kind;
}

// ── Tool bar config ───────────────────────────────────────────────────────────

const TOOL_DEFS: { id: Tool; icon: React.ReactNode; title: string }[] = [
  { id: 'select', icon: <MousePointer2 size={16} />, title: 'Select / Move — drag to reposition; Del to delete' },
  { id: 'player', icon: <UserPlus size={16} />, title: 'Place Player — click empty pitch' },
  { id: 'ball', icon: <Circle size={16} />, title: 'Place Ball — click a player to give them possession' },
  { id: 'cone', icon: <Cone size={16} />, title: 'Place Cone' },
  { id: 'minigoal', icon: <Frame size={16} />, title: 'Place Mini-Goal' },
  { id: 'goal', icon: <GoalIcon size={16} />, title: 'Place Full-Size Goal' },
  { id: 'mannequin', icon: <PersonStanding size={16} />, title: 'Place Mannequin' },
  { id: 'zone', icon: <BoxSelect size={16} />, title: 'Draw Zone — click-drag to mark a region' },
  { id: 'author', icon: <Hand size={16} />, title: 'Author — drag ball/owner → pass or carry; drag other player → run' },
];

// ── Action list row ───────────────────────────────────────────────────────────

function ActionRow({
  action,
  doc,
  isAtT,
  isSelected,
  onUpdate,
  onDelete,
  onSeek,
  onSelect,
}: {
  action: Action;
  doc: GafferDocument;
  isAtT: boolean;
  isSelected?: boolean;
  onUpdate: (id: string, patch: { start?: number; duration?: number }) => void;
  onDelete: (id: string) => void;
  onSeek: (t: number) => void;
  onSelect?: (id: string) => void;
}) {
  const [startStr, setStartStr] = useState(action.start.toFixed(2));
  const [durStr, setDurStr] = useState(action.duration.toFixed(2));

  useEffect(() => { setStartStr(action.start.toFixed(2)); }, [action.start]);
  useEffect(() => { setDurStr(action.duration.toFixed(2)); }, [action.duration]);

  function commitStart() {
    const v = parseFloat(startStr);
    if (!isNaN(v) && v >= 0) onUpdate(action.id, { start: v });
    else setStartStr(action.start.toFixed(2));
  }
  function commitDur() {
    const v = parseFloat(durStr);
    if (!isNaN(v) && v > 0) onUpdate(action.id, { duration: v });
    else setDurStr(action.duration.toFixed(2));
  }

  const kindIcon =
    action.kind === 'pass' ? <ArrowRight size={12} />
    : action.kind === 'run' ? <Footprints size={12} />
    : action.kind === 'carry' ? <Move size={12} />
    : null;

  const actor = entityLabel(doc, action.entityId);

  let target = '';
  if (action.kind === 'pass') {
    target =
      'entityId' in action.target
        ? `→ ${entityLabel(doc, action.target.entityId)}`
        : `→ (${action.target.x.toFixed(0)},${action.target.y.toFixed(0)})`;
  } else if (action.kind === 'run' && 'x' in action.destination) {
    target = `→ (${action.destination.x.toFixed(0)},${action.destination.y.toFixed(0)})`;
  } else if (action.kind === 'carry' && action.destination != null) {
    target = `→ (${action.destination.x.toFixed(0)},${action.destination.y.toFixed(0)})`;
  }

  const inputCls =
    'w-12 bg-[#0f1f10] border border-[#2d5a30] rounded px-1 py-0.5 text-[#86efac] text-center focus:outline-none focus:border-[#22c55e] text-[11px]';

  return (
    <div
      className={[
        'flex items-center gap-1.5 px-3 py-2 border-b border-[#1a2e1c] text-[11px] cursor-pointer',
        isAtT ? 'bg-[#0f2010]' : isSelected ? 'bg-[#0a1e10] border-l-2 border-l-[#22c55e]' : 'hover:bg-[#0d1a0e]',
      ].join(' ')}
      onClick={() => { onSeek(action.start); onSelect?.(action.id); }}
    >
      <span className="text-[#4a7a4e] flex-shrink-0 w-3">{kindIcon}</span>
      <span className={['font-bold w-5 flex-shrink-0', isAtT ? 'text-[#22c55e]' : 'text-[#86efac]'].join(' ')}>{actor}</span>
      <span className="text-[#4a7a4e] flex-1 truncate min-w-0">{target}</span>
      <input
        className={inputCls}
        value={startStr}
        onChange={(e) => setStartStr(e.target.value)}
        onBlur={commitStart}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Enter') commitStart(); }}
        title="Start (s)"
      />
      <input
        className={inputCls}
        value={durStr}
        onChange={(e) => setDurStr(e.target.value)}
        onBlur={commitDur}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Enter') commitDur(); }}
        title="Duration (s)"
      />
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(action.id); }}
        className="text-[#2d5a30] hover:text-red-400 flex-shrink-0 ml-0.5"
        title="Delete action"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EditorPage() {
  const {
    document: doc,
    tool,
    selectedEntityId,
    selectedEntityIds,
    selectedActionId,
    lastCreatedActionId,
    lastCreatedEntityId,
    placementTeam,
    placementIsGk,
    placementSize,
    setTool,
    setSelected,
    setSelectedEntities,
    selectAction,
    setActionCurve,
    setPlacementTeam,
    setPlacementIsGk,
    setPlacementSize,
    updatePlayerDisplay,
    addPlayer,
    addBall,
    addCone,
    addMinigoal,
    addMannequin,
    addGoal,
    addZone,
    moveEntity,
    addPass,
    addRun,
    addRunGroup,
    addCarry,
    updateAction,
    deleteAction,
    deleteEntity,
    loadDocument,
    renameDocument,
    undo,
    canUndo,
    setActionStart,
    commitDrag,
  } = useEditorStore();

  // ── Playhead ────────────────────────────────────────────────────────────────

  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [narrateResult, setNarrateResult] = useState<NarrationResult | null>(null);
  const [narrateDebug, setNarrateDebug] = useState(false);
  const [draggingApex, setDraggingApex] = useState<{ x: number; y: number } | null>(null);

  // ── Persistence state ──────────────────────────────────────────────────────
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);
  const [docsOpen, setDocsOpen] = useState(false);
  const [docsList, setDocsList] = useState<DocSummary[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameStr, setRenameStr] = useState('');

  // Identity overlay — shown above a player marker on placement or re-click.
  const [identityOverlay, setIdentityOverlay] = useState<{ entityId: string; mode: 'input' | 'chip' } | null>(null);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const identityEscapedRef = useRef(false);

  // Shift-key state — used by author-mode click to toggle multi-select.
  const shiftRef = useRef(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { shiftRef.current = e.shiftKey; };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); };
  }, []);

  // Zone drawing — anchor set on mousedown, cleared on mouseup.
  const [zoneAnchor, setZoneAnchor] = useState<{ x: number; y: number } | null>(null);

  // Inference confidence — maps entityId → confidence score from the last inferPosition() call.
  // Not persisted; purely transient UI state. Ghost labels are only shown when conf ≥ INFER_CONFIDENCE_THRESHOLD.
  const [inferenceConfidenceMap, setInferenceConfidenceMap] = useState<Map<string, number>>(() => new Map());
  // docRef lets inference effects read the current doc without listing it as a dependency
  // (avoids infinite loops when updatePlayerDisplay patches doc, which re-triggers effects).
  const docRef = useRef(doc);
  docRef.current = doc;

  const playingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const tRef = useRef(0);

  const totalDuration = useMemo(
    () => (doc.actions.length > 0
      ? Math.max(...doc.actions.map((a) => a.start + a.duration))
      : 0.1),
    [doc.actions],
  );
  const totalDurationRef = useRef(totalDuration);
  totalDurationRef.current = totalDuration;

  // After any new action is authored, auto-seek playhead to the new sequence end.
  const prevActionsLenRef = useRef(doc.actions.length);
  useEffect(() => {
    if (doc.actions.length > prevActionsLenRef.current) {
      tRef.current = totalDuration;
      setT(totalDuration);
    }
    prevActionsLenRef.current = doc.actions.length;
  }, [doc.actions, totalDuration]);

  // After undo (or action deletion), clamp playhead to new total duration.
  const prevTotalDurationRef = useRef(totalDuration);
  useEffect(() => {
    if (totalDuration < prevTotalDurationRef.current && tRef.current > totalDuration) {
      tRef.current = totalDuration;
      setT(totalDuration);
    }
    prevTotalDurationRef.current = totalDuration;
  }, [totalDuration]);

  const tick = useCallback((now: number) => {
    if (!playingRef.current) return;
    if (lastTimeRef.current !== null) {
      const dt = (now - lastTimeRef.current) / 1000;
      const next = Math.min(tRef.current + dt, totalDurationRef.current);
      tRef.current = next;
      setT(next);
      if (next >= totalDurationRef.current) {
        playingRef.current = false;
        setPlaying(false);
        rafRef.current = null;
        return;
      }
    }
    lastTimeRef.current = now;
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    return () => {
      playingRef.current = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  function seekTo(v: number) {
    tRef.current = v;
    setT(v);
  }

  function play() {
    if (playingRef.current) return;
    if (tRef.current >= totalDurationRef.current) seekTo(0);
    lastTimeRef.current = null;
    playingRef.current = true;
    setPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  }
  function pause() {
    if (!playingRef.current) return;
    playingRef.current = false;
    setPlaying(false);
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    lastTimeRef.current = null;
  }
  function restart() { pause(); seekTo(0); }

  // ── Moments (sorted distinct stops for Prev/Next) ──────────────────────────

  const moments = useMemo(() => {
    const stops = new Set<number>([0, totalDuration]);
    for (const a of doc.actions) stops.add(a.start);
    return Array.from(stops).sort((a, b) => a - b);
  }, [doc.actions, totalDuration]);

  const currentMomentIdx = useMemo(() => {
    let idx = 0;
    for (let i = 0; i < moments.length; i++) {
      if (moments[i] <= t + 0.001) idx = i;
    }
    return idx;
  }, [moments, t]);

  function gotoPrev() {
    const prev = [...moments].reverse().find((m) => m < t - 0.001);
    if (prev !== undefined) { pause(); seekTo(prev); }
  }
  function gotoNext() {
    const next = moments.find((m) => m > t + 0.001);
    if (next !== undefined) { pause(); seekTo(next); }
  }

  // ── Board state — always rendered at t ─────────────────────────────────────

  const boardState = useMemo(() => resolveBoardState(doc, t), [doc, t]);
  const ballEntityId = useMemo(
    () => doc.entities.find((e) => e.kind === 'ball')?.id,
    [doc.entities],
  );

  // Zone entities — passed directly to BoardRenderer (not in boardState.entities).
  const zones = useMemo(
    () => doc.entities.filter((e): e is ZoneEntity => e.kind === 'zone'),
    [doc.entities],
  );

  // Seeded goal ids — renderer suppresses GoalMarker for these (pitch paint is the visual).
  const seededGoalIds = useMemo(
    () => new Set(doc.entities.filter((e) => e.kind === 'goal' && (e as GoalEntity).seeded).map((e) => e.id)),
    [doc.entities],
  );

  // Owner at current playhead t — drives possession ring and diagnostic readout.
  const ownerAtT = useMemo(() => resolveOwnerAtT(doc, t), [doc, t]);
  // Owner at end of authored sequence — drives authoring new ball actions.
  const endOwner = useMemo(() => resolveOwnerAtT(doc, maxActionEnd(doc)), [doc]);

  // ── Diagnostic: action path overlays ──────────────────────────────────────
  // All endpoints derived from resolvePosition at action.start/end — never entity.initial.
  const actionOverlays = useMemo((): ActionOverlay[] => {
    const dir = doc.stage.direction;

    function perim(cx: number, cy: number, r: number) {
      const dist = r + BALL_RADIUS + 1;
      return { x: cx, y: cy + (dir === 'up' ? -dist : dist) };
    }
    function eRadius(id: string) {
      const e = doc.entities.find((e) => e.id === id);
      return e?.radius ?? DEFAULT_ENTITY_RADIUS;
    }

    const result: ActionOverlay[] = [];
    for (const a of doc.actions) {
      const active = t >= a.start && t <= a.start + a.duration;
      const isSelected = selectedActionId === a.id;

      // Bezier control point: live preview during apex drag, else stored path.
      let cx: number | undefined;
      let cy: number | undefined;
      if (a.kind === 'run' || a.kind === 'carry' || a.kind === 'pass') {
        if (isSelected && draggingApex) {
          const chordPts = getActionChordEndpoints(doc, a.id);
          if (chordPts) {
            const mx = (chordPts.start.x + chordPts.end.x) / 2;
            const my = (chordPts.start.y + chordPts.end.y) / 2;
            cx = 2 * draggingApex.x - mx;
            cy = 2 * draggingApex.y - my;
          }
        } else if (a.path.type === 'bezier') {
          cx = a.path.cx;
          cy = a.path.cy;
        }
      }

      if (a.kind === 'pass') {
        const passerPos = resolvePosition(doc, a.entityId, a.start);
        const from = perim(passerPos.x, passerPos.y, eRadius(a.entityId));
        let to: { x: number; y: number };
        if ('entityId' in a.target) {
          const targetId = a.target.entityId;
          const targetEntity = doc.entities.find((e) => e.id === targetId);
          if (targetEntity?.kind === 'player') {
            const receiverPos = resolvePosition(doc, targetId, a.start + a.duration);
            to = perim(receiverPos.x, receiverPos.y, eRadius(targetId));
          } else {
            // Non-player target: static reference point, no perimeter offset.
            to = resolveTargetPoint(doc, targetId) ?? from;
          }
        } else {
          to = { x: a.target.x, y: a.target.y };
        }
        result.push({ id: a.id, kind: 'pass', x1: from.x, y1: from.y, x2: to.x, y2: to.y, active, selected: isSelected, cx, cy });

      } else if (a.kind === 'run' && 'x' in a.destination) {
        const startPos = resolvePosition(doc, a.entityId, a.start);
        result.push({ id: a.id, kind: 'run', x1: startPos.x, y1: startPos.y, x2: a.destination.x, y2: a.destination.y, active, selected: isSelected, cx, cy });

      } else if (a.kind === 'carry' && a.destination != null) {
        const startPos = resolvePosition(doc, a.entityId, a.start);
        const from = perim(startPos.x, startPos.y, eRadius(a.entityId));
        result.push({ id: a.id, kind: 'carry', x1: from.x, y1: from.y, x2: a.destination.x, y2: a.destination.y, active, selected: isSelected, cx, cy });

      } else if (a.kind === 'carry' && a.destinationEntityId != null) {
        const startPos = resolvePosition(doc, a.entityId, a.start);
        const from = perim(startPos.x, startPos.y, eRadius(a.entityId));
        const destPt = resolveTargetPoint(doc, a.destinationEntityId);
        if (destPt) result.push({ id: a.id, kind: 'carry', x1: from.x, y1: from.y, x2: destPt.x, y2: destPt.y, active, selected: isSelected, cx, cy });
      }
    }
    return result;
  }, [doc, t, selectedActionId, draggingApex]);

  // ── Apex dot position — chord midpoint for straight, B(0.5) for bezier ───
  // Depends only on doc + selectedActionId (not draggingApex) so Konva's drag
  // doesn't fight React re-renders during the drag.
  const apexDotPosition = useMemo(() => {
    if (!selectedActionId) return null;
    const action = doc.actions.find((a) => a.id === selectedActionId);
    if (!action || (action.kind !== 'run' && action.kind !== 'carry' && action.kind !== 'pass')) return null;
    const endpoints = getActionChordEndpoints(doc, selectedActionId);
    if (!endpoints) return null;
    const { start: p0, end: p2 } = endpoints;
    if (action.path.type === 'bezier') {
      const { cx, cy } = action.path;
      // B(0.5) = 0.25·P0 + 0.5·P1 + 0.25·P2
      return { x: 0.25 * p0.x + 0.5 * cx + 0.25 * p2.x, y: 0.25 * p0.y + 0.5 * cy + 0.25 * p2.y };
    }
    return { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 };
  }, [selectedActionId, doc]);

  // ── DIAGNOSTIC: ball-hidden-under-marker assertion ─────────────────────────
  const ballHidden = useMemo(() => {
    if (!ownerAtT) return false;
    const owner = boardState.entities.find((e) => e.id === ownerAtT);
    if (!owner) return false;
    const r = owner.radius ?? DEFAULT_ENTITY_RADIUS;
    const dx = boardState.ball.x - owner.x;
    const dy = boardState.ball.y - owner.y;
    return dx * dx + dy * dy < r * r;
  }, [boardState, ownerAtT]);

  const hiddenWarnRef = useRef<string | null>(null);
  useEffect(() => {
    if (ballHidden && ownerAtT) {
      const key = `${t.toFixed(2)}|${ownerAtT}`;
      if (hiddenWarnRef.current !== key) {
        console.warn(`[DIAG] Ball hidden under marker: owner=${ownerAtT} t=${t.toFixed(3)}`);
        hiddenWarnRef.current = key;
      }
    }
  }, [ballHidden, ownerAtT, t]);

  // ── Apex dot state effects ────────────────────────────────────────────────

  // Reset dragging preview when action selection changes.
  useEffect(() => { setDraggingApex(null); }, [selectedActionId]);

  // Auto-select a newly authored action.
  useEffect(() => {
    if (lastCreatedActionId) selectAction(lastCreatedActionId);
  }, [lastCreatedActionId, selectAction]);

  // ── Identity overlay lifecycle ────────────────────────────────────────────

  // Open identity input whenever a new player is placed.
  useEffect(() => {
    if (lastCreatedEntityId) {
      setIdentityOverlay({ entityId: lastCreatedEntityId, mode: 'input' });
      setInputValue('');
    }
  }, [lastCreatedEntityId]);

  // Run position inference on placement. Uses docRef to avoid retriggering when
  // updatePlayerDisplay (called below) patches the doc.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!lastCreatedEntityId) return;
    const entity = docRef.current.entities.find((e) => e.id === lastCreatedEntityId);
    if (entity?.kind !== 'player') return;
    const scoringDir = buildFrameScoringDirection(docRef.current.frame.teams);
    const { position, confidence } = inferPosition(entity.initial.x, entity.initial.y, entity.team ?? 'neutral', scoringDir);
    updatePlayerDisplay(lastCreatedEntityId, { inferredPositionId: position });
    setInferenceConfidenceMap((prev) => { const next = new Map(prev); next.set(lastCreatedEntityId, confidence); return next; });
  }, [lastCreatedEntityId, updatePlayerDisplay]);

  // Focus the input as soon as the overlay opens in input mode.
  useEffect(() => {
    if (identityOverlay?.mode === 'input') {
      const id = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
  }, [identityOverlay]);

  function commitIdentity(entityId: string, value: string) {
    const val = value.trim();
    if (val) {
      if (/^\d{1,2}$/.test(val)) {
        // Jersey number — numeric identifier.
        updatePlayerDisplay(entityId, { jerseyNumber: parseInt(val, 10) });
      } else {
        const upper = val.toUpperCase();
        if (POSITION_ID_SET.has(upper)) {
          // Known PositionId (ST, CAM, GK…) — goes to positionId (user-typed position slot),
          // never to inferredPositionId (system-only) or roleName (freeform coaching label).
          updatePlayerDisplay(entityId, { positionId: upper });
        } else {
          // Freeform coaching label (e.g. "False 9", "Target Man") — goes to roleName.
          updatePlayerDisplay(entityId, { roleName: val });
        }
      }
    }
    setIdentityOverlay(null);
  }

  // ── Ghost drag line + gesture hint ────────────────────────────────────────

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  // Zone preview rect during drag-draw — depends on cursorPos so declared here.
  const zonePreview = useMemo(() => {
    if (!zoneAnchor || !cursorPos) return null;
    return {
      x: Math.min(zoneAnchor.x, cursorPos.x),
      y: Math.min(zoneAnchor.y, cursorPos.y),
      width: Math.abs(cursorPos.x - zoneAnchor.x),
      height: Math.abs(cursorPos.y - zoneAnchor.y),
    };
  }, [zoneAnchor, cursorPos]);

  // Live hint text during an Author-mode drag: updated as cursor moves.
  const gestureHint = useMemo((): string | null => {
    if (tool !== 'author' || !draggingId || !cursorPos) return null;
    const isBallSource = draggingId === ballEntityId || draggingId === endOwner;
    if (isBallSource) {
      // Use findBallDropTarget for hint consistency with drag-end resolution.
      const targetId = findBallDropTarget(boardState.entities, cursorPos.x, cursorPos.y, endOwner ?? null);
      if (targetId) {
        const target = doc.entities.find((e) => e.id === targetId);
        if (target?.kind === 'player') return `pass → ${entityLabel(doc, targetId)}`;
        if (target?.kind === 'goal' || target?.kind === 'minigoal') return 'shot';
      }
      return 'carry';
    }
    const entity = doc.entities.find((e) => e.id === draggingId);
    if (entity?.kind === 'player') return 'run';
    return null;
  }, [tool, draggingId, cursorPos, ballEntityId, endOwner, boardState.entities, doc]);

  const ghostLine = useMemo(() => {
    if (!draggingId || !cursorPos || tool !== 'author') return null;
    const isBallSource = draggingId === ballEntityId || draggingId === endOwner;
    if (isBallSource && ballEntityId) {
      return { x1: boardState.ball.x, y1: boardState.ball.y, x2: cursorPos.x, y2: cursorPos.y };
    }
    const entity = boardState.entities.find((e) => e.id === draggingId);
    if (entity?.kind === 'player') {
      return { x1: entity.x, y1: entity.y, x2: cursorPos.x, y2: cursorPos.y };
    }
    return null;
  }, [draggingId, cursorPos, tool, boardState, ballEntityId, endOwner]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Delete / Backspace — remove selected entity or action in select mode
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (tool === 'select' && !playing) {
          if (selectedEntityId) {
            deleteEntity(selectedEntityId);
          } else if (selectedActionId) {
            deleteAction(selectedActionId);
            selectAction(null);
          }
        }
        return;
      }

      // Cmd/Ctrl+Z — undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) undo();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tool, selectedEntityId, selectedActionId, playing, deleteEntity, deleteAction, selectAction, canUndo, undo]);

  // ── Board interaction ──────────────────────────────────────────────────────

  function handleBoardClick(x: number, y: number) {
    if (playing) return;

    // Hit-test entities (players/cones/etc. at resolved positions)
    let hitId = findEntityAtPoint(boardState.entities, x, y);

    // Also check ball — not in boardState.entities, rendered separately
    if (!hitId && ballEntityId) {
      const dx = boardState.ball.x - x;
      const dy = boardState.ball.y - y;
      if (dx * dx + dy * dy <= (BALL_RADIUS + 4) * (BALL_RADIUS + 4)) {
        hitId = ballEntityId;
      }
    }

    switch (tool) {
      case 'select':
        setSelected(hitId);
        // Entity click always clears action selection — only one can be active at a time.
        selectAction(null);
        break;
      case 'author': {
        if (hitId && doc.entities.find((e) => e.id === hitId)?.kind === 'player' && shiftRef.current) {
          // Shift+click: toggle into multi-select for concurrent run authoring.
          // On first shift+click, seed the selection with the current primary selection.
          if (selectedEntityIds.includes(hitId)) {
            setSelectedEntities(selectedEntityIds.filter(id => id !== hitId));
          } else {
            const base = selectedEntityIds.length === 0 && selectedEntityId
              ? [selectedEntityId, hitId]
              : [...selectedEntityIds, hitId];
            setSelectedEntities(base);
          }
        } else {
          setSelected(hitId);
          setSelectedEntities([]);
        }
        break;
      }

      case 'player':
        if (hitId) {
          const hitEntity = doc.entities.find((e) => e.id === hitId);
          if (hitEntity?.kind === 'player') {
            setIdentityOverlay({ entityId: hitId, mode: 'chip' });
          }
        } else {
          setIdentityOverlay(null);
          addPlayer(x, y);
        }
        break;

      case 'ball':
        if (!hitId || doc.entities.find((e) => e.id === hitId)?.kind !== 'ball') {
          addBall(x, y);
        }
        break;

      case 'cone':
        addCone(x, y);
        break;

      case 'minigoal':
        addMinigoal(x, y);
        break;

      case 'goal':
        addGoal(x, y);
        break;

      case 'mannequin':
        addMannequin(x, y);
        break;

      case 'zone':
        // Intentional no-op: Konva fires mousedown -> mouseup -> click on zone
        // drag-draw completion. Zone creation is fully handled in
        // handleBoardMouseUp; this case exists only to absorb the trailing
        // click event. Do not remove.
        break;
    }
  }

  // ── Zone draw handlers ────────────────────────────────────────────────────

  function handleBoardMouseDown(x: number, y: number) {
    if (tool === 'zone' && !playing) {
      setZoneAnchor({ x, y });
    }
  }

  function handleBoardMouseUp(x: number, y: number) {
    if (tool !== 'zone' || !zoneAnchor || playing) { setZoneAnchor(null); return; }
    const w = Math.abs(x - zoneAnchor.x);
    const h = Math.abs(y - zoneAnchor.y);
    if (w >= 10 && h >= 10) {
      addZone({
        shape: 'rect',
        x: Math.min(x, zoneAnchor.x),
        y: Math.min(y, zoneAnchor.y),
        width: w,
        height: h,
      });
    }
    setZoneAnchor(null);
  }

  // ── Drag handlers ─────────────────────────────────────────────────────────

  function handleEntityDragStart(id: string) {
    setDraggingId(id);
  }

  function handleEntityDragEnd(id: string, x: number, y: number) {
    setDraggingId(null);
    setCursorPos(null);
    if (playing) return;

    switch (tool) {
      case 'select': {
        // Move only — inference runs at placement time (lastCreatedEntityId effect, line ~637),
        // never at drag-end. Moving an already-placed marker never rewrites inferredPositionId.
        moveEntity(id, x, y);
        break;
      }

      case 'author': {
        // inferGesture: ball/owner source → pass (onto player/goal/mini-goal) or carry (into space)
        //               non-owner player → run
        const isBallSource = id === ballEntityId || id === endOwner;
        if (isBallSource) {
          // findBallDropTarget: enlarged rect hit regions for goals/mini-goals,
          // near-miss margin for players, endOwner excluded.
          // Player wins over goal when both in range — see findBallDropTarget.
          const targetId = findBallDropTarget(boardState.entities, x, y, endOwner ?? null);
          if (targetId) {
            // player → pass; goal/mini-goal → shot (resolver releases ball from shooter)
            addPass(targetId);
          } else {
            // No valid target in range — drop in open space → carry.
            // Exception: drop back on the owner's own marker is a self-cancel → no-op.
            const ownerSnap = endOwner ? boardState.entities.find(e => e.id === endOwner) : null;
            if (ownerSnap) {
              const r = ownerSnap.radius ?? HIT_RADIUS;
              const dx = ownerSnap.x - x, dy = ownerSnap.y - y;
              if (dx * dx + dy * dy <= r * r) break; // self-cancel → no-op
            }
            addCarry(x, y);
          }
        } else {
          const entity = doc.entities.find((e) => e.id === id);
          if (entity?.kind === 'player') {
            if (selectedEntityIds.length > 1 && selectedEntityIds.includes(id)) {
              // Multi-select gesture: apply drag delta from this player to all selected players.
              const sourceSnap = boardState.entities.find(e => e.id === id);
              if (sourceSnap) {
                const dx = x - sourceSnap.x;
                const dy = y - sourceSnap.y;
                const runs = selectedEntityIds
                  .map(pid => {
                    const snap = boardState.entities.find(e => e.id === pid);
                    return snap ? { playerId: pid, x: snap.x + dx, y: snap.y + dy } : null;
                  })
                  .filter((r): r is { playerId: string; x: number; y: number } => r !== null);
                addRunGroup(runs, tRef.current);
              }
            } else {
              addRun(id, x, y, tRef.current);
            }
          }
        }
        break;
      }
    }
  }

  // ── Sorted action list ─────────────────────────────────────────────────────

  const sortedActions = useMemo(
    () =>
      [...doc.actions]
        .filter((a) => a.kind === 'pass' || a.kind === 'run' || a.kind === 'carry')
        .sort((a, b) => a.start - b.start),
    [doc.actions],
  );

  // ── Live state readout ────────────────────────────────────────────────────

  const ownerLabel = useMemo(() => {
    if (ownerAtT) return entityLabel(doc, ownerAtT);
    const inFlight = doc.actions.some(
      (a) => a.kind === 'pass' && t >= a.start && t <= a.start + a.duration,
    );
    return inFlight ? 'in flight' : 'loose';
  }, [doc, ownerAtT, t]);

  const endOwnerLabel = endOwner ? entityLabel(doc, endOwner) : null;

  const toolPhrase =
    tool === 'select' ? 'drag to reposition, Del to delete'
    : tool === 'player' ? 'click pitch to place'
    : tool === 'ball' ? 'click a player to place ball'
    : tool === 'cone' ? 'click pitch to place cone'
    : tool === 'minigoal' ? 'click pitch to place mini-goal'
    : tool === 'goal' ? 'click pitch to place goal'
    : tool === 'mannequin' ? 'click pitch to place mannequin'
    : tool === 'zone' ? 'drag to draw a zone region'
    : tool === 'author'
      ? (endOwner
          ? `drag ball/owner → pass or carry  |  drag player → run  (next from: ${endOwnerLabel})`
          : 'drag ball/owner → pass or carry  |  drag player → run  (place ball first for ball actions)')
    : '';

  // ── Persistence handlers ───────────────────────────────────────────────────

  async function handleSave() {
    setSaveStatus('saving');
    setSaveErrorMsg(null);
    const result = await saveDoc(doc);
    if (result.error) {
      console.error('[Gaffer] saveDoc failed:', result.error);
      setSaveErrorMsg(result.error);
      setSaveStatus('error');
    } else {
      setSaveStatus('saved');
      if (docsOpen) refreshDocs();
    }
    setTimeout(() => setSaveStatus('idle'), 3000);
  }

  async function refreshDocs() {
    setDocsLoading(true);
    const list = await listDocs();
    setDocsList(list);
    setDocsLoading(false);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (docsOpen) refreshDocs(); }, [docsOpen]);

  async function handleLoadDoc(id: string) {
    const loaded = await fetchDoc(id);
    if (loaded) {
      loadDocument(loaded);
      tRef.current = 0;
      setT(0);
    }
  }

  async function handleDeleteDoc(id: string) {
    await deleteDoc(id);
    refreshDocs();
  }

  async function commitRename() {
    if (!renamingId || !renameStr.trim()) { setRenamingId(null); return; }
    const newName = renameStr.trim();
    await renameDoc(renamingId, newName);
    // If the row being renamed is the currently loaded document, keep
    // doc.meta.name in sync so a subsequent saveDoc doesn't revert the name.
    const renamingRow = docsList.find((d) => d.id === renamingId);
    if (renamingRow && renamingRow.doc_id === doc.meta.id) {
      renameDocument(newName);
    }
    setRenamingId(null);
    refreshDocs();
  }

  // ── Identity overlay: resolve player position for anchor ──────────────────

  const overlaySnapshot = identityOverlay
    ? boardState.entities.find((e) => e.id === identityOverlay.entityId)
    : null;
  const overlayDocPlayer = identityOverlay && overlaySnapshot
    ? doc.entities.find((e) => e.id === identityOverlay.entityId && e.kind === 'player')
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-[#080f09] text-white" style={{ fontFamily: 'ui-monospace, monospace' }}>

      {/* ── Left tool bar ──────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 w-12 flex flex-col items-center pt-3 gap-1 border-r border-[#1e3a20] bg-[#0b1a0d]">
        {TOOL_DEFS.map(({ id, icon, title }) => (
          <button
            key={id}
            title={title}
            onClick={() => setTool(id)}
            className={[
              'w-9 h-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer',
              tool === id
                ? 'bg-[#22c55e] text-black'
                : 'text-[#4a7a4e] hover:bg-[#1a3320] hover:text-[#86efac]',
            ].join(' ')}
          >
            {icon}
          </button>
        ))}

        {/* Separator */}
        <div className="w-6 border-t border-[#1e3a20] mt-1" />

        {/* Undo */}
        <button
          title="Undo (Cmd+Z)"
          onClick={() => undo()}
          disabled={!canUndo}
          className={[
            'w-9 h-9 rounded-lg flex items-center justify-center transition-colors',
            canUndo
              ? 'text-[#4a7a4e] hover:bg-[#1a3320] hover:text-[#86efac] cursor-pointer'
              : 'text-[#1e3a20] cursor-not-allowed',
          ].join(' ')}
        >
          <Undo2 size={16} />
        </button>

        {/* Delete — only visible in Select mode with something selected */}
        {tool === 'select' && selectedEntityId && (
          <button
            title="Delete selected entity (Del)"
            onClick={() => deleteEntity(selectedEntityId)}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-[#4a7a4e] hover:bg-[#2d0a0a] hover:text-red-400 cursor-pointer"
          >
            <Trash2 size={16} />
          </button>
        )}

        {/* Player toolkit — visible only in Player tool mode */}
        {tool === 'player' && (
          <>
            <div className="w-6 border-t border-[#1e3a20] mt-1" />

            {/* Team colour swatches */}
            {(['A', 'B', 'neutral'] as const).map((team) => (
              <button
                key={team}
                title={team === 'A' ? 'Team A (yellow)' : team === 'B' ? 'Team B (blue)' : 'Neutral (grey)'}
                onClick={() => setPlacementTeam(team)}
                style={{
                  width: 28, height: 28,
                  borderRadius: '50%',
                  background: team === 'A' ? '#FFD700' : team === 'B' ? '#3B82F6' : '#9CA3AF',
                  border: placementTeam === team ? '2px solid white' : '2px solid transparent',
                  outline: placementTeam === team ? '2px solid #22c55e' : 'none',
                  outlineOffset: 1,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              />
            ))}

            {/* GK one-shot toggle */}
            <button
              title="Next player placed is GK"
              onClick={() => setPlacementIsGk(!placementIsGk)}
              className={[
                'w-7 h-7 rounded flex items-center justify-center text-[10px] font-bold cursor-pointer transition-colors',
                placementIsGk
                  ? 'bg-[#22c55e] text-black'
                  : 'text-[#4a7a4e] border border-[#2d5a30] hover:border-[#86efac] hover:text-[#86efac]',
              ].join(' ')}
            >
              GK
            </button>

            {/* Size stepper */}
            {(['small', 'medium', 'large'] as const).map((size) => (
              <button
                key={size}
                title={`Player size: ${size} (r=${size === 'small' ? 16 : size === 'medium' ? 22 : 28})`}
                onClick={() => setPlacementSize(size)}
                className={[
                  'w-7 h-7 rounded flex items-center justify-center text-[10px] cursor-pointer transition-colors',
                  placementSize === size
                    ? 'bg-[#1a3320] text-[#86efac] border border-[#22c55e]'
                    : 'text-[#4a7a4e] border border-[#1e3a20] hover:border-[#2d5a30]',
                ].join(' ')}
              >
                {size === 'small' ? 'S' : size === 'medium' ? 'M' : 'L'}
              </button>
            ))}
          </>
        )}
      </div>

      {/* ── Center: board + controls ───────────────────────────────────────── */}
      <div className="flex flex-col flex-1 items-center justify-start overflow-auto py-5 px-6 gap-2">
        {/* Board + identity overlay */}
        <div style={{ position: 'relative', display: 'inline-block', verticalAlign: 'top' }}>
          <BoardRenderer
            boardState={boardState}
            stage={doc.stage}
            onBoardPointerDown={handleBoardClick}
            selectedEntityId={selectedEntityId}
            ballOwnerEntityId={ownerAtT}
            onEntityDragEnd={playing ? undefined : handleEntityDragEnd}
            onEntityDragStart={playing ? undefined : handleEntityDragStart}
            ballEntityId={ballEntityId}
            actionOverlays={actionOverlays}
            ghostLine={ghostLine}
            ballHidden={ballHidden}
            onBoardPointerMove={(x, y) => setCursorPos({ x, y })}
            showBall={!!ballEntityId}
            // Overlays and apex dot are only interactive in Select mode.
            // In Author mode (and all other modes) they are non-interactive so they
            // cannot intercept authoring drag gestures.
            onOverlayClick={tool === 'select' ? (id) => {
              setSelected(null); // clicking an overlay clears entity selection
              selectAction(id === selectedActionId ? null : id);
            } : undefined}
            apexDot={tool === 'select' && apexDotPosition ? {
              x: apexDotPosition.x,
              y: apexDotPosition.y,
              onDragMove: (x, y) => setDraggingApex({ x, y }),
              onDragEnd: (x, y) => {
                setDraggingApex(null);
                if (selectedActionId) setActionCurve(selectedActionId, x, y);
              },
            } : null}
            zones={zones}
            zonePreview={tool === 'zone' ? zonePreview : null}
            onBoardMouseDown={handleBoardMouseDown}
            onBoardMouseUp={handleBoardMouseUp}
            onZoneClick={tool === 'select' ? (id) => { setSelected(id); selectAction(null); } : undefined}
            seededGoalIds={seededGoalIds}
          />

          {/* Ghost position suggestion overlays — faint/dashed, shown only when:
               • inferredPositionId is set  • confidence ≥ threshold  • no explicit identity */}
          {boardState.entities
            .filter((snapshot) => {
              const docEntity = doc.entities.find((e) => e.id === snapshot.id);
              if (docEntity?.kind !== 'player') return false;
              const d = (docEntity as PlayerEntity).display;
              if (!d?.inferredPositionId) return false;
              if (d.jerseyNumber != null || d.roleName != null || d.positionId != null) return false;
              const conf = inferenceConfidenceMap.get(snapshot.id);
              if (conf === undefined || conf < INFER_CONFIDENCE_THRESHOLD) return false;
              if (identityOverlay?.entityId === snapshot.id) return false;
              return true;
            })
            .map((snapshot) => {
              const docEntity = doc.entities.find((e) => e.id === snapshot.id) as PlayerEntity;
              const inferredPosId = docEntity.display!.inferredPositionId!;
              const r = snapshot.radius ?? 22;
              return (
                <div
                  key={snapshot.id}
                  onClick={() => updatePlayerDisplay(snapshot.id, { positionId: inferredPosId })}
                  title={`Suggested: ${inferredPosId} — click to confirm`}
                  style={{
                    position: 'absolute',
                    left: Math.round(snapshot.x),
                    top: Math.round(snapshot.y - r - 8),
                    transform: 'translate(-50%, -100%)',
                    zIndex: 9,
                    pointerEvents: 'auto',
                    cursor: 'pointer',
                    background: 'rgba(13,26,15,0.85)',
                    border: '1px dashed #4a7a4e',
                    borderRadius: 3,
                    padding: '1px 5px',
                    fontSize: 10,
                    fontFamily: 'ui-monospace, monospace',
                    fontStyle: 'italic',
                    color: '#4a7a4e',
                    userSelect: 'none',
                  }}
                >
                  {inferredPosId}
                </div>
              );
            })}

          {/* Identity overlay — anchored to the player marker */}
          {identityOverlay && overlaySnapshot && (
            <div
              style={{
                position: 'absolute',
                left: Math.round(overlaySnapshot.x),
                top: Math.round(overlaySnapshot.y - (overlaySnapshot.radius ?? 22) - 8),
                transform: 'translate(-50%, -100%)',
                zIndex: 10,
                pointerEvents: 'auto',
              }}
            >
              {identityOverlay.mode === 'input' ? (
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="9 · CAM · name"
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') {
                        commitIdentity(identityOverlay.entityId, inputValue);
                      }
                      if (e.key === 'Escape') {
                        identityEscapedRef.current = true;
                        setIdentityOverlay(null);
                      }
                    }}
                    onBlur={() => {
                      if (!identityEscapedRef.current) {
                        commitIdentity(identityOverlay.entityId, inputValue);
                      }
                      identityEscapedRef.current = false;
                    }}
                    style={{
                      width: 120,
                      background: '#0f1f10',
                      border: '1px solid #22c55e',
                      borderRadius: 4,
                      padding: '3px 6px',
                      color: '#86efac',
                      fontSize: 11,
                      fontFamily: 'ui-monospace, monospace',
                      outline: 'none',
                      textAlign: 'center',
                    }}
                  />
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { identityEscapedRef.current = true; setIdentityOverlay(null); }}
                    style={{ color: '#4a7a4e', fontSize: 12, cursor: 'pointer', background: 'none', border: 'none', padding: '0 2px', lineHeight: 1 }}
                    title="Dismiss"
                  >✕</button>
                </div>
              ) : (
                // Chip editor — existing identity fields + add/close buttons
                <div
                  style={{
                    background: '#0d1a0f',
                    border: '1px solid #2d5a30',
                    borderRadius: 6,
                    padding: '4px 6px',
                    display: 'flex',
                    gap: 4,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    maxWidth: 220,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                  }}
                >
                  {overlayDocPlayer?.kind === 'player' && overlayDocPlayer.display?.jerseyNumber != null && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 2, background: '#1a3320', borderRadius: 3, padding: '1px 5px', fontSize: 11, color: '#86efac', fontFamily: 'ui-monospace, monospace' }}>
                      #{overlayDocPlayer.display.jerseyNumber}
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => updatePlayerDisplay(identityOverlay.entityId, { jerseyNumber: null })}
                        style={{ color: '#4a7a4e', fontSize: 10, cursor: 'pointer', background: 'none', border: 'none', padding: '0 0 0 2px', lineHeight: 1 }}
                        title="Remove jersey number"
                      >×</button>
                    </span>
                  )}
                  {overlayDocPlayer?.kind === 'player' && overlayDocPlayer.display?.roleName != null && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 2, background: '#1a3320', borderRadius: 3, padding: '1px 5px', fontSize: 11, color: '#86efac', fontFamily: 'ui-monospace, monospace' }}>
                      {overlayDocPlayer.display.roleName}
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => updatePlayerDisplay(identityOverlay.entityId, { roleName: null })}
                        style={{ color: '#4a7a4e', fontSize: 10, cursor: 'pointer', background: 'none', border: 'none', padding: '0 0 0 2px', lineHeight: 1 }}
                        title="Remove role"
                      >×</button>
                    </span>
                  )}
                  {overlayDocPlayer?.kind === 'player' && overlayDocPlayer.display?.positionId != null && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 2, background: '#0f2318', borderRadius: 3, padding: '1px 5px', fontSize: 11, color: '#4ade80', fontFamily: 'ui-monospace, monospace', border: '1px solid #2d5a30' }}>
                      {overlayDocPlayer.display.positionId}
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => updatePlayerDisplay(identityOverlay.entityId, { positionId: null })}
                        style={{ color: '#4a7a4e', fontSize: 10, cursor: 'pointer', background: 'none', border: 'none', padding: '0 0 0 2px', lineHeight: 1 }}
                        title="Remove position"
                      >×</button>
                    </span>
                  )}
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setInputValue(''); setIdentityOverlay({ entityId: identityOverlay.entityId, mode: 'input' }); }}
                    style={{ color: '#4a7a4e', fontSize: 13, cursor: 'pointer', background: 'none', border: 'none', padding: '0 2px', lineHeight: 1 }}
                    title="Add field"
                  >+</button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setIdentityOverlay(null)}
                    style={{ color: '#4a7a4e', fontSize: 11, cursor: 'pointer', background: 'none', border: 'none', padding: '0 2px', lineHeight: 1 }}
                    title="Close"
                  >✕</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Live state readout strip ──────────────────────────────────────── */}
        <div
          className="w-[800px] flex items-center gap-3 px-2 py-1 rounded"
          style={{ background: '#0b1a0d', border: '1px solid #1e3a20', fontSize: 11 }}
        >
          <span style={{ color: '#86efac', fontWeight: 700 }}>t={t.toFixed(2)}s</span>
          <span style={{ color: '#2d5a30' }}>/ {totalDuration.toFixed(2)}s</span>
          <span style={{ color: '#1e3a20' }}>|</span>
          <span style={{ color: '#4a7a4e' }}>m{currentMomentIdx + 1}/{moments.length}</span>
          <span style={{ color: '#1e3a20' }}>|</span>
          <span style={{ color: '#4a7a4e' }}>
            owner: <span style={{ color: ownerAtT ? '#38bdf8' : '#6b7280' }}>{ownerLabel}</span>
          </span>
          <span style={{ color: '#1e3a20' }}>|</span>
          <span style={{ color: '#4a7a4e' }}>
            next from: <span style={{ color: endOwner ? '#fbbf24' : '#6b7280' }}>{endOwnerLabel ?? 'nobody'}</span>
          </span>
          <span style={{ color: '#1e3a20' }}>|</span>
          <span style={{ color: gestureHint ? '#22c55e' : '#f59e0b' }}>
            {gestureHint ?? `${tool}: `}
          </span>
          {!gestureHint && <span style={{ color: '#6b7280' }}>{toolPhrase}</span>}
        </div>

        {/* Scrubber */}
        <div className="w-[800px] flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={totalDuration}
            step={0.001}
            value={t}
            onChange={(e) => { const v = parseFloat(e.target.value); seekTo(v); }}
            style={{ flex: 1, accentColor: '#22c55e', cursor: 'pointer', height: 18 }}
          />
        </div>

        {/* Beat strip — run clips draggable; ball-action clips fixed */}
        {sortedActions.length > 0 && (
          <BeatStrip
            actions={sortedActions}
            currentT={t}
            totalDuration={totalDuration}
            labelFor={(id) => entityLabel(doc, id)}
            onRunStartChange={setActionStart}
            onRunDragEnd={commitDrag}
          />
        )}

        {/* Playback controls */}
        <div className="w-[800px] flex items-center gap-2">
          <button
            onClick={restart}
            title="Restart (t=0)"
            className="w-8 h-8 rounded-md border border-[#2d5a30] bg-[#0f1f10] text-[#86efac] flex items-center justify-center hover:bg-[#1a3320] cursor-pointer flex-shrink-0"
          >
            <RotateCcw size={13} />
          </button>
          <button
            onClick={playing ? pause : play}
            title={playing ? 'Pause' : 'Play'}
            className="w-9 h-9 rounded-lg bg-[#22c55e] text-black flex items-center justify-center hover:bg-[#16a34a] cursor-pointer flex-shrink-0"
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button
            onClick={gotoPrev}
            title="Previous moment"
            className="w-7 h-7 rounded-md border border-[#2d5a30] bg-[#0f1f10] text-[#86efac] flex items-center justify-center hover:bg-[#1a3320] cursor-pointer flex-shrink-0"
          >
            <ChevronLeft size={13} />
          </button>
          <button
            onClick={gotoNext}
            title="Next moment"
            className="w-7 h-7 rounded-md border border-[#2d5a30] bg-[#0f1f10] text-[#86efac] flex items-center justify-center hover:bg-[#1a3320] cursor-pointer flex-shrink-0"
          >
            <ChevronRight size={13} />
          </button>
        </div>

        {/* JSON debug (collapsible) */}
        <div className="w-[800px]">
          <button
            onClick={() => setJsonOpen((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-[#2d5a30] hover:text-[#4a7a4e] cursor-pointer"
          >
            {jsonOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            document JSON
          </button>
          {jsonOpen && (
            <pre className="mt-1 text-[10px] text-[#4a7a4e] bg-[#0b1a0d] border border-[#1e3a20] rounded p-3 overflow-auto max-h-64">
              {JSON.stringify(doc, null, 2)}
            </pre>
          )}
        </div>

        {/* Narration panel */}
        <div className="w-[800px]">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setNarrateResult(narrate(doc, { debug: narrateDebug }))}
              className="flex items-center gap-1 text-[11px] text-[#2d5a30] hover:text-[#4a7a4e] cursor-pointer"
            >
              <ChevronRight size={11} />
              narrate
            </button>
            <label className="flex items-center gap-1 text-[10px] text-[#2d5a30] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={narrateDebug}
                onChange={e => setNarrateDebug(e.target.checked)}
                className="accent-[#2d5a30] w-3 h-3"
              />
              debug
            </label>
          </div>
          {narrateResult && (
            <div className="mt-1 bg-[#0b1a0d] border border-[#1e3a20] rounded p-3">
              {narrateResult.clauses.length === 0 ? (
                <p className="text-[11px] text-[#4a7a4e]">No passes to narrate.</p>
              ) : (
                <ol className="list-decimal list-inside space-y-1">
                  {narrateResult.clauses.map((c) => (
                    <li key={c.beatIndex} className="text-[11px] text-[#86efac]">{c.text}</li>
                  ))}
                </ol>
              )}
              {narrateResult.notes.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {narrateResult.notes.map((n, i) => (
                    <li key={i} className="text-[10px] text-[#2d5a30]">{n}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: action list + documents ────────────────────────────────── */}
      <div className="flex-shrink-0 w-64 border-l border-[#1e3a20] bg-[#0b1a0d] flex flex-col overflow-hidden">
        {/* Header */}
        <div
          className="px-3 border-b border-[#1e3a20] flex items-center justify-between"
          style={{ paddingTop: 10, paddingBottom: 10, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#4a7a4e' }}
        >
          <span>ACTIONS</span>
          <div className="flex items-center gap-2">
            <button
              title={
                saveStatus === 'error' && saveErrorMsg
                  ? `Save failed: ${saveErrorMsg}`
                  : saveStatus === 'saving'
                  ? 'Saving…'
                  : 'Save document'
              }
              onClick={handleSave}
              disabled={saveStatus === 'saving'}
              className={[
                'flex items-center gap-1 text-[10px] cursor-pointer transition-colors',
                saveStatus === 'saved' ? 'text-[#22c55e]'
                  : saveStatus === 'error' ? 'text-red-400'
                  : 'text-[#2d5a30] hover:text-[#86efac]',
              ].join(' ')}
            >
              <Save size={11} />
              {saveStatus === 'saving' ? 'saving…'
                : saveStatus === 'saved' ? 'saved'
                : saveStatus === 'error' ? (saveErrorMsg ? `err: ${saveErrorMsg.slice(0, 28)}` : 'error')
                : 'save'}
            </button>
            <span style={{ fontWeight: 400, color: '#2d5a30', letterSpacing: 0 }}>start · dur</span>
          </div>
        </div>

        {/* Action rows */}
        <div className="flex-1 overflow-y-auto">
          {sortedActions.length === 0 ? (
            <p style={{ padding: '16px 12px', fontSize: 11, color: '#2d5a30', lineHeight: 1.6 }}>
              No actions yet. In Author mode, drag ball or players to create actions.
            </p>
          ) : (
            sortedActions.map((a) => (
              <ActionRow
                key={a.id}
                action={a}
                doc={doc}
                isAtT={Math.abs(a.start - t) < 0.001}
                isSelected={selectedActionId === a.id}
                onUpdate={updateAction}
                onDelete={deleteAction}
                onSeek={(time) => { pause(); seekTo(time); }}
                onSelect={(id) => { setSelected(null); selectAction(id); }}
              />
            ))
          )}
        </div>

        {/* Documents section */}
        <div className="border-t border-[#1e3a20] flex-shrink-0">
          <button
            onClick={() => setDocsOpen((v) => !v)}
            className="w-full px-3 py-2 flex items-center gap-1.5 cursor-pointer hover:bg-[#0d1a0e]"
            style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#4a7a4e' }}
          >
            {docsOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            <FolderOpen size={11} />
            DOCUMENTS
          </button>

          {docsOpen && (
            <div className="overflow-y-auto max-h-52 border-t border-[#1a2e1c]">
              {docsLoading ? (
                <p className="px-3 py-2 text-[11px]" style={{ color: '#2d5a30' }}>Loading…</p>
              ) : docsList.length === 0 ? (
                <p className="px-3 py-2 text-[11px]" style={{ color: '#2d5a30' }}>No saved documents.</p>
              ) : (
                docsList.map((d) => (
                  <div
                    key={d.id}
                    className="px-3 py-1.5 border-b border-[#1a2e1c] flex items-center gap-1 hover:bg-[#0d1a0e]"
                    style={{ fontSize: 11 }}
                  >
                    {renamingId === d.id ? (
                      <input
                        autoFocus
                        className="flex-1 min-w-0 rounded px-1 py-0.5 text-[11px] focus:outline-none"
                        style={{ background: '#0f1f10', border: '1px solid #22c55e', color: '#86efac' }}
                        value={renameStr}
                        onChange={(e) => setRenameStr(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename();
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                      />
                    ) : (
                      <span
                        className="flex-1 min-w-0 truncate cursor-pointer"
                        style={{ color: '#86efac' }}
                        title={`Load: ${d.name}`}
                        onClick={() => handleLoadDoc(d.id)}
                      >
                        {d.name}
                      </span>
                    )}
                    <button
                      title="Rename"
                      onClick={() => { setRenamingId(d.id); setRenameStr(d.name); }}
                      className="flex-shrink-0"
                      style={{ color: '#2d5a30' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#86efac'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#2d5a30'; }}
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      title="Delete"
                      onClick={() => handleDeleteDoc(d.id)}
                      className="flex-shrink-0"
                      style={{ color: '#2d5a30' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#f87171'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#2d5a30'; }}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
