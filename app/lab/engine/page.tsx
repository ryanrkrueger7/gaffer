'use client';

// Isolated demo route — not linked from anywhere.
// Proves: possession binding, bezier carry, and the ball never abandoned mid-pitch.

import dynamic from 'next/dynamic';
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';
import {
  createEmptyDocument,
  makePlayer,
  makeBall,
  makePass,
  makeRun,
  makeCarry,
  makeBeat,
  makeAnnotation,
} from '@/lib/engine/factory';
import { resolveBoardState } from '@/lib/engine/resolve';
import type { GafferDocument } from '@/lib/engine/types';
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

// ── Demo document ─────────────────────────────────────────────────────────────
//
// Three-beat sequence that proves every Day 3 claim:
//
//   Beat 1 (t = 0 → 1.5 s)
//     • p1 plays a ground pass to p2 (ball arrives at t = 1.0)
//     • p2 runs straight to receive it
//     → proves: ball meets the MOVING receiver, not their start position
//
//   Beat 2 (t = 1.5 → 3.5 s)
//     • p2 dribbles along a BEZIER path while the ball stays bound to them
//     → proves: possession binding + bezier + perimeter offset
//
//   Beat 3 (t = 3.5 → 4.5 s)
//     • p2 plays a pass to p3
//     → proves: ball correctly LEAVES the carrier and binds to p3

