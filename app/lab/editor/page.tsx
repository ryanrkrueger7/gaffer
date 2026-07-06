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
} from 'lucide-react';
import { useEditorStore, maxActionEnd, getActionChordEndpoints } from '@/lib/engine/store';
import type { Tool } from '@/lib/engine/store';
import { resolveBoardState, resolveOwnerAtT, resolvePosition } from '@/lib/engine/resolve';
import type { EntitySnapshot } from '@/lib/engine/resolve';
import type { GafferDocument, Action } from '@/lib/engine/types';
import type { BoardRendererProps, ActionOverlay } from '@/components/engine/BoardRenderer';

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

function entityLabel(doc: GafferDocument, id: string): string {
  const e = doc.entities.find((e) => e.id === id);
  if (!e) return '?';
  if (e.kind === 'player') {
    return e.display?.drillLabel ?? e.display?.positionSlot?.toString() ?? '?';
  }
  return e.kind;
}

// ── Tool bar config ───────────────────────────────────────────────────────────

const TOOL_DEFS: { id: Tool; icon: React.ReactNode; title: string }[] = [
  { id: 'select', icon: <MousePointer2 size={16} />, title: 'Select / Move — drag to reposition; Del to delete' },
  { id: 'player', icon: <UserPlus size={16} />, title: 'Place Player — click empty pitch' },
  { id: 'ball', icon: <Circle size={16} />, title: 'Place Ball — click a player to give them possession' },
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
    selectedActionId,
    lastCreatedActionId,
    setTool,
    setSelected,
    selectAction,
    setActionCurve,
    addPlayer,
    addBall,
    moveEntity,
    addPass,
    addRun,
    addCarry,
    updateAction,
    deleteAction,
    deleteEntity,
    undo,
    canUndo,
  } = useEditorStore();

  // ── Playhead ────────────────────────────────────────────────────────────────

  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [draggingApex, setDraggingApex] = useState<{ x: number; y: number } | null>(null);

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
          const receiverPos = resolvePosition(doc, a.target.entityId, a.start + a.duration);
          to = perim(receiverPos.x, receiverPos.y, eRadius(a.target.entityId));
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

  // ── Ghost drag line + gesture hint ────────────────────────────────────────

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  // Live hint text during an Author-mode drag: updated as cursor moves.
  const gestureHint = useMemo((): string | null => {
    if (tool !== 'author' || !draggingId || !cursorPos) return null;
    const isBallSource = draggingId === ballEntityId || draggingId === endOwner;
    if (isBallSource) {
      const targetId = findEntityAtPoint(boardState.entities, cursorPos.x, cursorPos.y);
      if (targetId && targetId !== endOwner) {
        const target = doc.entities.find((e) => e.id === targetId);
        if (target?.kind === 'player') return `pass → ${entityLabel(doc, targetId)}`;
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

      // Delete / Backspace — remove selected entity in select mode
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (tool === 'select' && selectedEntityId && !playing) {
          deleteEntity(selectedEntityId);
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
  }, [tool, selectedEntityId, playing, deleteEntity, canUndo, undo]);

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
        if (!hitId) selectAction(null);
        break;
      case 'author':
        setSelected(hitId);
        break;

      case 'player':
        if (!hitId) addPlayer(x, y);
        break;

      case 'ball':
        if (!hitId || doc.entities.find((e) => e.id === hitId)?.kind !== 'ball') {
          addBall(x, y);
        }
        break;
    }
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
      case 'select':
        moveEntity(id, x, y);
        break;

      case 'author': {
        // inferGesture: ball/owner source → pass (onto player) or carry (into space)
        //               non-owner player → run
        const isBallSource = id === ballEntityId || id === endOwner;
        if (isBallSource) {
          const targetId = findEntityAtPoint(boardState.entities, x, y);
          const target = targetId ? doc.entities.find((e) => e.id === targetId) : null;
          if (targetId && target?.kind === 'player' && targetId !== endOwner) {
            addPass(targetId);
          } else if (!targetId) {
            addCarry(x, y);
          }
          // drop on endOwner itself or non-player → no-op
        } else {
          const entity = doc.entities.find((e) => e.id === id);
          if (entity?.kind === 'player') {
            addRun(id, x, y, tRef.current);
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
    : tool === 'author'
      ? (endOwner
          ? `drag ball/owner → pass or carry  |  drag player → run  (next from: ${endOwnerLabel})`
          : 'drag ball/owner → pass or carry  |  drag player → run  (place ball first for ball actions)')
    : '';

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
      </div>

      {/* ── Center: board + controls ───────────────────────────────────────── */}
      <div className="flex flex-col flex-1 items-center justify-start overflow-auto py-5 px-6 gap-2">
        {/* Board */}
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
          onOverlayClick={(id) => selectAction(id === selectedActionId ? null : id)}
          apexDot={apexDotPosition ? {
            x: apexDotPosition.x,
            y: apexDotPosition.y,
            onDragMove: (x, y) => setDraggingApex({ x, y }),
            onDragEnd: (x, y) => {
              setDraggingApex(null);
              if (selectedActionId) setActionCurve(selectedActionId, x, y);
            },
          } : null}
        />

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
      </div>

      {/* ── Right: action list ─────────────────────────────────────────────── */}
      <div className="flex-shrink-0 w-64 border-l border-[#1e3a20] bg-[#0b1a0d] flex flex-col overflow-hidden">
        <div
          className="px-3 border-b border-[#1e3a20] flex items-center justify-between"
          style={{ paddingTop: 10, paddingBottom: 10, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#4a7a4e' }}
        >
          <span>ACTIONS</span>
          <span style={{ fontWeight: 400, color: '#2d5a30', letterSpacing: 0 }}>start · dur</span>
        </div>
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
                onSelect={selectAction}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
