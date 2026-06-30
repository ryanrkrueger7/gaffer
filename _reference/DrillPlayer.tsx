'use client';

import { useState, useEffect, useRef } from 'react';
import { Stage, Layer, Rect, Circle, Ellipse, Line, Text, Group, Arrow as KonvaArrow } from 'react-konva';
import { Play, Pause, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';

// ── Types (mirror TacticalWhiteboard) ────────────────────────────────────────
type Marker    = { id: string; color: string; x: number; y: number; num?: number; radius?: number };
type ArrowDef  = { id: string; type: 'run' | 'pass'; x1: number; y1: number; x2: number; y2: number; cx: number; cy: number };
type Obj       = { id: string; type: 'cone' | 'minigoal' | 'ball'; x: number; y: number };
type LabelNode = { id: string; x: number; y: number; text: string; width?: number };
type NumberNode = { id: string; x: number; y: number; value: number };
type BoxNode      = { id: string; x: number; y: number; width: number; height: number; text: string };
type ShapeNode    = { id: string; shapeType: string; x: number; y: number; width: number; height: number; color: string; opacity?: number };
type TriangleNode = { id: string; x1: number; y1: number; x2: number; y2: number; x3: number; y3: number; color: string; opacity?: number };
type Snap         = { markers?: Marker[]; arrows?: ArrowDef[]; objects?: Obj[]; labels?: LabelNode[]; numbers?: NumberNode[]; boxes?: BoxNode[]; shapes?: ShapeNode[]; triangles?: TriangleNode[]; fieldView?: string };
export type AnimStep  = { canvas_state: Snap; annotation?: string };

export interface DrillPlayerHandle {
  stepBack: () => void;
  stepForward: () => void;
  startPlay: () => void;
  pause: () => void;
  restart: () => void;
}

interface DrillPlayerProps {
  canvasState: Snap;
  animationSteps: AnimStep[];
  /** Jump to a specific step on mount (0 = base state, 1+ = recorded steps) */
  initialStep?: number;
  /** Hide the built-in control bar (used when a parent provides its own unified bar) */
  hideBar?: boolean;
  /** Called whenever step index or playback state changes so an external bar can sync */
  onStepChange?: (stepIdx: number, total: number, playing: boolean, finished: boolean) => void;
  /** Regular object ref (not React ref prop) populated each render so a parent can call imperative methods */
  handleRef?: { current: DrillPlayerHandle | null };
}

// ── Constants ────────────────────────────────────────────────────────────────
const CW = 800, CH = 600;
const ANIM_MS = 1200;
const STEP_PAUSE_MS = 800;      // brief pause between steps
const ANNOTATION_PAUSE_MS = 2000; // how long to show annotation before auto-dismissing
const R = 22;

// ── Helpers ──────────────────────────────────────────────────────────────────
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function ease(t: number) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
function markerFill(color: string) {
  if (color === 'yellow') return '#FFD700';
  if (color === 'black') return '#1a1a1a';
  return color;
}
function markerText(fill: string) {
  const hex = fill.startsWith('#') ? fill : '#1a1a1a';
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#000000' : '#FFFFFF';
}
function tweenSnap(from: Snap, to: Snap, t: number): Snap {
  const fromMarkers = from.markers ?? [];
  const toMarkers = to.markers ?? [];
  const tweenedMarkers = fromMarkers.map(m => {
    const tM = toMarkers.find(x => x.id === m.id);
    if (!tM) return m;
    return { ...m, x: lerp(m.x, tM.x, t), y: lerp(m.y, tM.y, t) };
  });
  const newMarkers = toMarkers.filter(tM => !fromMarkers.find(m => m.id === tM.id));

  const fromObjs = from.objects ?? [];
  const toObjs = to.objects ?? [];
  const tweenedObjs = fromObjs.map(o => {
    const tO = toObjs.find(x => x.id === o.id);
    if (!tO) return o;
    return { ...o, x: lerp(o.x, tO.x, t), y: lerp(o.y, tO.y, t) };
  });
  const newObjs = toObjs.filter(tO => !fromObjs.find(o => o.id === tO.id));

  return {
    ...to,
    markers: [...tweenedMarkers, ...newMarkers],
    objects: [...tweenedObjs, ...newObjs],
    arrows: t < 0.5 ? (from.arrows ?? []) : (to.arrows ?? from.arrows ?? []),
    labels: t < 0.5 ? (from.labels ?? []) : (to.labels ?? from.labels ?? []),
    numbers: t < 0.5 ? (from.numbers ?? []) : (to.numbers ?? from.numbers ?? []),
    boxes: t < 0.5 ? (from.boxes ?? []) : (to.boxes ?? from.boxes ?? []),
    shapes: t < 0.5 ? (from.shapes ?? []) : (to.shapes ?? from.shapes ?? []),
    triangles: t < 0.5 ? (from.triangles ?? []) : (to.triangles ?? from.triangles ?? []),
  };
}

// ── Field rendering helpers ───────────────────────────────────────────────────
function FieldFull() {
  return (<>
    <Line listening={false} points={[10,10,790,10,790,590,10,590,10,10]} stroke="white" strokeWidth={3} />
    <Line listening={false} points={[10,300,790,300]} stroke="white" strokeWidth={2} />
    <Circle listening={false} x={400} y={300} radius={60} stroke="white" strokeWidth={2} />
    <Circle listening={false} x={400} y={300} radius={3} fill="white" />
    <Line listening={false} points={[250,10,250,90,550,90,550,10]} stroke="white" strokeWidth={2} />
    <Line listening={false} points={[325,10,325,35,475,35,475,10]} stroke="white" strokeWidth={2} />
    <Circle listening={false} x={400} y={68} radius={3} fill="white" />
    <Line listening={false} points={[330,90,340,110,360,124,380,132,400,135,420,132,440,124,460,110,470,90]} stroke="white" strokeWidth={2} tension={0.3} />
    <Rect listening={false} x={358} y={6} width={84} height={4} fill="white" />
    <Line listening={false} points={[250,590,250,510,550,510,550,590]} stroke="white" strokeWidth={2} />
    <Line listening={false} points={[325,590,325,565,475,565,475,590]} stroke="white" strokeWidth={2} />
    <Circle listening={false} x={400} y={532} radius={3} fill="white" />
    <Line listening={false} points={[330,510,340,490,360,476,380,468,400,465,420,468,440,476,460,490,470,510]} stroke="white" strokeWidth={2} tension={0.3} />
    <Rect listening={false} x={358} y={590} width={84} height={4} fill="white" />
  </>);
}
function FieldHalf() {
  return (<>
    <Line listening={false} points={[10,10,790,10,790,590,10,590,10,10]} stroke="white" strokeWidth={3} />
    <Line listening={false} points={[10,590,790,590]} stroke="white" strokeWidth={3} />
    <Line listening={false} points={[310,590,318,558,335,530,362,510,390,503,400,502,410,503,438,510,465,530,482,558,490,590]} stroke="white" strokeWidth={2} tension={0.3} />
    <Line listening={false} points={[155,10,155,185,645,185,645,10]} stroke="white" strokeWidth={2} />
    <Line listening={false} points={[290,10,290,65,510,65,510,10]} stroke="white" strokeWidth={2} />
    <Circle listening={false} x={400} y={130} radius={3} fill="white" />
    <Line listening={false} points={[315,185,330,215,358,238,388,250,400,253,412,250,442,238,470,215,485,185]} stroke="white" strokeWidth={2} tension={0.3} />
    <Rect listening={false} x={335} y={5} width={130} height={6} fill="white" />
  </>);
}

// ── FieldCanvas ───────────────────────────────────────────────────────────────
function FieldCanvas({ snap, fieldView }: { snap: Snap; fieldView: string }) {
  const markers = snap.markers ?? [];
  const arrows = snap.arrows ?? [];
  const objects = snap.objects ?? [];
  const labels = snap.labels ?? [];
  const numbers = snap.numbers ?? [];
  const boxes = snap.boxes ?? [];
  const shapes = snap.shapes ?? [];
  const triangles = snap.triangles ?? [];

  return (
    <Stage width={CW} height={CH}>
      <Layer>
        <Rect x={0} y={0} width={CW} height={CH}
          fillLinearGradientStartPoint={{ x: 0, y: 0 }}
          fillLinearGradientEndPoint={{ x: 0, y: CH }}
          fillLinearGradientColorStops={[0, '#166534', 0.5, '#15803d', 1, '#166534']}
        />
        {[...Array(8)].map((_, i) => (
          <Rect key={i} listening={false} x={i * 100} y={0} width={100} height={CH} fill={i % 2 === 0 ? 'rgba(0,0,0,0.06)' : 'transparent'} />
        ))}
        {fieldView === 'half' ? <FieldHalf /> : <FieldFull />}

        {objects.map(obj => (
          <Group key={obj.id} x={obj.x} y={obj.y}>
            {obj.type === 'cone' && <><Circle radius={9} fill="#EF4444" stroke="#DC2626" strokeWidth={2} /><Circle radius={4} fill="#FCA5A5" /></>}
            {obj.type === 'ball' && <><Circle radius={10} fill="white" stroke="#555" strokeWidth={1} /><Circle x={-3} y={-3} radius={3} fill="rgba(0,0,0,0.15)" /></>}
            {obj.type === 'minigoal' && (<>
              <Rect x={-20} y={-14} width={5} height={28} fill="#FFD700" />
              <Rect x={15} y={-14} width={5} height={28} fill="#FFD700" />
              <Line points={[-15,-14,15,-14]} stroke="white" strokeWidth={2} />
            </>)}
          </Group>
        ))}

        {markers.map(m => {
          const mr = m.radius ?? R;
          const fill = markerFill(m.color);
          const tc = markerText(fill);
          const fs = m.num !== undefined ? (m.num >= 10 ? mr * 0.75 : mr * 0.9) : 0;
          return (
            <Group key={m.id} x={m.x} y={m.y}>
              <Circle radius={mr} fill={fill} stroke={fill === '#FFD700' ? '#92400e' : '#555'} strokeWidth={1.5} />
              {m.num !== undefined && (
                <Text text={m.num.toString()} fontSize={fs} fontStyle="bold" fill={tc} x={-mr} y={-mr} width={mr * 2} height={mr * 2} align="center" verticalAlign="middle" />
              )}
            </Group>
          );
        })}

        {arrows.map(arr => {
          const cp1x = arr.x1 + (2/3) * (arr.cx - arr.x1);
          const cp1y = arr.y1 + (2/3) * (arr.cy - arr.y1);
          const cp2x = arr.x2 + (2/3) * (arr.cx - arr.x2);
          const cp2y = arr.y2 + (2/3) * (arr.cy - arr.y2);
          const dx = arr.x2 - arr.cx, dy = arr.y2 - arr.cy;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const hx = arr.x2 - (dx / len) * 10, hy = arr.y2 - (dy / len) * 10;
          return (
            <Group key={arr.id}>
              <Line bezier points={[arr.x1,arr.y1,cp1x,cp1y,cp2x,cp2y,arr.x2,arr.y2]} stroke="white" strokeWidth={3} dash={arr.type === 'run' ? [8,6] : undefined} />
              <KonvaArrow points={[hx,hy,arr.x2,arr.y2]} stroke="white" fill="white" strokeWidth={3} pointerLength={10} pointerWidth={8} listening={false} />
            </Group>
          );
        })}

        {labels.map(label => {
          if (label.width) {
            const numLines = Math.max(1, Math.ceil(label.text.length * 7.5 / label.width));
            const lineH = 17;
            const rectH = numLines * lineH + 10;
            return (
              <Group key={label.id} x={label.x} y={label.y}>
                <Rect x={-(label.width / 2)} y={-(rectH / 2)} width={label.width} height={rectH} fill="rgba(0,0,0,0.55)" cornerRadius={4} />
                <Text x={-(label.width / 2) + 4} y={-(rectH / 2) + 5} text={label.text} fontSize={14} fontStyle="bold" fill="white" width={label.width - 8} wrap="word" />
              </Group>
            );
          }
          const bgWidth = Math.max(label.text.length * 8 + 16, 40);
          return (
            <Group key={label.id} x={label.x} y={label.y}>
              <Rect x={-(bgWidth / 2)} y={-13} width={bgWidth} height={26} fill="rgba(0,0,0,0.55)" cornerRadius={4} />
              <Text x={-(bgWidth / 2) + 8} y={-13} width={bgWidth - 16} height={26} text={label.text} fontSize={14} fontStyle="bold" fill="white" align="center" verticalAlign="middle" />
            </Group>
          );
        })}

        {numbers.map(n => (
          <Group key={n.id} x={n.x} y={n.y}>
            <Circle radius={14} fill="rgba(0,0,0,0.7)" stroke="rgba(255,255,255,0.6)" strokeWidth={1.5} />
            <Text text={n.value.toString()} fontSize={13} fontStyle="bold" fill="white" x={-14} y={-14} width={28} height={28} align="center" verticalAlign="middle" />
          </Group>
        ))}

        {boxes.map(b => (
          <Group key={b.id} x={b.x} y={b.y}>
            <Rect x={0} y={0} width={b.width} height={b.height} fill="rgba(0,0,0,0.7)" cornerRadius={4} />
            <Text x={8} y={0} width={b.width - 16} height={b.height} text={b.text} fontSize={13} fontStyle="bold" fill="white" wrap="word" align="center" verticalAlign="middle" />
          </Group>
        ))}

        {shapes.map(s => (
          <Group key={s.id} x={s.x} y={s.y} opacity={s.opacity ?? 1}>
            {(s.shapeType === 'ellipse' || s.shapeType === 'oval') && (
              <Ellipse x={0} y={0} radiusX={s.width / 2} radiusY={s.height / 2} fill="transparent" stroke={s.color} strokeWidth={2} />
            )}
            {(s.shapeType === 'rect' || s.shapeType === 'rectangle') && (
              <Rect x={-s.width / 2} y={-s.height / 2} width={s.width} height={s.height} fill="transparent" stroke={s.color} strokeWidth={2} />
            )}
            {s.shapeType === 'circle' && (
              <Circle x={0} y={0} radius={s.width / 2} fill="transparent" stroke={s.color} strokeWidth={2} />
            )}
            {s.shapeType === 'square' && (
              <Rect x={-s.width / 2} y={-s.height / 2} width={s.width} height={s.height} fill="transparent" stroke={s.color} strokeWidth={2} />
            )}
            {s.shapeType === 'triangle' && (
              <Line points={[0, -s.height / 2, s.width / 2, s.height / 2, -s.width / 2, s.height / 2]} closed fill="transparent" stroke={s.color} strokeWidth={2} />
            )}
          </Group>
        ))}

        {triangles.map(tri => (
          <Group key={tri.id} opacity={tri.opacity ?? 1}>
            <Line points={[tri.x1, tri.y1, tri.x2, tri.y2, tri.x3, tri.y3]} closed fill="transparent" stroke={tri.color} strokeWidth={2} />
          </Group>
        ))}
      </Layer>
    </Stage>
  );
}

// ── DrillPlayer (inline, no modal) ────────────────────────────────────────────
function DrillPlayer(
  { canvasState, animationSteps, initialStep = 0, hideBar = false, onStepChange, handleRef }: DrillPlayerProps,
) {
  const allSteps: AnimStep[] = [{ canvas_state: canvasState }, ...animationSteps];
  const startIdx = Math.min(Math.max(0, initialStep), allSteps.length - 1);

  const [stepIdx, setStepIdx]           = useState(startIdx);
  const [displaySnap, setDisplaySnap]   = useState<Snap>(allSteps[startIdx].canvas_state);
  const [animating, setAnimating]       = useState(false);
  const [playing, setPlaying]           = useState(false);
  const [showAnnotation, setShowAnnotation] = useState(false);
  const [annotation, setAnnotation]     = useState('');
  const [finished, setFinished]         = useState(startIdx > 0 && startIdx === allSteps.length - 1);
  const [containerWidth, setContainerWidth] = useState(0);

  const containerRef     = useRef<HTMLDivElement>(null);
  const rafRef           = useRef<number | null>(null);
  const playingRef       = useRef(false);
  const stepTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animatingToRef   = useRef<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width;
      if (w > 0) setContainerWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
  }, []);

  const fieldView = (canvasState.fieldView || 'full') as string;
  const scale     = containerWidth > 0 ? containerWidth / CW : 0;
  const stageH    = containerWidth > 0 ? Math.round(containerWidth * CH / CW) : 0;

  function clearTimers() {
    if (stepTimerRef.current) { clearTimeout(stepTimerRef.current); stepTimerRef.current = null; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }

  // ── Auto-play: animate from fromIdx through all remaining steps ──────────
  function advanceFrom(fromIdx: number) {
    if (!playingRef.current) return;
    const next = fromIdx + 1;
    if (next >= allSteps.length) {
      setFinished(true);
      setPlaying(false);
      playingRef.current = false;
      return;
    }

    const fromSnap = allSteps[fromIdx].canvas_state;
    const toSnap   = allSteps[next].canvas_state;
    animatingToRef.current = next;
    setAnimating(true);

    const startTime = performance.now();
    function tick(now: number) {
      const rawT = Math.min((now - startTime) / ANIM_MS, 1);
      const t    = ease(rawT);
      setDisplaySnap(tweenSnap(fromSnap, toSnap, t));
      if (rawT < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        animatingToRef.current = null;
        setAnimating(false);
        setStepIdx(next);
        const ann = allSteps[next].annotation;

        if (next === allSteps.length - 1) {
          // Last step — reset to base frame
          if (ann) { setAnnotation(ann); setShowAnnotation(true); }
          setPlaying(false);
          playingRef.current = false;
          setStepIdx(0);
          setDisplaySnap(allSteps[0].canvas_state);
          setFinished(false);
        } else if (ann) {
          // Show annotation, auto-dismiss after pause, then continue
          setAnnotation(ann);
          setShowAnnotation(true);
          stepTimerRef.current = setTimeout(() => {
            setShowAnnotation(false);
            setAnnotation('');
            stepTimerRef.current = setTimeout(() => advanceFrom(next), 300);
          }, ANNOTATION_PAUSE_MS);
        } else {
          // Brief pause then next step
          stepTimerRef.current = setTimeout(() => advanceFrom(next), STEP_PAUSE_MS);
        }
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }

  function startPlay() {
    if (!hasSteps) return;
    playingRef.current = true;
    setPlaying(true);
    advanceFrom(stepIdx);
  }

  function pause() {
    clearTimers();
    playingRef.current = false;
    setPlaying(false);
    setAnimating(false);
    // If paused mid-animation, snap forward to complete the current step
    if (animatingToRef.current !== null) {
      const completedStep = animatingToRef.current;
      setStepIdx(completedStep);
      setDisplaySnap(allSteps[completedStep].canvas_state);
      animatingToRef.current = null;
    }
  }

  function stepBack() {
    if (stepIdx === 0) return;
    clearTimers();
    playingRef.current = false;
    animatingToRef.current = null;
    setPlaying(false);
    setAnimating(false);
    const newIdx = stepIdx - 1;
    setStepIdx(newIdx);
    setDisplaySnap(allSteps[newIdx].canvas_state);
    setFinished(false);
    setShowAnnotation(false);
    setAnnotation('');
  }

  function stepForward() {
    if (stepIdx >= allSteps.length - 1) return;
    clearTimers();
    playingRef.current = false;
    animatingToRef.current = null;
    setPlaying(false);
    setAnimating(false);
    const newIdx = stepIdx + 1;
    setStepIdx(newIdx);
    setDisplaySnap(allSteps[newIdx].canvas_state);
    if (newIdx === allSteps.length - 1) setFinished(true);
    setShowAnnotation(false);
    setAnnotation('');
  }

  function restart() {
    clearTimers();
    playingRef.current = false;
    animatingToRef.current = null;
    setPlaying(false);
    setStepIdx(0);
    setDisplaySnap(canvasState);
    setAnimating(false);
    setShowAnnotation(false);
    setAnnotation('');
    setFinished(false);
  }

  const hasSteps = allSteps.length > 1;

  // Populate handleRef on every render so parent always has fresh function references
  if (handleRef) handleRef.current = { stepBack, stepForward, startPlay, pause, restart };

  // Notify parent when step/playback state changes so an external control bar can sync
  useEffect(() => {
    onStepChange?.(stepIdx, allSteps.length, playing, finished);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx, allSteps.length, playing, finished]);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-700 bg-gray-900">
      {/* Progress header */}
      {!hideBar && (
      <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-950 border-b border-gray-800">
        {/* Prev step arrow — only when paused/not started */}
        {hasSteps && !playing && !finished && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); stepBack(); }}
            disabled={stepIdx === 0}
            aria-label="Previous step"
            className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-white disabled:opacity-20 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        )}
        {/* Play / Pause / Restart */}
        {hasSteps && (
          finished ? (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); restart(); }}
              aria-label="Restart"
              className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md bg-gray-800 hover:bg-gray-700 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5 text-gray-400" />
            </button>
          ) : playing ? (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); pause(); }}
              aria-label="Pause"
              className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md bg-gray-800 hover:bg-gray-700 transition-colors"
            >
              <Pause className="w-3.5 h-3.5 text-yellow-400 fill-current" />
            </button>
          ) : (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); startPlay(); }}
              aria-label="Play"
              className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md bg-yellow-400 hover:bg-yellow-300 transition-colors"
            >
              <Play className="w-3.5 h-3.5 text-black fill-current" />
            </button>
          )
        )}
        {/* Next step arrow — only when paused/not started */}
        {hasSteps && !playing && !finished && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); stepForward(); }}
            disabled={stepIdx >= allSteps.length - 1}
            aria-label="Next step"
            className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-white disabled:opacity-20 transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
        {/* Step dots + counter */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0 ml-1">
          {allSteps.map((_, i) => (
            <div key={i} className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors duration-200 ${i <= stepIdx ? 'bg-yellow-400' : 'bg-gray-700'}`} />
          ))}
          <span className="ml-1 text-[10px] text-gray-600 font-mono">{stepIdx + 1}/{allSteps.length}</span>
        </div>
      </div>
      )}

      {/* Canvas (controls overlaid at top) */}
      <div ref={containerRef} className="relative w-full">
        {containerWidth > 0 && stageH > 0 ? (
          <div style={{ width: '100%', height: stageH, position: 'relative', overflow: 'hidden' }}>
            <div style={{ width: CW, height: CH, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}>
              <FieldCanvas snap={displaySnap} fieldView={fieldView} />
            </div>

            {/* Annotation overlay */}
            {showAnnotation && (
              <div
                className="absolute inset-0 flex items-center justify-center z-10"
                style={{ background: 'rgba(0,0,0,0.72)' }}
                onClick={() => setShowAnnotation(false)}
              >
                <div className="mx-4 bg-gray-900 border border-gray-700 rounded-xl p-5 text-center max-w-xs">
                  <p className="text-white text-sm font-bold leading-relaxed">{annotation}</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Placeholder while measuring container */
          <div style={{ width: '100%', paddingBottom: '75%' }} />
        )}
      </div>
    </div>
  );
}

export default DrillPlayer;