function buildDemoDoc(): GafferDocument {
  const doc = createEmptyDocument({ name: 'Day 3 Demo', type: 'drill' });

  // Entities
  const p1 = makePlayer({ team: 'A', initial: { x: 180, y: 400 }, display: { positionSlot: 6 } });
  const p2 = makePlayer({ team: 'A', initial: { x: 360, y: 200 }, display: { positionSlot: 8 } });
  const p3 = makePlayer({ team: 'A', initial: { x: 650, y: 380 }, display: { positionSlot: 10 } });
  const ball = makeBall({ initial: { x: 180, y: 400 } }); // starts on p1

  // ── Beat 1: pass into the run ─────────────────────────────────────────────
  const beat1 = makeBeat({ order: 0 });

  // p2 runs diagonally to a receiving position (1.5 s)
  const run1 = makeRun({
    entityId: p2.id,
    beatId: beat1.id,
    destination: { x: 480, y: 310 },
    path: { type: 'straight' },
    start: 0,
    duration: 1.5,
  });

  // p1 plays to p2; ball arrives at p2's t = 1.0 position (not p2's initial)
  const pass1 = makePass({
    entityId: p1.id,
    beatId: beat1.id,
    target: { entityId: p2.id },
    path: { type: 'straight' },
    passType: 'ground',
    start: 0,
    duration: 1.0,
  });

  const ann1 = makeAnnotation({
    text: 'Pass into the run — ball meets p8 at their moving position.',
    kind: 'caption',
    beatId: beat1.id,
    holdAuto: true,
  });
  beat1.annotationIds.push(ann1.id);

  // ── Beat 2: bezier carry ──────────────────────────────────────────────────
  const beat2 = makeBeat({ order: 1 });

  // p2 dribbles from (480, 310) → (580, 430) via a bezier arc (swings right and high)
  const run2 = makeRun({
    entityId: p2.id,
    beatId: beat2.id,
    destination: { x: 580, y: 430 },
    path: { type: 'bezier', cx: 690, cy: 180 },
    start: 1.5,
    duration: 2.0,
  });

  // Carry binds the ball to p2 for the duration of the dribble
  const carry = makeCarry({
    entityId: p2.id,
    beatId: beat2.id,
    start: 1.5,
    duration: 2.0,
  });

  const ann2 = makeAnnotation({
    text: 'Carry along bezier curve — ball stays bound to p8 through the arc.',
    kind: 'caption',
    beatId: beat2.id,
    holdAuto: true,
  });
  beat2.annotationIds.push(ann2.id);

  // ── Beat 3: final pass ────────────────────────────────────────────────────
  const beat3 = makeBeat({ order: 2 });

  // p2 plays to p3 after the carry completes
  const pass2 = makePass({
    entityId: p2.id,
    beatId: beat3.id,
    target: { entityId: p3.id },
    path: { type: 'straight' },
    passType: 'ground',
    start: 3.5,
    duration: 1.0,
  });

  const ann3 = makeAnnotation({
    text: 'Pass from the carrier — ball leaves p8 on contact and binds to p10.',
    kind: 'caption',
    beatId: beat3.id,
    holdAuto: true,
  });
  beat3.annotationIds.push(ann3.id);

  // ── Assemble ──────────────────────────────────────────────────────────────
  doc.entities.push(p1, p2, p3, ball);
  doc.actions.push(run1, pass1, run2, carry, pass2);
  doc.beats.push(beat1, beat2, beat3);
  doc.annotations.push(ann1, ann2, ann3);

  return doc;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EngineLabPage() {
  const doc = useMemo(() => buildDemoDoc(), []);
  const totalDuration = useMemo(
    () => Math.max(...doc.actions.map(a => a.start + a.duration), 0.1),
    [doc],
  );

  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);

  // Refs for the RAF loop — avoid stale closures
  const playingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const tRef = useRef(0);
  const totalDurationRef = useRef(totalDuration);
  totalDurationRef.current = totalDuration;

  // RAF tick — created once, all mutable state via refs
  const tick = useCallback((now: number) => {
    if (!playingRef.current) return;

    if (lastTimeRef.current !== null) {
      const dt = (now - lastTimeRef.current) / 1000; // wall-clock seconds
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
  }, []); // stable — all deps are refs

  // Cleanup on unmount
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

  const boardState = useMemo(() => resolveBoardState(doc, t), [doc, t]);

  const progress = totalDuration > 0 ? t / totalDuration : 0;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#080f09',
        color: 'white',
        fontFamily: 'ui-monospace, monospace',
        padding: '32px 40px',
      }}
    >
      <h1
        style={{
          margin: '0 0 4px',
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: '0.05em',
          color: '#86efac',
        }}
      >
        ENGINE LAB — DAY 3
      </h1>
      <p style={{ margin: '0 0 20px', fontSize: 12, color: '#4a7a4e' }}>
        Possession binding · bezier carry · ball never abandoned
      </p>

      {/* Canvas */}
      <BoardRenderer boardState={boardState} stage={doc.stage} />

      {/* Progress bar */}
      <div
        style={{
          maxWidth: 800,
          marginTop: 10,
          height: 3,
          background: '#1a3320',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${progress * 100}%`,
            background: '#22c55e',
            transition: playing ? 'none' : 'width 0.05s',
          }}
        />
      </div>

      {/* Playback controls + time readout */}
      <div
        style={{
          maxWidth: 800,
          marginTop: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        {/* Restart */}
        <button
          onClick={restart}
          title="Restart"
          style={{
            width: 34,
            height: 34,
            borderRadius: 6,
            border: '1px solid #2d5a30',
            background: '#0f1f10',
            color: '#86efac',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <RotateCcw size={14} />
        </button>

        {/* Play / Pause */}
        <button
          onClick={playing ? pause : play}
          title={playing ? 'Pause' : 'Play'}
          style={{
            width: 38,
            height: 38,
            borderRadius: 8,
            border: 'none',
            background: '#22c55e',
            color: '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>

        {/* Time readout */}
        <span
          style={{
            fontSize: 13,
            color: '#86efac',
            minWidth: 90,
            letterSpacing: '0.03em',
          }}
        >
          {t.toFixed(2)}s{' '}
          <span style={{ color: '#2d5a30' }}>/ {totalDuration.toFixed(2)}s</span>
        </span>
      </div>

      {/* Debug readout */}
      <div style={{ marginTop: 16, fontSize: 11, color: '#2d5a30', lineHeight: 2 }}>
        <div>ball: ({boardState.ball.x.toFixed(1)}, {boardState.ball.y.toFixed(1)})</div>
        <div>active annotations: {boardState.activeAnnotations.map(a => `"${a.text.slice(0, 40)}…"`).join(', ') || 'none'}</div>
      </div>
    </div>
  );
}
