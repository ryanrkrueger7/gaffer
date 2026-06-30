'use client';

// Authoring surface — place entities, draw actions, play through the engine.
// No generation, no persistence.

import dynamic from 'next/dynamic';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  MousePointer2,
  UserPlus,
  Circle,
  ArrowRight,
  Footprints,
  Move,
  Play,
  Pause,
  RotateCcw,
  Trash2,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
} from 'lucide-react';
import { useEditorStore } from '@/lib/engine/store';
import type { Tool } from '@/lib/engine/store';
import { resolveBoardState } from '@/lib/engine/resolve';
import type { GafferDocument, Action } from '@/lib/engine/types';
import type { BoardRendererProps } from '@/components/engine/BoardRenderer';

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

const HIT_RADIUS = 22; // default entity radius for click detection

// Returns the id of the entity under (x, y) at the document's initial positions,
// or null if none. Used for edit-mode click handling (t=0, so initial = current).
function findEntityAtPoint(doc: GafferDocument, x: number, y: number): string | null {
  for (const e of doc.entities) {
    if (!('initial' in e)) continue; // zones have no initial
    const ent = e as { id: string; radius?: number; initial: { x: number; y: number } };
    const r = ent.radius ?? HIT_RADIUS;
    const dx = ent.initial.x - x;
    const dy = ent.initial.y - y;
    if (dx * dx + dy * dy <= r * r) return ent.id;
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
  { id: 'select', icon: <MousePointer2 size={16} />, title: 'Select / Move (drag to reposition)' },
  { id: 'player', icon: <UserPlus size={16} />, title: 'Place Player' },
  { id: 'ball', icon: <Circle size={16} />, title: 'Place Ball (one per document)' },
  { id: 'pass', icon: <ArrowRight size={16} />, title: 'Draw Pass (click source → target)' },
  { id: 'run', icon: <Footprints size={16} />, title: 'Draw Run (click player → destination)' },
  { id: 'carry', icon: <Move size={16} />, title: 'Draw Carry (click player → destination)' },
];

// ── Action list row ───────────────────────────────────────────────────────────

function ActionRow({
  action,
  doc,
  onUpdate,
  onDelete,
}: {
  action: Action;
  doc: GafferDocument;
  onUpdate: (id: string, patch: { start?: number; duration?: number }) => void;
  onDelete: (id: string) => void;
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
  }

  const inputCls =
    'w-12 bg-[#0f1f10] border border-[#2d5a30] rounded px-1 py-0.5 text-[#86efac] text-center focus:outline-none focus:border-[#22c55e] text-[11px]';

  return (
    <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#1a2e1c] text-[11px]">
      <span className="text-[#4a7a4e] flex-shrink-0 w-3">{kindIcon}</span>
      <span className="text-[#86efac] font-bold w-5 flex-shrink-0">{actor}</span>
      <span className="text-[#4a7a4e] flex-1 truncate min-w-0">{target}</span>
      <input
        className={inputCls}
        value={startStr}
        onChange={(e) => setStartStr(e.target.value)}
        onBlur={commitStart}
        onKeyDown={(e) => { if (e.key === 'Enter') commitStart(); }}
        title="Start (s)"
      />
      <input
        className={inputCls}
        value={durStr}
        onChange={(e) => setDurStr(e.target.value)}
        onBlur={commitDur}
        onKeyDown={(e) => { if (e.key === 'Enter') commitDur(); }}
        title="Duration (s)"
      />
      <button
        onClick={() => onDelete(action.id)}
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
    pendingSourceId,
    setTool,
    setSelected,
    setPendingSource,
    addPlayer,
    addBall,
    moveEntity,
    addPass,
    addRun,
    addCarry,
    updateAction,
    deleteAction,
  } = useEditorStore();

  // ── Playback ────────────────────────────────────────────────────────────────

  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);

  const playingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const tRef = useRef(0);

  const totalDuration = useMemo(
    () => (doc.actions.length > 0
      ? Math.max(...doc.actions.map((a) => a.start + a.duration))
      : 0.1),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc.actions],
  );
  const totalDurationRef = useRef(totalDuration);
  totalDurationRef.current = totalDuration;

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
  }, []); // stable — all live state via refs

  useEffect(() => {
    return () => {
      playingRef.current = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  function play() {
    if (playingRef.current) return;
    if (tRef.current >= totalDurationRef.current) {
      tRef.current = 0;
      setT(0);
    }
    lastTimeRef.current = null;
    playingRef.current = true;
    setPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  }

  function pause() {
    if (!playingRef.current) return;
    playingRef.current = false;
    setPlaying(false);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastTimeRef.current = null;
  }

  function restart() {
    pause();
    tRef.current = 0;
    setT(0);
  }

  // Edit mode always shows t=0 (initial positions); play mode advances t.
  const displayT = playing ? t : 0;
  const boardState = useMemo(() => resolveBoardState(doc, displayT), [doc, displayT]);
  const ballEntityId = useMemo(
    () => doc.entities.find((e) => e.kind === 'ball')?.id,
    [doc.entities],
  );

  // ── Board click ────────────────────────────────────────────────────────────

  function handleBoardClick(x: number, y: number) {
    if (playing) return; // lock edits during playback
    const hitId = findEntityAtPoint(doc, x, y);

    switch (tool) {
      case 'select':
        setSelected(hitId);
        break;
      case 'player':
        if (!hitId) addPlayer(x, y);
        break;
      case 'ball':
        if (!hitId) addBall(x, y);
        break;
      case 'pass':
        if (!pendingSourceId) {
          if (hitId) setPendingSource(hitId);
        } else {
          if (hitId && hitId !== pendingSourceId) addPass(pendingSourceId, hitId);
          else setPendingSource(null); // re-click same or empty → cancel
        }
        break;
      case 'run':
        if (!pendingSourceId) {
          if (hitId) setPendingSource(hitId);
        } else {
          addRun(pendingSourceId, x, y);
        }
        break;
      case 'carry':
        if (!pendingSourceId) {
          if (hitId) setPendingSource(hitId);
        } else {
          addCarry(pendingSourceId, x, y);
        }
        break;
    }
  }

  // ── Sorted action list ─────────────────────────────────────────────────────

  const sortedActions = useMemo(
    () => [...doc.actions]
      .filter((a) => a.kind === 'pass' || a.kind === 'run' || a.kind === 'carry')
      .sort((a, b) => a.start - b.start),
    [doc.actions],
  );

  const progress = totalDuration > 0 ? (playing ? t : 0) / totalDuration : 0;

  // When pendingSourceId is active, show it as pending (amber); otherwise show selectedEntityId (green).
  const selId = pendingSourceId ? null : selectedEntityId;
  const pendId = pendingSourceId;

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
      </div>

      {/* ── Center: board + controls ───────────────────────────────────────── */}
      <div className="flex flex-col flex-1 items-center justify-start overflow-auto py-5 px-6 gap-3">
        {/* Board */}
        <BoardRenderer
          boardState={boardState}
          stage={doc.stage}
          onBoardPointerDown={handleBoardClick}
          selectedEntityId={selId}
          pendingEntityId={pendId}
          onEntityDragEnd={playing ? undefined : moveEntity}
          ballEntityId={ballEntityId}
        />

        {/* Progress bar */}
        <div className="w-[800px] h-[3px] bg-[#1a3320] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#22c55e] rounded-full"
            style={{
              width: `${progress * 100}%`,
              transition: playing ? 'none' : 'width 0.05s',
            }}
          />
        </div>

        {/* Playback controls */}
        <div className="w-[800px] flex items-center gap-2">
          <button
            onClick={restart}
            title="Restart"
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
          <span style={{ fontSize: 13, color: '#86efac', minWidth: 100, letterSpacing: '0.03em' }}>
            {(playing ? t : 0).toFixed(2)}s{' '}
            <span style={{ color: '#2d5a30' }}>/ {totalDuration.toFixed(2)}s</span>
          </span>
          {pendingSourceId && (
            <span style={{ fontSize: 11, color: '#f59e0b', marginLeft: 8 }}>
              {tool === 'pass' ? 'click target player' : 'click destination on pitch'}
            </span>
          )}
        </div>

        {/* JSON debug (collapsible) */}
        <div className="w-[800px]">
          <button
            onClick={() => setJsonOpen((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-[#2d5a30] hover:text-[#4a7a4e] cursor-pointer"
          >
            {jsonOpen ? <ChevronDown size={11} /> : <ChevronRightIcon size={11} />}
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
        {/* Header */}
        <div
          className="px-3 border-b border-[#1e3a20] flex items-center justify-between"
          style={{ paddingTop: 10, paddingBottom: 10, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#4a7a4e' }}
        >
          <span>ACTIONS</span>
          <span style={{ fontWeight: 400, color: '#2d5a30', letterSpacing: 0 }}>start · dur</span>
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-y-auto">
          {sortedActions.length === 0 ? (
            <p style={{ padding: '16px 12px', fontSize: 11, color: '#2d5a30', lineHeight: 1.6 }}>
              No actions yet.{'\n'}Use pass, run, or carry tools.
            </p>
          ) : (
            sortedActions.map((a) => (
              <ActionRow
                key={a.id}
                action={a}
                doc={doc}
                onUpdate={updateAction}
                onDelete={deleteAction}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
