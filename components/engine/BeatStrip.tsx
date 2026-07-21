'use client';

// BeatStrip — slim two-lane timeline strip under the board.
//
// Top lane (pill shape) — ball actions: pass, carry. Fixed, not draggable.
// Bottom lane (square) — run clips. Draggable horizontally via onRunStartChange.
//
// Concurrent runs (same groupId) render as a single draggable "×N" group bar.
// Dragging a group bar moves ALL members via the store's group-propagation logic.

import { useRef, useState } from 'react';
import type { Action, RunAction } from '@/lib/engine/types';

interface BeatStripProps {
  actions: Action[];             // sorted by start (caller's responsibility)
  currentT: number;
  totalDuration: number;
  labelFor: (entityId: string) => string;
  onRunStartChange: (actionId: string, newStart: number) => void;
  /** Called on pointer-up/cancel — signals drag end so the store commits one undo entry. */
  onRunDragEnd?: () => void;
}

const STRIP_W  = 800;
const STRIP_H  = 52;
const MIN_CLIP_W = 4;

// Ball-action lane (top)
const BALL_TOP = 4;
const BALL_H   = 19;

// Run lane (bottom)
const RUN_TOP  = 27;
const RUN_H    = 21;

const STYLES = {
  pass:     { bg: '#0d2a4a', border: '#1e5a8a', text: '#60a5fa' },
  carry:    { bg: '#2a1a05', border: '#7c4f1a', text: '#f59e0b' },
  run:      { bg: '#0d2a14', border: '#22c55e', text: '#86efac' },
  runGroup: { bg: '#122e18', border: '#22c55e', text: '#86efac' },
} as const;

type RunGroup = {
  groupId: string;
  repId: string;      // representative run id for drag (store propagates to whole group)
  start: number;
  duration: number;
  count: number;
};

