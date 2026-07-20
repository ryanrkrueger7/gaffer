'use client';

// BeatStrip — slim horizontal timeline strip under the board.
// One clip per action (pass/carry/run). Run clips are draggable horizontally;
// dragging changes only start time (duration preserved) via onRunStartChange.
// Ball-action clips (pass/carry) are fixed — not draggable.

import { useRef, useState } from 'react';
import type { Action } from '@/lib/engine/types';

interface BeatStripProps {
  actions: Action[];             // sorted by start (caller's responsibility)
  currentT: number;
  totalDuration: number;
  labelFor: (entityId: string) => string;
  onRunStartChange: (actionId: string, newStart: number) => void;
}

const STRIP_W = 800;
const STRIP_H = 36;
const CLIP_H  = 26;
const CLIP_TOP = 5;
const MIN_CLIP_W = 4;

const STYLES = {
  pass:  { bg: '#0d2a4a', border: '#1e5a8a', text: '#60a5fa' },
  carry: { bg: '#2a1a05', border: '#7c4f1a', text: '#f59e0b' },
  run:   { bg: '#0d2a14', border: '#22c55e', text: '#86efac' },
} as const;

export default function BeatStrip({
  actions,
  currentT,
  totalDuration,
  labelFor,
  onRunStartChange,
}: BeatStripProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingId,  setDraggingId]  = useState<string | null>(null);
  const [dragOffsetX, setDragOffsetX] = useState(0);

  // Avoid divide-by-zero when no actions yet.
  const dur = totalDuration > 0 ? totalDuration : 1;
  const toPx = (t: number) => (t / dur) * STRIP_W;
  const toT  = (px: number) => (px / STRIP_W) * dur;

  function handlePointerDown(e: React.PointerEvent, action: Action) {
    if (action.kind !== 'run') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const containerLeft = containerRef.current?.getBoundingClientRect().left ?? 0;
    setDragOffsetX(e.clientX - containerLeft - toPx(action.start));
    setDraggingId(action.id);
    e.stopPropagation();
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!draggingId || !containerRef.current) return;
    const containerLeft = containerRef.current.getBoundingClientRect().left;
    const newStart = toT(e.clientX - containerLeft - dragOffsetX);
    onRunStartChange(draggingId, newStart); // store clamps to [0, maxActionEnd]
  }

  function clearDrag() { setDraggingId(null); }

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
      {actions.map((action) => {
        const s = STYLES[action.kind as keyof typeof STYLES];
        if (!s) return null;
        const isRun = action.kind === 'run';
        const left  = toPx(action.start);
        const width = Math.max(MIN_CLIP_W, toPx(action.duration));
        const label = labelFor(action.entityId).slice(0, 3);
        return (
          <div
            key={action.id}
            onPointerDown={isRun ? (e) => handlePointerDown(e, action) : undefined}
            title={`${action.kind} · ${action.entityId.slice(0, 6)} · ${action.start.toFixed(2)}–${(action.start + action.duration).toFixed(2)}s`}
            style={{
              position: 'absolute',
              left,
              top: CLIP_TOP,
              width,
              height: CLIP_H,
              background: s.bg,
              border: `1px solid ${s.border}`,
              borderRadius: 2,
              boxSizing: 'border-box',
              cursor: isRun ? 'grab' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            <span style={{
              color: s.text,
              fontSize: 9,
              fontFamily: 'monospace',
              pointerEvents: 'none',
              letterSpacing: '-0.02em',
            }}>
              {label}
            </span>
          </div>
        );
      })}

      {/* Playhead */}
      <div style={{
        position: 'absolute',
        left: toPx(currentT),
        top: 0,
        width: 1,
        height: STRIP_H,
        background: '#22c55e',
        pointerEvents: 'none',
        zIndex: 10,
      }} />
    </div>
  );
}