export default function BeatStrip({
  actions,
  currentT,
  totalDuration,
  labelFor,
  onRunStartChange,
  onRunDragEnd,
}: BeatStripProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingId,  setDraggingId]  = useState<string | null>(null);
  const [dragOffsetX, setDragOffsetX] = useState(0);

  const dur  = totalDuration > 0 ? totalDuration : 1;
  const toPx = (t: number) => (t / dur) * STRIP_W;
  const toT  = (px: number) => (px / STRIP_W) * dur;

  // Separate ball actions from runs
  const ballActions = actions.filter(a => a.kind === 'pass' || a.kind === 'carry');
  const runActions  = actions.filter((a): a is RunAction => a.kind === 'run');

  // Group runs by groupId; ungrouped runs are solo
  const runGroupMap = new Map<string, RunAction[]>();
  const soloRuns: RunAction[] = [];
  for (const r of runActions) {
    if (r.groupId) {
      const g = runGroupMap.get(r.groupId) ?? [];
      g.push(r);
      runGroupMap.set(r.groupId, g);
    } else {
      soloRuns.push(r);
    }
  }
  const runGroups: RunGroup[] = Array.from(runGroupMap.entries()).map(([gid, runs]) => ({
    groupId:  gid,
    repId:    runs[0].id,
    start:    runs[0].start,    // all members share start
    duration: runs[0].duration, // all members share duration
    count:    runs.length,
  }));

  function startDrag(e: React.PointerEvent, actionId: string, start: number) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const containerLeft = containerRef.current?.getBoundingClientRect().left ?? 0;
    setDragOffsetX(e.clientX - containerLeft - toPx(start));
    setDraggingId(actionId);
    e.stopPropagation();
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!draggingId || !containerRef.current) return;
    const containerLeft = containerRef.current.getBoundingClientRect().left;
    const newStart = toT(e.clientX - containerLeft - dragOffsetX);
    onRunStartChange(draggingId, newStart); // store clamps + propagates group
  }

  function clearDrag() { setDraggingId(null); onRunDragEnd?.(); }

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={clearDrag}
      onPointerCancel={clearDrag}
      style={{
        position: 'relative',
        width: STRIP_W,
        height: STRIP_H,
        background: '#0a140b',
        border: '1px solid #1e3a20',
        borderRadius: 4,
        overflow: 'hidden',
        userSelect: 'none',
        cursor: draggingId ? 'grabbing' : 'default',
        flexShrink: 0,
      }}
    >
      {/* Lane divider */}
      <div style={{
        position: 'absolute',
        left: 0, top: BALL_TOP + BALL_H + 2,
        width: STRIP_W, height: 1,
        background: '#1e3a20',
        pointerEvents: 'none',
      }} />

      {/* ── Ball-action clips (top lane, pill shape) ── */}
      {ballActions.map((action) => {
        const s    = STYLES[action.kind as 'pass' | 'carry'];
        const left = toPx(action.start);
        const w    = Math.max(MIN_CLIP_W, toPx(action.duration));
        const lbl  = labelFor(action.entityId).slice(0, 3);
        return (
          <div
            key={action.id}
            title={`${action.kind} · ${action.entityId.slice(0, 6)} · ${action.start.toFixed(2)}–${(action.start + action.duration).toFixed(2)}s`}
            style={{
              position: 'absolute',
              left, top: BALL_TOP,
              width: w, height: BALL_H,
              background: s.bg,
              border: `1px solid ${s.border}`,
              borderRadius: BALL_H / 2, // pill
              boxSizing: 'border-box',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            <span style={{ color: s.text, fontSize: 9, fontFamily: 'monospace', pointerEvents: 'none', letterSpacing: '-0.02em' }}>
              {lbl}
            </span>
          </div>
        );
      })}

      {/* ── Group run bars (bottom lane) ── */}
      {runGroups.map((group) => {
        const s    = STYLES.runGroup;
        const left = toPx(group.start);
        const w    = Math.max(MIN_CLIP_W, toPx(group.duration));
        return (
          <div
            key={group.groupId}
            onPointerDown={(e) => startDrag(e, group.repId, group.start)}
            title={`${group.count} concurrent runs · ${group.start.toFixed(2)}–${(group.start + group.duration).toFixed(2)}s`}
            style={{
              position: 'absolute',
              left, top: RUN_TOP,
              width: w, height: RUN_H,
              background: s.bg,
              border: `1px solid ${s.border}`,
              borderRadius: 3,
              boxSizing: 'border-box',
              cursor: 'grab',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            <span style={{ color: s.text, fontSize: 9, fontFamily: 'monospace', pointerEvents: 'none', letterSpacing: '-0.02em' }}>
              ×{group.count}
            </span>
          </div>
        );
      })}

      {/* ── Solo run clips (bottom lane) ── */}
      {soloRuns.map((action) => {
        const s    = STYLES.run;
        const left = toPx(action.start);
        const w    = Math.max(MIN_CLIP_W, toPx(action.duration));
        const lbl  = labelFor(action.entityId).slice(0, 3);
        return (
          <div
            key={action.id}
            onPointerDown={(e) => startDrag(e, action.id, action.start)}
            title={`run · ${action.entityId.slice(0, 6)} · ${action.start.toFixed(2)}–${(action.start + action.duration).toFixed(2)}s`}
            style={{
              position: 'absolute',
              left, top: RUN_TOP,
              width: w, height: RUN_H,
              background: s.bg,
              border: `1px solid ${s.border}`,
              borderRadius: 3,
              boxSizing: 'border-box',
              cursor: 'grab',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            <span style={{ color: s.text, fontSize: 9, fontFamily: 'monospace', pointerEvents: 'none', letterSpacing: '-0.02em' }}>
              {lbl}
            </span>
          </div>
        );
      })}

      {/* Playhead */}
      <div style={{
        position: 'absolute',
        left: toPx(currentT),
        top: 0, width: 1, height: STRIP_H,
        background: '#22c55e',
        pointerEvents: 'none',
        zIndex: 10,
      }} />
    </div>
  );
}
