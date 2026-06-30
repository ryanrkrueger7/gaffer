'use client';

import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Stage, Layer, Rect, Circle, Line, Text, Arrow as KonvaArrow, Group, Ellipse } from 'react-konva';
import { MousePointer2, Brush, Eraser, RotateCcw, Trash2 } from 'lucide-react';

// ── Constants ────────────────────────────────────────────────────────────────
const W = 800, H = 600, MAX_HIST = 20;

function uid() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

async function stageToPNG(stage: any): Promise<Blob> {
  const dataURL = stage.toDataURL({ mimeType: 'image/png', quality: 1 });
  const res = await fetch(dataURL);
  const blob = await res.blob();
  return blob;
}

// ── Helper functions ─────────────────────────────────────────────────────────
function markerDisplayFill(color: string): string {
  if (color === 'yellow') return '#FFD700';
  if (color === 'black') return '#1a1a1a';
  return color;
}
function markerTextContrast(fill: string): string {
  const hex = fill.startsWith('#') ? fill : (fill === 'yellow' ? '#FFD700' : '#1a1a1a');
  const r = parseInt(hex.slice(1,3), 16), g = parseInt(hex.slice(3,5), 16), b = parseInt(hex.slice(5,7), 16);
  return (0.299*r + 0.587*g + 0.114*b)/255 > 0.55 ? '#000000' : '#FFFFFF';
}

// ── Types ────────────────────────────────────────────────────────────────────
interface Marker    { id: string; color: string; x: number; y: number; num?: number; radius?: number; opacity?: number; }
// cx,cy = quadratic bezier control point; equals midpoint for a straight arrow
interface Arrow     { id: string; type: 'run' | 'pass' | 'line'; x1: number; y1: number; x2: number; y2: number; cx: number; cy: number; opacity?: number; }
interface Obj       { id: string; type: 'cone' | 'minigoal' | 'ball'; x: number; y: number; opacity?: number; }
interface LabelNode { id: string; type: 'label'; x: number; y: number; text: string; color: 'white'; width?: number; opacity?: number; }
interface NumberNode { id: string; type: 'number'; x: number; y: number; value: number; opacity?: number; }
interface BoxNode   { id: string; type: 'box'; x: number; y: number; width: number; height: number; text: string; opacity?: number; }
interface ShapeNode { id: string; shapeType: 'ellipse' | 'rect' | 'circle' | 'oval' | 'square' | 'rectangle' | 'triangle'; x: number; y: number; width: number; height: number; color: string; opacity?: number; }
interface TriangleNode { id: string; x1: number; y1: number; x2: number; y2: number; x3: number; y3: number; color: string; opacity?: number; }
type Snap = { markers: Marker[]; arrows: Arrow[]; objects: Obj[]; labels: LabelNode[]; numbers: NumberNode[]; boxes?: BoxNode[]; shapes?: ShapeNode[]; triangles?: TriangleNode[]; fieldView?: string };
type Mode = 'select' | 'draw';
type DrawTool = 'marker-yellow' | 'marker-black' | 'arrow-run' | 'arrow-pass' | 'arrow-line' | 'label' | 'number' | 'textbox' | 'cone' | 'ball' | 'goal' | 'shape';

// ── Formation presets (full field 800×600) ────────────────────────────────────
const FORMATIONS: Record<string, { x: number; y: number }[]> = {
  '4-3-3':   [
    {x:400,y:540},
    {x:150,y:450},{x:300,y:455},{x:500,y:455},{x:650,y:450},
    {x:250,y:320},{x:400,y:305},{x:550,y:320},
    {x:150,y:180},{x:400,y:160},{x:650,y:180},
  ],
  '4-4-2':   [
    {x:400,y:540},
    {x:150,y:450},{x:300,y:455},{x:500,y:455},{x:650,y:450},
    {x:120,y:300},{x:290,y:285},{x:510,y:285},{x:680,y:300},
    {x:300,y:155},{x:500,y:155},
  ],
  '3-5-2':   [
    {x:400,y:540},
    {x:220,y:455},{x:400,y:460},{x:580,y:455},
    {x:120,y:330},{x:255,y:295},{x:400,y:280},{x:545,y:295},{x:680,y:330},
    {x:300,y:155},{x:500,y:155},
  ],
  '5-3-2':   [
    {x:400,y:540},
    {x:100,y:435},{x:230,y:460},{x:400,y:465},{x:570,y:460},{x:700,y:435},
    {x:235,y:300},{x:400,y:285},{x:565,y:300},
    {x:290,y:155},{x:510,y:155},
  ],
  '3-4-3':   [
    {x:400,y:540},
    {x:235,y:455},{x:400,y:460},{x:565,y:455},
    {x:135,y:315},{x:285,y:295},{x:515,y:295},{x:665,y:315},
    {x:160,y:165},{x:400,y:150},{x:640,y:165},
  ],
  '4-1-4-1': [
    {x:400,y:540},
    {x:150,y:450},{x:300,y:455},{x:500,y:455},{x:650,y:450},
    {x:400,y:360},
    {x:150,y:255},{x:300,y:245},{x:500,y:245},{x:650,y:255},
    {x:400,y:145},
  ],
};

// ── Tween helpers (play mode) ─────────────────────────────────────────────────
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function easeInOut(t: number) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
function tweenSnap(from: Snap, to: Snap, t: number): Snap {
  const fromM = from.markers ?? [], toM = to.markers ?? [];
  const markers: Marker[] = [
    ...fromM.map(m => { const tM = toM.find(x => x.id === m.id); return tM ? { ...m, x: lerp(m.x, tM.x, t), y: lerp(m.y, tM.y, t), opacity: 1 } : { ...m, opacity: 1 - t }; }),
    ...toM.filter(tM => !fromM.find(m => m.id === tM.id)).map(tM => ({ ...tM, opacity: t })),
  ];
  const fromO = from.objects ?? [], toO = to.objects ?? [];
  const objects: Obj[] = [
    ...fromO.map(o => { const tO = toO.find(x => x.id === o.id); return tO ? { ...o, x: lerp(o.x, tO.x, t), y: lerp(o.y, tO.y, t), opacity: 1 } : { ...o, opacity: 1 - t }; }),
    ...toO.filter(tO => !fromO.find(o => o.id === tO.id)).map(tO => ({ ...tO, opacity: t })),
  ];
  const fromL = from.labels ?? [], toL = to.labels ?? [];
  const labels: LabelNode[] = [
    ...fromL.map(l => { const tL = toL.find(x => x.id === l.id); return tL ? { ...l, x: lerp(l.x, tL.x, t), y: lerp(l.y, tL.y, t), opacity: 1 } : { ...l, opacity: 1 - t }; }),
    ...toL.filter(tL => !fromL.find(l => l.id === tL.id)).map(tL => ({ ...tL, opacity: t })),
  ];
  const fromN = from.numbers ?? [], toN = to.numbers ?? [];
  const numbers: NumberNode[] = [
    ...fromN.map(n => { const tN = toN.find(x => x.id === n.id); return tN ? { ...n, x: lerp(n.x, tN.x, t), y: lerp(n.y, tN.y, t), opacity: 1 } : { ...n, opacity: 1 - t }; }),
    ...toN.filter(tN => !fromN.find(n => n.id === tN.id)).map(tN => ({ ...tN, opacity: t })),
  ];
  const fromB = from.boxes ?? [], toB = to.boxes ?? [];
  const boxes: BoxNode[] = [
    ...fromB.map(b => { const tB = toB.find(x => x.id === b.id); return tB ? { ...b, x: lerp(b.x, tB.x, t), y: lerp(b.y, tB.y, t), opacity: 1 } : { ...b, opacity: 1 - t }; }),
    ...toB.filter(tB => !fromB.find(b => b.id === tB.id)).map(tB => ({ ...tB, opacity: t })),
  ];
  const fromA = from.arrows ?? [], toA = to.arrows ?? [];
  const arrows: Arrow[] = [
    ...fromA.map(a => { const tA = toA.find(x => x.id === a.id); return tA ? { ...a, x1: lerp(a.x1, tA.x1, t), y1: lerp(a.y1, tA.y1, t), x2: lerp(a.x2, tA.x2, t), y2: lerp(a.y2, tA.y2, t), cx: lerp(a.cx, tA.cx, t), cy: lerp(a.cy, tA.cy, t), opacity: 1 } : { ...a, opacity: 1 - t }; }),
    ...toA.filter(tA => !fromA.find(a => a.id === tA.id)).map(tA => ({ ...tA, opacity: t })),
  ];
  const fromS = from.shapes ?? [], toS = to.shapes ?? [];
  const shapes: ShapeNode[] = [
    ...fromS.map(s => { const tS = toS.find(x => x.id === s.id); return tS ? { ...s, x: lerp(s.x, tS.x, t), y: lerp(s.y, tS.y, t), opacity: 1 } : { ...s, opacity: 1 - t }; }),
    ...toS.filter(tS => !fromS.find(s => s.id === tS.id)).map(tS => ({ ...tS, opacity: t })),
  ];
  const fromTri = from.triangles ?? [], toTri = to.triangles ?? [];
  const triangles: TriangleNode[] = [
    ...fromTri.map(tri => { const tT = toTri.find(x => x.id === tri.id); return tT ? { ...tri, opacity: 1 } : { ...tri, opacity: 1 - t }; }),
    ...toTri.filter(tT => !fromTri.find(tri => tri.id === tT.id)).map(tT => ({ ...tT, opacity: t })),
  ];
  return { ...to, markers, objects, labels, numbers, boxes, arrows, shapes, triangles };
}

// ── Imperative handle ─────────────────────────────────────────────────────────
export interface WhiteboardHandle {
  saveDiagram(): Promise<{ blob: Blob; preview: string }>;
  getCanvasState(): { markers: Marker[]; arrows: Arrow[]; objects: Obj[]; labels: LabelNode[]; numbers: NumberNode[]; boxes: BoxNode[]; shapes: ShapeNode[]; triangles: TriangleNode[]; fieldView: string };
  getPreview(): string | null;
  resetState(snap: Snap & { fieldView?: string }): void;
  setSelectMode(): void;
}

// ── Component ────────────────────────────────────────────────────────────────
const TacticalWhiteboard = forwardRef<WhiteboardHandle, {
  onChange?: (hasContent: boolean) => void;
  initialView?: 'full' | 'half' | 'blank';
  embedded?: boolean;
  readOnly?: boolean;
  initialFormation?: string;
  initialMarkerColor?: 'yellow' | 'black';
  hideColorToggle?: boolean;
  hideFormationPresets?: boolean;
  hideObjects?: boolean;
  initialState?: Snap & { fieldView?: string };
  /** 'edit' = normal editing, 'record' = editing with red indicator, 'play' = animated playback (readOnly) */
  mode?: 'edit' | 'record' | 'play';
  animationSteps?: { canvas_state: Snap; annotation?: string }[];
  currentStep?: number;
}>(function TacticalWhiteboard({
  onChange,
  initialView = 'full',
  embedded = false,
  readOnly = false,
  initialFormation,
  initialMarkerColor = 'black',
  hideColorToggle = false,
  hideObjects = false,
  initialState,
  mode = 'edit',
  animationSteps,
  currentStep,
}, ref) {
  const stageRef          = useRef<any>(null);
  const histRef           = useRef<Snap[]>([]);
  const mRef              = useRef<Marker[]>([]);
  const aRef              = useRef<Arrow[]>([]);
  const oRef              = useRef<Obj[]>([]);
  const lRef              = useRef<LabelNode[]>([]);
  const nRef              = useRef<NumberNode[]>([]);
  const bRef              = useRef<BoxNode[]>([]);
  const sRef              = useRef<ShapeNode[]>([]);
  const tRef              = useRef<TriangleNode[]>([]);
  const selectedIdsRef    = useRef<string[]>([]);
  const dragPrevRef        = useRef<{ x: number; y: number } | null>(null);
  const nodeRefs           = useRef<Map<string, any>>(new Map());

  const [view, setView]         = useState<'full' | 'half' | 'blank'>(initialView);
  const [toolMode, setToolMode] = useState<Mode>('draw');
  const [activeDrawTool, setActiveDrawTool] = useState<DrawTool>('marker-yellow');
  const [markers, setMarkers]   = useState<Marker[]>([]);
  const [arrows, setArrows]     = useState<Arrow[]>([]);
  const [objects, setObjects]   = useState<Obj[]>([]);
  const [labels, setLabels]     = useState<LabelNode[]>([]);
  const [numbers, setNumbers]   = useState<NumberNode[]>([]);
  const [boxes, setBoxes]       = useState<BoxNode[]>([]);
  const [shapes, setShapes]     = useState<ShapeNode[]>([]);
  const [triangles, setTriangles] = useState<TriangleNode[]>([]);
  const [triP1, setTriP1]       = useState<{ x: number; y: number } | null>(null);
  const [triP2, setTriP2]       = useState<{ x: number; y: number } | null>(null);
  const [aStart, setAStart]     = useState<{ x: number; y: number } | null>(null);
  const [eraseConfirm, setEraseConfirm] = useState(false);
  const [markerSize, setMarkerSize] = useState(15);
  const [markerFillColor, setMarkerFillColor] = useState('#1a1a1a');

  // Align tool
  const [alignMode, setAlignMode]       = useState<null | 'h' | 'v'>(null);
  const [alignRefId, setAlignRefId]     = useState<string | null>(null);
  const [alignTargetIds, setAlignTargetIds] = useState<string[]>([]);

  // Multi-select
  const [multiMode, setMultiMode]         = useState(false);
  const [selectedIds, setSelectedIds]     = useState<string[]>([]);

  // Formation / shape flyouts
  const [activeFormation, setActiveFormation]       = useState<string | null>(null);
  const [showFormationFlyout, setShowFormationFlyout] = useState(false);
  const [showShapeFlyout, setShowShapeFlyout]         = useState(false);
  const [pendingShapeType, setPendingShapeType]       = useState<'ellipse' | 'rect' | 'triangle' | 'line'>('ellipse');

  // Inline number editor for markers
  const [editNumMarkerId, setEditNumMarkerId] = useState<string | null>(null);
  const [editNumValue, setEditNumValue]       = useState('');
  const [editNumPos, setEditNumPos]           = useState<{ x: number; y: number } | null>(null);

  // Pending text placement (label/number/textbox tool click on canvas)
  const [pendingTextTool, setPendingTextTool]   = useState<'label' | 'number' | 'textbox' | null>(null);
  const [pendingTextPos, setPendingTextPos]     = useState<{ cx: number; cy: number; sx: number; sy: number } | null>(null);
  const [pendingTextValue, setPendingTextValue] = useState('');
  const [pendingLabelWide, setPendingLabelWide] = useState(true);

  // Edit overlay for dblclick on existing label/number
  const [editTextId, setEditTextId]     = useState<string | null>(null);
  const [editTextType, setEditTextType] = useState<'label' | 'number' | null>(null);
  const [editTextValue, setEditTextValue] = useState('');
  const [editTextPos, setEditTextPos]   = useState<{ x: number; y: number } | null>(null);

  // Dblclick-to-edit existing box state
  const [editingBoxId, setEditingBoxId]   = useState<string | null>(null);
  const [editingBoxData, setEditingBoxData] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // Play mode animation state
  const [displaySnap, setDisplaySnap] = useState<Snap | null>(null);
  const tweenRAF = useRef<number | null>(null);
  const prevDisplayRef = useRef<Snap | null>(null);

  // Dynamic marker radius based on field view
  const R = view === 'full' ? 22 : 17;

  // Derived values from activeDrawTool
  const markerColor: 'yellow' | 'black' = activeDrawTool === 'marker-black' ? 'black' : 'yellow';
  const arrowType: 'run' | 'pass' | 'line' = activeDrawTool === 'arrow-line' ? 'line' : activeDrawTool === 'arrow-pass' ? 'pass' : 'run';
  const objType: 'cone' | 'minigoal' | 'ball' =
    activeDrawTool === 'ball' ? 'ball' :
    activeDrawTool === 'goal' ? 'minigoal' : 'cone';

  // Restore from saved state on mount
  useEffect(() => {
    if (initialState) {
      if (initialState.fieldView) setView(initialState.fieldView as 'full' | 'half' | 'blank');
      setMarkers(initialState.markers ?? []);
      setArrows(initialState.arrows ?? []);
      setObjects(initialState.objects ?? []);
      setLabels(initialState.labels ?? []);
      setNumbers(initialState.numbers ?? []);
      setBoxes(initialState.boxes ?? []);
      setShapes(initialState.shapes ?? []);
      setTriangles(initialState.triangles ?? []);
      return;
    }
    if (initialFormation) {
      const pos = FORMATIONS[initialFormation];
      if (pos) {
        const color = initialMarkerColor ?? 'yellow';
        setMarkers(pos.map(p => ({ id: uid(), color, x: p.x, y: p.y })));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep refs current with latest state
  useEffect(() => { mRef.current = markers; }, [markers]);
  useEffect(() => { aRef.current = arrows; },  [arrows]);
  useEffect(() => { oRef.current = objects; }, [objects]);
  useEffect(() => { lRef.current = labels; },  [labels]);
  useEffect(() => { nRef.current = numbers; }, [numbers]);
  useEffect(() => { bRef.current = boxes; },   [boxes]);
  useEffect(() => { sRef.current = shapes; },  [shapes]);
  useEffect(() => { tRef.current = triangles; }, [triangles]);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);

  // Notify parent when canvas content changes
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });
  useEffect(() => {
    onChangeRef.current?.(markers.length > 0 || arrows.length > 0 || objects.length > 0 || labels.length > 0 || numbers.length > 0 || boxes.length > 0 || shapes.length > 0 || triangles.length > 0);
  }, [markers, arrows, objects, labels, numbers, boxes, shapes, triangles]);

  function snap() {
    histRef.current = [
      ...histRef.current.slice(-(MAX_HIST - 1)),
      {
        markers:   [...mRef.current],
        arrows:    [...aRef.current],
        objects:   [...oRef.current],
        labels:    [...lRef.current],
        numbers:   [...nRef.current],
        boxes:     [...bRef.current],
        shapes:    [...sRef.current],
        triangles: [...tRef.current],
      },
    ];
  }

  const undo = useCallback(() => {
    if (!histRef.current.length) return;
    const prev = histRef.current[histRef.current.length - 1];
    histRef.current = histRef.current.slice(0, -1);
    setMarkers(prev.markers);
    setArrows(prev.arrows);
    setObjects(prev.objects);
    setLabels(prev.labels);
    setNumbers(prev.numbers);
    setBoxes(prev.boxes ?? []);
    setShapes(prev.shapes ?? []);
    setTriangles(prev.triangles ?? []);
    setSelectedIds([]);
    setAStart(null);
    setTriP1(null);
    setTriP2(null);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
      if (e.key === 'Shift') setMultiMode(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setMultiMode(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); };
  }, [undo]);

  // Play mode: tween between animation steps
  useEffect(() => {
    if (mode !== 'play') {
      setDisplaySnap(null);
      prevDisplayRef.current = null;
      if (tweenRAF.current) { cancelAnimationFrame(tweenRAF.current); tweenRAF.current = null; }
      return;
    }
    if (currentStep === undefined || !animationSteps) return;
    if (tweenRAF.current) cancelAnimationFrame(tweenRAF.current);

    const baseSnap: Snap = { markers: mRef.current, arrows: aRef.current, objects: oRef.current, labels: lRef.current, numbers: nRef.current, boxes: bRef.current, shapes: sRef.current, triangles: tRef.current };
    const targetSnap: Snap = currentStep === 0 ? baseSnap : (animationSteps[currentStep - 1]?.canvas_state ?? baseSnap);
    const fromSnap: Snap = prevDisplayRef.current ?? baseSnap;

    const startTime = performance.now();
    const ANIM_MS = 700;
    function frame(now: number) {
      const t = Math.min((now - startTime) / ANIM_MS, 1);
      const snapped = tweenSnap(fromSnap, targetSnap, easeInOut(t));
      setDisplaySnap(snapped);
      if (t < 1) { tweenRAF.current = requestAnimationFrame(frame); }
      else { setDisplaySnap(targetSnap); prevDisplayRef.current = targetSnap; }
    }
    tweenRAF.current = requestAnimationFrame(frame);
    return () => { if (tweenRAF.current) cancelAnimationFrame(tweenRAF.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, mode]);

  // Formation preset
  function applyFormation(key: string) {
    const pos = FORMATIONS[key];
    if (!pos) return;
    snap();
    const currentFill = markerFillColor;
    const keepNonCurrent = mRef.current.filter(m => {
      const mFill = markerDisplayFill(m.color);
      return mFill !== currentFill;
    });
    setMarkers([
      ...keepNonCurrent,
      ...pos.map(p => ({ id: uid(), color: markerFillColor, x: p.x, y: p.y, radius: markerSize })),
    ]);
    setActiveFormation(key);
  }

  // ── Align helpers ─────────────────────────────────────────────────────────
  function findNodePos(id: string): { x: number; y: number } | null {
    const m = mRef.current.find(n => n.id === id); if (m) return { x: m.x, y: m.y };
    const o = oRef.current.find(n => n.id === id); if (o) return { x: o.x, y: o.y };
    const l = lRef.current.find(n => n.id === id); if (l) return { x: l.x, y: l.y };
    const n = nRef.current.find(n => n.id === id); if (n) return { x: n.x, y: n.y };
    const b = bRef.current.find(n => n.id === id); if (b) return { x: b.x, y: b.y };
    const s = sRef.current.find(n => n.id === id); if (s) return { x: s.x, y: s.y };
    return null;
  }

  function finalizeAlignment() {
    if (!alignRefId || !alignMode || alignTargetIds.length === 0) {
      setAlignMode(null); setAlignRefId(null); setAlignTargetIds([]);
      return;
    }
    const refPos = findNodePos(alignRefId);
    if (!refPos) { setAlignMode(null); setAlignRefId(null); setAlignTargetIds([]); return; }
    snap();
    const targets = new Set(alignTargetIds);
    if (alignMode === 'h') {
      setMarkers(p => p.map(m => targets.has(m.id) ? { ...m, y: refPos.y } : m));
      setObjects(p => p.map(o => targets.has(o.id) ? { ...o, y: refPos.y } : o));
      setLabels(p => p.map(l => targets.has(l.id) ? { ...l, y: refPos.y } : l));
      setNumbers(p => p.map(n => targets.has(n.id) ? { ...n, y: refPos.y } : n));
      setBoxes(p => p.map(b => targets.has(b.id) ? { ...b, y: refPos.y } : b));
      setShapes(p => p.map(s => targets.has(s.id) ? { ...s, y: refPos.y } : s));
    } else {
      setMarkers(p => p.map(m => targets.has(m.id) ? { ...m, x: refPos.x } : m));
      setObjects(p => p.map(o => targets.has(o.id) ? { ...o, x: refPos.x } : o));
      setLabels(p => p.map(l => targets.has(l.id) ? { ...l, x: refPos.x } : l));
      setNumbers(p => p.map(n => targets.has(n.id) ? { ...n, x: refPos.x } : n));
      setBoxes(p => p.map(b => targets.has(b.id) ? { ...b, x: refPos.x } : b));
      setShapes(p => p.map(s => targets.has(s.id) ? { ...s, x: refPos.x } : s));
    }
    setAlignMode(null); setAlignRefId(null); setAlignTargetIds([]);
  }

  function toggleAlignMode(dir: 'h' | 'v') {
    if (alignMode === dir) {
      setAlignMode(null); setAlignRefId(null); setAlignTargetIds([]);
    } else {
      setAlignMode(dir); setAlignRefId(null); setAlignTargetIds([]);
      setToolMode('select');
    }
  }

  // ── Multi-select drag helpers ──────────────────────────────────────────────
  function handleMultiDragMove(draggedId: string, e: any) {
    if (selectedIdsRef.current.length <= 1 || !selectedIdsRef.current.includes(draggedId) || !dragPrevRef.current) return;
    const dx = e.target.x() - dragPrevRef.current.x;
    const dy = e.target.y() - dragPrevRef.current.y;
    dragPrevRef.current = { x: e.target.x(), y: e.target.y() };
    for (const sid of selectedIdsRef.current) {
      if (sid !== draggedId) {
        const node = nodeRefs.current.get(sid);
        if (node) { node.x(node.x() + dx); node.y(node.y() + dy); }
      }
    }
  }

  function handleMultiDragEnd() {
    const updates: Record<string, { x: number; y: number }> = {};
    for (const sid of selectedIdsRef.current) {
      const node = nodeRefs.current.get(sid);
      if (node) updates[sid] = { x: node.x(), y: node.y() };
    }
    snap();
    setMarkers(p => p.map(m => updates[m.id] ? { ...m, x: updates[m.id].x, y: updates[m.id].y } : m));
    setObjects(p => p.map(o => updates[o.id] ? { ...o, x: updates[o.id].x, y: updates[o.id].y } : o));
    setLabels(p => p.map(l => updates[l.id] ? { ...l, x: updates[l.id].x, y: updates[l.id].y } : l));
    setNumbers(p => p.map(n => updates[n.id] ? { ...n, x: updates[n.id].x, y: updates[n.id].y } : n));
    setBoxes(p => p.map(b => updates[b.id] ? { ...b, x: updates[b.id].x, y: updates[b.id].y } : b));
    setShapes(p => p.map(s => updates[s.id] ? { ...s, x: updates[s.id].x, y: updates[s.id].y } : s));
    dragPrevRef.current = null;
  }

  // ── Canvas click ──────────────────────────────────────────────────────────
  function handleStageClick(e: any) {
    if (e.target !== e.target.getStage()) return;
    const pos = e.target.getStage().getPointerPosition();
    if (!pos) return;

    if (toolMode === 'select') {
      if (alignMode) { setAlignMode(null); setAlignRefId(null); setAlignTargetIds([]); }
      setSelectedIds([]);
      return;
    }

    // Draw mode
    if (activeDrawTool === 'marker-yellow' || activeDrawTool === 'marker-black') {
      snap();
      setMarkers(p => [...p, { id: uid(), color: markerFillColor, x: pos.x, y: pos.y, radius: markerSize }]);
      return;
    }

    if (activeDrawTool === 'cone' || activeDrawTool === 'ball' || activeDrawTool === 'goal') {
      snap();
      setObjects(p => [...p, { id: uid(), type: objType, x: pos.x, y: pos.y }]);
      return;
    }

    if (activeDrawTool === 'arrow-run' || activeDrawTool === 'arrow-pass' || activeDrawTool === 'arrow-line') {
      if (!aStart) {
        setAStart(pos);
      } else {
        snap();
        setArrows(p => [...p, { id: uid(), type: arrowType, x1: aStart.x, y1: aStart.y, x2: pos.x, y2: pos.y, cx: (aStart.x + pos.x) / 2, cy: (aStart.y + pos.y) / 2 }]);
        setAStart(null);
      }
      return;
    }

    if (activeDrawTool === 'number' || activeDrawTool === 'textbox') {
      // Fix: if a pending text tool is active, commit it instead of spawning a new one
      if (pendingTextTool !== null) {
        commitPendingText();
        return;
      }
      const stage = e.target.getStage();
      const rect = stage.container().getBoundingClientRect();
      setPendingTextTool(activeDrawTool);
      setPendingTextPos({ cx: pos.x, cy: pos.y, sx: rect.left + pos.x, sy: rect.top + pos.y });
      setPendingTextValue('');
      return;
    }

    if (activeDrawTool === 'shape') {
      if (pendingShapeType === 'ellipse' || pendingShapeType === 'rect') {
        snap();
        setShapes(p => [...p, { id: uid(), shapeType: pendingShapeType, x: pos.x, y: pos.y, width: 100, height: 80, color: '#FFFFFF' }]);
        return;
      }
      if (pendingShapeType === 'line') {
        if (!aStart) { setAStart(pos); }
        else { snap(); setArrows(p => [...p, { id: uid(), type: 'line', x1: aStart.x, y1: aStart.y, x2: pos.x, y2: pos.y, cx: (aStart.x + pos.x) / 2, cy: (aStart.y + pos.y) / 2 }]); setAStart(null); }
        return;
      }
      if (pendingShapeType === 'triangle') {
        if (!triP1) { setTriP1(pos); }
        else if (!triP2) { setTriP2(pos); }
        else { snap(); setTriangles(p => [...p, { id: uid(), x1: triP1.x, y1: triP1.y, x2: triP2.x, y2: triP2.y, x3: pos.x, y3: pos.y, color: '#FFFFFF' }]); setTriP1(null); setTriP2(null); }
        return;
      }
    }
  }

  // Click on an existing element
  function onEl(id: string, e: any) {
    e.cancelBubble = true;

    // Align mode: first click = ref, subsequent = toggle targets
    if (alignMode) {
      if (alignRefId === null) {
        setAlignRefId(id);
      } else if (id !== alignRefId) {
        setAlignTargetIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
      }
      return;
    }

    if (toolMode === 'select') {
      if (multiMode) {
        setSelectedIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
      } else {
        setSelectedIds([id]);
      }
      return;
    }

    // Draw mode — arrow tools continue from click position
    if (activeDrawTool === 'arrow-run' || activeDrawTool === 'arrow-pass' || activeDrawTool === 'arrow-line') {
      const pos = e.target.getStage().getPointerPosition();
      if (!aStart) { setAStart(pos); }
      else {
        snap();
        setArrows(p => [...p, { id: uid(), type: arrowType, x1: aStart.x, y1: aStart.y, x2: pos.x, y2: pos.y, cx: (aStart.x + pos.x) / 2, cy: (aStart.y + pos.y) / 2 }]);
        setAStart(null);
      }
    }
    if (activeDrawTool === 'shape' && pendingShapeType === 'line') {
      const pos = e.target.getStage().getPointerPosition();
      if (!aStart) { setAStart(pos); }
      else { snap(); setArrows(p => [...p, { id: uid(), type: 'line', x1: aStart.x, y1: aStart.y, x2: pos.x, y2: pos.y, cx: (aStart.x + pos.x) / 2, cy: (aStart.y + pos.y) / 2 }]); setAStart(null); }
    }
    if (activeDrawTool === 'shape' && pendingShapeType === 'triangle') {
      const pos = e.target.getStage().getPointerPosition();
      if (!triP1) { setTriP1(pos); }
      else if (!triP2) { setTriP2(pos); }
      else { snap(); setTriangles(p => [...p, { id: uid(), x1: triP1.x, y1: triP1.y, x2: triP2.x, y2: triP2.y, x3: pos.x, y3: pos.y, color: '#FFFFFF' }]); setTriP1(null); setTriP2(null); }
    }
  }

  // Double-click on any element — finalize alignment if active, else run defaultBehavior
  function handleDblClick(id: string, e: any, defaultBehavior?: () => void) {
    e.cancelBubble = true;
    if (alignMode && alignRefId !== null) {
      finalizeAlignment();
      return;
    }
    if (defaultBehavior) defaultBehavior();
  }

  // Double-click a marker → inline number editor
  function handleMarkerDblClick(m: Marker, e: any) {
    if (!stageRef.current) return;
    const rect = stageRef.current.container().getBoundingClientRect();
    setEditNumMarkerId(m.id);
    setEditNumValue(m.num !== undefined ? String(m.num) : '');
    setEditNumPos({ x: rect.left + m.x, y: rect.top + m.y });
  }

  function confirmEditNum() {
    if (!editNumMarkerId) return;
    const n = parseInt(editNumValue);
    const valid = editNumValue.trim() !== '' && !isNaN(n) && n >= 0 && n <= 99;
    setMarkers(p => p.map(mk =>
      mk.id === editNumMarkerId ? { ...mk, num: valid ? n : undefined } : mk
    ));
    setEditNumMarkerId(null);
    setEditNumValue('');
    setEditNumPos(null);
  }

  // ── Label/Number/Box placement ────────────────────────────────────────────
  function commitPendingText() {
    if (!pendingTextPos) { setPendingTextTool(null); return; }
    if (pendingTextTool === 'textbox') {
      snap();
      if (editingBoxId && editingBoxData) {
        setBoxes(p => [...p, { id: uid(), type: 'box', x: editingBoxData.x, y: editingBoxData.y, width: editingBoxData.width, height: editingBoxData.height, text: pendingTextValue.trim() }]);
        setEditingBoxId(null);
        setEditingBoxData(null);
      } else {
        const text = pendingTextValue.trim();
        const words = text.split(/\s+/);
        const longestWord = Math.max(...words.map((w: string) => w.length), 1);
        const minW = longestWord * 8 + 24;
        const rawW = text.length <= 20 ? text.length * 8 + 24 : Math.round(Math.sqrt(text.length) * 22 + 24);
        const boxW = Math.max(minW, Math.min(rawW, 280));
        const boxH = Math.ceil((text.length * 8) / boxW) * 22 + 20;
        setBoxes(p => [...p, { id: uid(), type: 'box', x: pendingTextPos.cx - boxW / 2, y: pendingTextPos.cy - boxH / 2, width: boxW, height: boxH, text }]);
      }
      setPendingTextPos(null); setPendingTextTool(null); setPendingTextValue('');
      return;
    }
    if (!pendingTextValue.trim()) {
      setPendingTextPos(null); setPendingTextTool(null); return;
    }
    snap();
    if (pendingTextTool === 'number') {
      const n = parseInt(pendingTextValue);
      if (!isNaN(n) && n >= 0 && n <= 99) {
        setNumbers(p => [...p, { id: uid(), type: 'number', x: pendingTextPos.cx, y: pendingTextPos.cy, value: n }]);
      }
    }
    setPendingTextPos(null); setPendingTextTool(null); setPendingTextValue('');
  }

  // Double-click label/number → edit overlay
  function openEditText(id: string, type: 'label' | 'number', currentValue: string, e: any) {
    if (!stageRef.current) return;
    const node = type === 'label' ? lRef.current.find(l => l.id === id) : nRef.current.find(n => n.id === id);
    if (!node) return;
    const rect = stageRef.current.container().getBoundingClientRect();
    setEditTextId(id);
    setEditTextType(type);
    setEditTextValue(currentValue);
    setEditTextPos({ x: rect.left + node.x, y: rect.top + node.y });
  }

  function commitEditText() {
    if (!editTextId || !editTextType) {
      setEditTextId(null); setEditTextType(null); setEditTextValue(''); setEditTextPos(null); return;
    }
    if (editTextType === 'label' && editTextValue.trim()) {
      setLabels(p => p.map(l => l.id === editTextId ? { ...l, text: editTextValue.trim() } : l));
    } else if (editTextType === 'number') {
      const n = parseInt(editTextValue);
      if (!isNaN(n) && n >= 0 && n <= 99) {
        setNumbers(p => p.map(no => no.id === editTextId ? { ...no, value: n } : no));
      }
    }
    setEditTextId(null); setEditTextType(null); setEditTextValue(''); setEditTextPos(null);
  }

  function openEditBox(box: BoxNode) {
    if (!stageRef.current) return;
    const rect = stageRef.current.container().getBoundingClientRect();
    snap();
    setBoxes(p => p.filter(b => b.id !== box.id));
    setSelectedIds([]);
    setEditingBoxId(box.id);
    setEditingBoxData({ x: box.x, y: box.y, width: box.width, height: box.height });
    setPendingTextTool('textbox');
    setPendingTextValue(box.text);
    const boxCenterX = box.x + box.width / 2;
    const boxCenterY = box.y + box.height / 2;
    setPendingTextPos({ cx: boxCenterX, cy: boxCenterY, sx: rect.left + boxCenterX, sy: rect.top + boxCenterY });
  }

  function deleteSelected() {
    if (!selectedIds.length) return;
    const ids = selectedIdsRef.current;
    snap();
    setMarkers(p => p.filter(m => !ids.includes(m.id)));
    setArrows(p => p.filter(a => !ids.includes(a.id)));
    setObjects(p => p.filter(o => !ids.includes(o.id)));
    setLabels(p => p.filter(l => !ids.includes(l.id)));
    setNumbers(p => p.filter(n => !ids.includes(n.id)));
    setBoxes(p => p.filter(b => !ids.includes(b.id)));
    setShapes(p => p.filter(s => !ids.includes(s.id)));
    setTriangles(p => p.filter(t => !ids.includes(t.id)));
    setSelectedIds([]);
  }

  function eraseAll() {
    snap();
    setMarkers([]); setArrows([]); setObjects([]); setLabels([]); setNumbers([]); setBoxes([]); setShapes([]); setTriangles([]);
    setAStart(null); setTriP1(null); setTriP2(null); setSelectedIds([]);
    setEraseConfirm(false);
  }

  useImperativeHandle(ref, () => ({
    saveDiagram: async () => {
      if (!stageRef.current) throw new Error('Stage not ready');
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Diagram capture timed out')), 5000)
      );
      const savePromise = async () => {
        const blob = await stageToPNG(stageRef.current);
        const preview = stageRef.current.toDataURL();
        return { blob, preview };
      };
      return Promise.race([savePromise(), timeoutPromise]);
    },
    getCanvasState: () => ({
      markers: mRef.current, arrows: aRef.current, objects: oRef.current,
      labels: lRef.current, numbers: nRef.current, boxes: bRef.current,
      shapes: sRef.current, triangles: tRef.current, fieldView: view,
    }),
    getPreview: () => stageRef.current?.toDataURL({ mimeType: 'image/png', quality: 0.5 }) ?? null,
    setSelectMode: () => setToolMode('select'),
    resetState: (snap) => {
      if (snap.fieldView) setView(snap.fieldView as 'full' | 'half' | 'blank');
      setMarkers(snap.markers ?? []);
      setArrows(snap.arrows ?? []);
      setObjects(snap.objects ?? []);
      setLabels(snap.labels ?? []);
      setNumbers(snap.numbers ?? []);
      setBoxes(snap.boxes ?? []);
      setShapes(snap.shapes ?? []);
      setTriangles(snap.triangles ?? []);
      histRef.current = [];
      setSelectedIds([]);
    },
  }));

  // Render state: in play mode use animated displaySnap, otherwise use own state
  const isPlay = mode === 'play';
  const rm = isPlay && displaySnap ? (displaySnap.markers ?? markers) : markers;
  const ra = isPlay && displaySnap ? (displaySnap.arrows ?? arrows) : arrows;
  const ro = isPlay && displaySnap ? (displaySnap.objects ?? objects) : objects;
  const rl = isPlay && displaySnap ? (displaySnap.labels ?? labels) : labels;
  const rn = isPlay && displaySnap ? (displaySnap.numbers ?? numbers) : numbers;
  const rb = isPlay && displaySnap ? (displaySnap.boxes ?? boxes) : boxes;
  const rs = isPlay && displaySnap ? (displaySnap.shapes ?? shapes) : shapes;
  const rt = isPlay && displaySnap ? (displaySnap.triangles ?? triangles) : triangles;
  const rv = (isPlay && displaySnap?.fieldView ? displaySnap.fieldView : view) as 'full' | 'half' | 'blank';

  return (
    <div className={embedded ? 'flex h-full' : 'fixed inset-0 bg-black z-50 flex'}>

      {/* ── SIDEBAR ──────────────────────────────────────────────────────────── */}
      {!readOnly && mode !== 'play' && <div className="w-52 bg-gray-900 border-r border-gray-700 overflow-y-auto flex-shrink-0">
        <div className="p-3 space-y-3">

          {/* Field View */}
          <div>
            <div className="text-[10px] font-black text-yellow-400 uppercase tracking-widest mb-1.5">View</div>
            <div className="grid grid-cols-3 gap-1">
              {(['full', 'half', 'blank'] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={`py-1 rounded text-[10px] font-bold transition-colors ${view === v ? 'bg-yellow-400 text-black' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                  {v.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-700" />

          {/* Mode buttons: Select | Draw */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => { setToolMode('select'); setAStart(null); setTriP1(null); setTriP2(null); }}
              className={`py-2.5 rounded text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${toolMode === 'select' ? 'bg-yellow-400 text-black' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
            >
              <MousePointer2 className="w-3.5 h-3.5" /> Select
            </button>
            <button
              onClick={() => { setToolMode('draw'); setMultiMode(false); setSelectedIds([]); }}
              className={`py-2.5 rounded text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${toolMode === 'draw' ? 'bg-yellow-400 text-black' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
            >
              <Brush className="w-3.5 h-3.5" /> Draw
            </button>
          </div>

          {/* Select mode: Align */}
          {toolMode === 'select' && (
            <>
              <div>
                <div className="text-[10px] font-black text-yellow-400 uppercase tracking-widest mb-1.5">Align</div>
                <div className="grid grid-cols-2 gap-1">
                  <button onClick={() => toggleAlignMode('h')}
                    className={`py-1.5 rounded text-[10px] font-bold transition-colors ${alignMode === 'h' ? 'bg-yellow-400 text-black' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                    ←→
                  </button>
                  <button onClick={() => toggleAlignMode('v')}
                    className={`py-1.5 rounded text-[10px] font-bold transition-colors ${alignMode === 'v' ? 'bg-yellow-400 text-black' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                    ↕
                  </button>
                </div>
                {alignMode && (
                  <div className="mt-1.5 text-[9px] font-bold text-center rounded py-1.5 bg-yellow-400/10 text-yellow-400">
                    {!alignRefId
                      ? 'Click reference object'
                      : alignTargetIds.length === 0
                        ? 'Click targets · Dbl-click to finish'
                        : `${alignTargetIds.length} selected · Dbl-click to finish`
                    }
                  </div>
                )}
              </div>
            </>
          )}

          {/* Draw Palette — only visible in draw mode */}
          {toolMode === 'draw' && (
            <>
              {/* Markers */}
              {!hideColorToggle && (
                <div className={mode === 'record' ? 'pointer-events-none opacity-30' : ''}>
                  <div className="text-[10px] font-black text-yellow-400 uppercase tracking-widest mb-2">
                    Markers {mode === 'record' && <span className="normal-case font-normal text-gray-500">(locked)</span>}
                  </div>
                  <div className="flex items-center justify-center gap-1">
                    {([{ r: 22, label: 'L', px: 22 }, { r: 15, label: 'M', px: 16 }, { r: 9, label: 'S', px: 12 }] as const).map(sz => {
                      const isMarker = activeDrawTool === 'marker-yellow' || activeDrawTool === 'marker-black';
                      return (
                        <button
                          key={sz.label}
                          onClick={() => { setActiveDrawTool('marker-yellow'); setMarkerSize(sz.r); }}
                          title={`Size ${sz.label}`}
                          className={`flex items-center justify-center rounded-full font-black text-[9px] flex-shrink-0 transition-all bg-gray-800 text-white ${
                            isMarker && markerSize === sz.r ? 'ring-2 ring-white' : 'ring-1 ring-gray-700 hover:ring-gray-500'
                          }`}
                          style={{ width: sz.px, height: sz.px }}
                        >
                          {sz.label}
                        </button>
                      );
                    })}
                    <div className="w-px h-3 bg-gray-700 mx-0.5 flex-shrink-0" />
                    {([
                      { color: '#1a1a1a', label: 'Black' },
                      { color: '#FFD700', label: 'Yellow' },
                      { color: '#ef4444', label: 'Red' },
                      { color: '#3b82f6', label: 'Blue' },
                      { color: '#22c55e', label: 'Green' },
                      { color: '#f97316', label: 'Orange' },
                    ] as const).map(c => {
                      const isMarker = activeDrawTool === 'marker-yellow' || activeDrawTool === 'marker-black';
                      return (
                        <button
                          key={c.color}
                          onClick={() => { setActiveDrawTool('marker-yellow'); setMarkerFillColor(c.color); }}
                          title={c.label}
                          className={`w-4 h-4 rounded-full flex-shrink-0 transition-all ${isMarker && markerFillColor === c.color ? 'ring-2 ring-white ring-offset-1 ring-offset-gray-900' : c.color === '#1a1a1a' ? 'ring-1 ring-white/40' : ''}`}
                          style={{ background: c.color }}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Arrows */}
              <div>
                <div className="text-[10px] font-black text-yellow-400 uppercase tracking-widest mb-1.5">Arrows</div>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    onClick={() => { setActiveDrawTool('arrow-run'); setAStart(null); }}
                    className={`py-1.5 rounded text-xs font-bold transition-colors ${activeDrawTool === 'arrow-run' ? 'bg-yellow-400 text-black' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                  >
                    ⟶ Run
                  </button>
                  <button
                    onClick={() => { setActiveDrawTool('arrow-pass'); setAStart(null); }}
                    className={`py-1.5 rounded text-xs font-bold transition-colors ${activeDrawTool === 'arrow-pass' ? 'bg-yellow-400 text-black' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                  >
                    → Pass
                  </button>
                </div>
                {(activeDrawTool === 'arrow-run' || activeDrawTool === 'arrow-pass') && aStart && (
                  <div className="mt-1.5 text-[9px] text-yellow-400 font-bold text-center bg-yellow-400/10 rounded py-1.5">
                    Click endpoint to finish
                  </div>
                )}
              </div>

              {/* Text Tools */}
              <div>
                <div className="text-[10px] font-black text-yellow-400 uppercase tracking-widest mb-1.5">Text</div>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    onClick={() => setActiveDrawTool('number')}
                    className={`py-1.5 rounded text-xs font-bold transition-colors ${activeDrawTool === 'number' ? 'bg-yellow-400 text-black' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                  >
                    Numbers
                  </button>
                  <button
                    onClick={() => setActiveDrawTool('textbox')}
                    className={`py-1.5 rounded text-xs font-bold transition-colors ${activeDrawTool === 'textbox' ? 'bg-yellow-400 text-black' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                  >
                    Text Box
                  </button>
                </div>
              </div>

              {/* Objects */}
              {!hideObjects && (
                <div>
                  <div className="text-[10px] font-black text-yellow-400 uppercase tracking-widest mb-1.5">Objects</div>
                  <div className="grid grid-cols-3 gap-1 mb-1">
                    <button onClick={() => { setActiveDrawTool('cone'); setShowShapeFlyout(false); setShowFormationFlyout(false); setAStart(null); setTriP1(null); setTriP2(null); setPendingShapeType('ellipse'); }}
                      className={`py-1.5 rounded text-xs font-bold transition-colors ${activeDrawTool === 'cone' ? 'bg-yellow-400 text-black' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                      Cone
                    </button>
                    <button onClick={() => { setActiveDrawTool('ball'); setShowShapeFlyout(false); setShowFormationFlyout(false); setAStart(null); setTriP1(null); setTriP2(null); setPendingShapeType('ellipse'); }}
                      className={`py-1.5 rounded text-xs font-bold transition-colors ${activeDrawTool === 'ball' ? 'bg-yellow-400 text-black' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                      Ball
                    </button>
                    <button onClick={() => { setActiveDrawTool('goal'); setShowShapeFlyout(false); setShowFormationFlyout(false); setAStart(null); setTriP1(null); setTriP2(null); setPendingShapeType('ellipse'); }}
                      className={`py-1.5 rounded text-xs font-bold transition-colors ${activeDrawTool === 'goal' ? 'bg-yellow-400 text-black' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                      Goal
                    </button>
                  </div>

                  {/* Shape + Formation button row */}
                  <div className="flex gap-1">
                    <button
                      onClick={() => { setShowShapeFlyout(p => !p); setShowFormationFlyout(false); }}
                      className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors ${(showShapeFlyout || activeDrawTool === 'shape') && !showFormationFlyout ? 'bg-yellow-400 text-black' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                    >
                      Shape
                    </button>
                    <button
                      onClick={() => { setShowFormationFlyout(p => !p); setShowShapeFlyout(false); }}
                      className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors ${showFormationFlyout ? 'bg-yellow-400 text-black' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                    >
                      Formation
                    </button>
                  </div>

                  {/* Shape flyout — 2×2 grid */}
                  {showShapeFlyout && (
                    <div className="mt-1 bg-gray-800 rounded p-1.5 grid grid-cols-2 gap-1">
                      {([
                        { type: 'ellipse' as const,   label: 'Ellipse',   icon: <svg viewBox="0 0 22 14" width={18} height={12}><ellipse cx="11" cy="7" rx="10" ry="6" fill="none" stroke="currentColor" strokeWidth="2"/></svg> },
                        { type: 'rect' as const,      label: 'Rect',      icon: <svg viewBox="0 0 24 14" width={20} height={12}><rect x="1" y="1" width="22" height="12" fill="none" stroke="currentColor" strokeWidth="2"/></svg> },
                        { type: 'triangle' as const,  label: 'Triangle',  icon: <svg viewBox="0 0 20 18" width={16} height={14}><polygon points="10,1 19,17 1,17" fill="none" stroke="currentColor" strokeWidth="2"/></svg> },
                        { type: 'line' as const,      label: 'Line',      icon: <svg viewBox="0 0 20 14" width={18} height={12}><line x1="1" y1="13" x2="19" y2="1" stroke="currentColor" strokeWidth="2"/></svg> },
                      ] as const).map(({ type: st, label, icon }) => (
                        <button key={st}
                          onClick={() => { setActiveDrawTool('shape'); setPendingShapeType(st); setAStart(null); setTriP1(null); setTriP2(null); }}
                          title={label}
                          className={`flex items-center justify-center py-2 rounded transition-colors ${activeDrawTool === 'shape' && pendingShapeType === st ? 'bg-yellow-400 text-black' : 'bg-gray-700 text-gray-300 hover:text-white'}`}>
                          {icon}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Formation flyout — full width, 3×2 grid */}
                  {showFormationFlyout && view === 'full' && (
                    <div className="mt-1 bg-gray-800 rounded p-1.5 grid grid-cols-2 gap-1">
                      {(['3-4-3', '3-5-2', '4-3-3', '4-4-2', '4-1-4-1', '5-3-2'] as const).map(f => (
                        <button key={f} onClick={() => { applyFormation(f); }}
                          className={`py-1.5 rounded text-[10px] font-bold transition-colors ${activeFormation === f ? 'bg-yellow-400 text-black' : 'bg-gray-700 text-gray-300 hover:text-white'}`}>
                          {f}
                        </button>
                      ))}
                    </div>
                  )}
                  {showFormationFlyout && view !== 'full' && (
                    <div className="mt-1 text-[9px] text-gray-500 text-center py-1.5 bg-gray-800 rounded">
                      Full view only
                    </div>
                  )}
                  {/* Shape guide hints */}
                  {activeDrawTool === 'shape' && pendingShapeType === 'line' && aStart && (
                    <div className="mt-1.5 text-[9px] text-yellow-400 font-bold text-center bg-yellow-400/10 rounded py-1.5">
                      Click endpoint to finish
                    </div>
                  )}
                  {activeDrawTool === 'shape' && pendingShapeType === 'triangle' && triP1 && !triP2 && (
                    <div className="mt-1.5 text-[9px] text-yellow-400 font-bold text-center bg-yellow-400/10 rounded py-1.5">
                      Click 2nd point
                    </div>
                  )}
                  {activeDrawTool === 'shape' && pendingShapeType === 'triangle' && triP1 && triP2 && (
                    <div className="mt-1.5 text-[9px] text-yellow-400 font-bold text-center bg-yellow-400/10 rounded py-1.5">
                      Click 3rd point to close
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <div className="border-t border-gray-700" />

          {/* Erase / Erase All */}
          {selectedIds.length > 0 ? (
            <button onClick={deleteSelected}
              className="w-full py-2 rounded text-xs font-bold flex items-center justify-center gap-1.5 transition-colors bg-red-600 hover:bg-red-700 text-white">
              <Trash2 className="w-3.5 h-3.5" /> Erase
            </button>
          ) : (
            <button onClick={() => setEraseConfirm(true)}
              className="w-full py-2 rounded text-xs font-bold flex items-center justify-center gap-1.5 transition-colors bg-gray-800 text-gray-400 hover:text-white">
              <Eraser className="w-3.5 h-3.5" /> Erase All
            </button>
          )}

          {/* Undo */}
          <button onClick={undo}
            className="w-full py-1.5 rounded text-xs font-bold bg-gray-800 hover:bg-gray-700 flex items-center justify-center gap-1">
            <RotateCcw className="w-3.5 h-3.5" /> Undo
          </button>
        </div>
      </div>}

      {/* ── CANVAS ───────────────────────────────────────────────────────────── */}
      <div className={`relative flex-1 flex items-center justify-center bg-gray-800 overflow-auto${readOnly || isPlay ? ' pointer-events-none' : ''}${mode === 'record' ? ' ring-2 ring-inset ring-red-500' : ''}`}>
        {/* Click-off backdrop: captures clicks outside the text input when pending */}
        {pendingTextTool !== null && (
          <div className="absolute inset-0 z-[10]" onClick={() => commitPendingText()} />
        )}
        {mode === 'record' && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 bg-red-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full pointer-events-none">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />REC
          </div>
        )}
        <Stage ref={stageRef} width={W} height={H} onClick={handleStageClick}>
          <Layer>
            {/* Background */}
            <Rect x={0} y={0} width={W} height={H} listening={false}
              fillLinearGradientStartPoint={{ x: 0, y: 0 }}
              fillLinearGradientEndPoint={{ x: 0, y: H }}
              fillLinearGradientColorStops={[0, '#166534', 0.5, '#15803d', 1, '#166534']}
            />
            {[...Array(8)].map((_, i) => (
              <Rect key={i} listening={false} x={i * 100} y={0} width={100} height={H}
                fill={i % 2 === 0 ? 'rgba(0,0,0,0.06)' : 'transparent'} />
            ))}

            {/* Full field markings */}
            {rv === 'full' && (<>
              <Line listening={false} points={[10,10,790,10,790,590,10,590,10,10]} stroke="white" strokeWidth={3} />
              <Line listening={false} points={[10,300,790,300]} stroke="white" strokeWidth={2} />
              <Circle listening={false} x={400} y={300} radius={60} stroke="white" strokeWidth={2} />
              <Circle listening={false} x={400} y={300} radius={3} fill="white" />
              <Line listening={false} points={[250,10,250,90,550,90,550,10]} stroke="white" strokeWidth={2} />
              <Line listening={false} points={[325,10,325,35,475,35,475,10]} stroke="white" strokeWidth={2} />
              <Circle listening={false} x={400} y={68} radius={3} fill="white" />
              <Line listening={false} points={[330,90,340,110,360,124,380,132,400,135,420,132,440,124,460,110,470,90]}
                stroke="white" strokeWidth={2} tension={0.3} />
              <Rect listening={false} x={358} y={6} width={84} height={4} fill="white" />
              <Line listening={false} points={[250,590,250,510,550,510,550,590]} stroke="white" strokeWidth={2} />
              <Line listening={false} points={[325,590,325,565,475,565,475,590]} stroke="white" strokeWidth={2} />
              <Circle listening={false} x={400} y={532} radius={3} fill="white" />
              <Line listening={false} points={[330,510,340,490,360,476,380,468,400,465,420,468,440,476,460,490,470,510]}
                stroke="white" strokeWidth={2} tension={0.3} />
              <Rect listening={false} x={358} y={590} width={84} height={4} fill="white" />
            </>)}

            {/* Half field markings */}
            {rv === 'half' && (<>
              <Line listening={false} points={[10,10,790,10,790,590,10,590,10,10]} stroke="white" strokeWidth={3} />
              <Line listening={false} points={[10,590,790,590]} stroke="white" strokeWidth={3} />
              <Line listening={false} points={[310,590,318,558,335,530,362,510,390,503,400,502,410,503,438,510,465,530,482,558,490,590]}
                stroke="white" strokeWidth={2} tension={0.3} />
              <Line listening={false} points={[155,10,155,185,645,185,645,10]} stroke="white" strokeWidth={2} />
              <Line listening={false} points={[290,10,290,65,510,65,510,10]} stroke="white" strokeWidth={2} />
              <Circle listening={false} x={400} y={130} radius={3} fill="white" />
              <Line listening={false} points={[315,185,330,215,358,238,388,250,400,253,412,250,442,238,470,215,485,185]}
                stroke="white" strokeWidth={2} tension={0.3} />
              <Rect listening={false} x={335} y={5} width={130} height={6} fill="white" />
            </>)}

            {/* Objects */}
            {ro.map(obj => {
              const isAlignRef = alignRefId === obj.id;
              const isAlignTarget = alignTargetIds.includes(obj.id);
              const isSelected = selectedIds.includes(obj.id);
              return (
              <Group key={obj.id} x={obj.x} y={obj.y} opacity={obj.opacity ?? 1}
                draggable={toolMode === 'select'}
                ref={(node: any) => { if (node) nodeRefs.current.set(obj.id, node); else nodeRefs.current.delete(obj.id); }}
                onDragStart={e => {
                  if (selectedIdsRef.current.length > 1 && selectedIdsRef.current.includes(obj.id))
                    dragPrevRef.current = { x: e.target.x(), y: e.target.y() };
                }}
                onDragMove={e => handleMultiDragMove(obj.id, e)}
                onDragEnd={e => {
                  if (selectedIdsRef.current.length > 1 && selectedIdsRef.current.includes(obj.id)) {
                    handleMultiDragEnd();
                  } else {
                    setObjects(p => p.map(o => o.id === obj.id ? { ...o, x: e.target.x(), y: e.target.y() } : o));
                  }
                }}
                onClick={e => onEl(obj.id, e)}
                onDblClick={e => handleDblClick(obj.id, e)}>
                {obj.type === 'cone' && (<>
                  <Circle radius={9} fill="#EF4444" stroke={isAlignRef ? '#FFD700' : isAlignTarget ? '#00BFFF' : isSelected ? '#FFFFFF' : '#DC2626'} strokeWidth={isAlignRef || isAlignTarget || isSelected ? 3 : 2} />
                  <Circle radius={4} fill="#FCA5A5" />
                </>)}
                {obj.type === 'minigoal' && (<>
                  <Rect x={-20} y={-14} width={5} height={28} fill="#FFD700" />
                  <Rect x={15}  y={-14} width={5} height={28} fill="#FFD700" />
                  <Line points={[-15,-14,15,-14]} stroke="white" strokeWidth={2} />
                  <Line points={[-15,-5, 15,-5]}  stroke="rgba(255,255,255,0.4)" strokeWidth={1} />
                  <Line points={[-15, 4, 15, 4]}  stroke="rgba(255,255,255,0.4)" strokeWidth={1} />
                </>)}
                {obj.type === 'ball' && (<>
                  <Circle radius={10} fill="white" stroke="#555" strokeWidth={1} />
                  <Circle x={-3} y={-3} radius={3} fill="rgba(0,0,0,0.15)" />
                </>)}
              </Group>
              );
            })}

            {/* Markers */}
            {rm.map(m => {
              const mr = m.radius !== undefined ? m.radius : R;
              const fill = markerDisplayFill(m.color);
              const textColor = markerTextContrast(fill);
              const fs = m.num !== undefined ? (m.num >= 10 ? mr * 0.75 : mr * 0.9) : 0;
              const isAlignRef = alignRefId === m.id;
              const isAlignTarget = alignTargetIds.includes(m.id);
              const isSelected = selectedIds.includes(m.id);
              return (
                <Group key={m.id} x={m.x} y={m.y} opacity={m.opacity ?? 1}
                  draggable={toolMode === 'select'}
                  ref={(node: any) => { if (node) nodeRefs.current.set(m.id, node); else nodeRefs.current.delete(m.id); }}
                  onDragStart={e => {
                    if (selectedIdsRef.current.length > 1 && selectedIdsRef.current.includes(m.id))
                      dragPrevRef.current = { x: e.target.x(), y: e.target.y() };
                  }}
                  onDragMove={e => handleMultiDragMove(m.id, e)}
                  onDragEnd={e => {
                    if (selectedIdsRef.current.length > 1 && selectedIdsRef.current.includes(m.id)) {
                      handleMultiDragEnd();
                    } else {
                      setMarkers(p => p.map(mk => mk.id === m.id ? { ...mk, x: e.target.x(), y: e.target.y() } : mk));
                    }
                  }}
                  onClick={e => onEl(m.id, e)}
                  onDblClick={e => handleDblClick(m.id, e, () => handleMarkerDblClick(m, e))}>
                  <Circle radius={mr}
                    fill={fill}
                    stroke={isAlignRef ? '#FFD700' : isAlignTarget ? '#00BFFF' : isSelected ? '#FFFFFF' : fill === '#FFD700' ? '#92400e' : '#555'}
                    strokeWidth={isAlignRef || isAlignTarget || isSelected ? 3 : 1.5}
                  />
                  {m.num !== undefined && (
                    <Text text={m.num.toString()} fontSize={fs} fontStyle="bold"
                      fill={textColor}
                      x={-mr} y={-mr} width={mr * 2} height={mr * 2}
                      align="center" verticalAlign="middle"
                    />
                  )}
                </Group>
              );
            })}

            {/* Arrows */}
            {ra.map(arr => {
              const cp1x = arr.x1 + (2/3) * (arr.cx - arr.x1);
              const cp1y = arr.y1 + (2/3) * (arr.cy - arr.y1);
              const cp2x = arr.x2 + (2/3) * (arr.cx - arr.x2);
              const cp2y = arr.y2 + (2/3) * (arr.cy - arr.y2);
              const dx = arr.x2 - arr.cx, dy = arr.y2 - arr.cy;
              const len = Math.sqrt(dx*dx + dy*dy) || 1;
              const hx = arr.x2 - (dx/len) * 10, hy = arr.y2 - (dy/len) * 10;
              const isAlignRef = alignRefId === arr.id;
              const isAlignTarget = alignTargetIds.includes(arr.id);
              const isArrowSel = isAlignRef || isAlignTarget || selectedIds.includes(arr.id);
              const stroke = isArrowSel ? '#FFD700' : '#FFFFFF';
              return (
                <Group key={arr.id} onClick={e => onEl(arr.id, e)} onDblClick={e => handleDblClick(arr.id, e)} opacity={arr.opacity ?? 1}>
                  <Line
                    bezier
                    points={[arr.x1, arr.y1, cp1x, cp1y, cp2x, cp2y, arr.x2, arr.y2]}
                    stroke={stroke} strokeWidth={3}
                    dash={arr.type === 'run' ? [8, 6] : undefined}
                    hitStrokeWidth={12}
                  />
                  {arr.type !== 'line' && (
                    <KonvaArrow
                      points={[hx, hy, arr.x2, arr.y2]}
                      stroke={stroke} fill={stroke}
                      strokeWidth={3} pointerLength={10} pointerWidth={8}
                      listening={false}
                    />
                  )}
                </Group>
              );
            })}

            {/* Labels */}
            {rl.map(label => {
              if (label.width) {
                const numLines = Math.max(1, Math.ceil(label.text.length * 7.5 / label.width));
                const lineH = 17;
                const rectH = numLines * lineH + 10;
                const isAlignRefN = alignRefId === label.id;
                const isAlignTargetN = alignTargetIds.includes(label.id);
                const isSelectedN = selectedIds.includes(label.id);
                return (
                  <Group
                    key={label.id} x={label.x} y={label.y} opacity={label.opacity ?? 1}
                    draggable={toolMode === 'select'}
                    ref={(node: any) => { if (node) nodeRefs.current.set(label.id, node); else nodeRefs.current.delete(label.id); }}
                    onClick={e => onEl(label.id, e)}
                    onDblClick={e => handleDblClick(label.id, e, () => openEditText(label.id, 'label', label.text, e))}
                    onDragStart={e => {
                      if (selectedIdsRef.current.length > 1 && selectedIdsRef.current.includes(label.id))
                        dragPrevRef.current = { x: e.target.x(), y: e.target.y() };
                    }}
                    onDragMove={e => handleMultiDragMove(label.id, e)}
                    onDragEnd={e => {
                      if (selectedIdsRef.current.length > 1 && selectedIdsRef.current.includes(label.id)) {
                        handleMultiDragEnd();
                      } else {
                        setLabels(p => p.map(l => l.id === label.id ? { ...l, x: e.target.x(), y: e.target.y() } : l));
                      }
                    }}
                  >
                    <Rect
                      x={-(label.width / 2)} y={-(rectH / 2)}
                      width={label.width} height={rectH}
                      fill="rgba(0,0,0,0.55)" cornerRadius={4}
                      stroke={isAlignRefN ? '#FFD700' : isAlignTargetN ? '#00BFFF' : isSelectedN ? '#FFFFFF' : 'transparent'}
                      strokeWidth={isAlignRefN || isAlignTargetN || isSelectedN ? 2 : 0}
                    />
                    <Text
                      x={-(label.width / 2) + 4} y={-(rectH / 2) + 5}
                      text={label.text} fontSize={14} fontStyle="bold" fill="white"
                      width={label.width - 8} wrap="word"
                    />
                  </Group>
                );
              }
              const bgWidth = Math.max(label.text.length * 8 + 16, 40);
              const isAlignRef = alignRefId === label.id;
              const isAlignTarget = alignTargetIds.includes(label.id);
              const isSelected = selectedIds.includes(label.id);
              return (
                <Group
                  key={label.id} x={label.x} y={label.y} opacity={label.opacity ?? 1}
                  draggable={toolMode === 'select'}
                  ref={(node: any) => { if (node) nodeRefs.current.set(label.id, node); else nodeRefs.current.delete(label.id); }}
                  onClick={e => onEl(label.id, e)}
                  onDblClick={e => handleDblClick(label.id, e, () => openEditText(label.id, 'label', label.text, e))}
                  onDragStart={e => {
                    if (selectedIdsRef.current.length > 1 && selectedIdsRef.current.includes(label.id))
                      dragPrevRef.current = { x: e.target.x(), y: e.target.y() };
                  }}
                  onDragMove={e => handleMultiDragMove(label.id, e)}
                  onDragEnd={e => {
                    if (selectedIdsRef.current.length > 1 && selectedIdsRef.current.includes(label.id)) {
                      handleMultiDragEnd();
                    } else {
                      setLabels(p => p.map(l => l.id === label.id ? { ...l, x: e.target.x(), y: e.target.y() } : l));
                    }
                  }}
                >
                  <Rect
                    x={-(bgWidth / 2)} y={-13}
                    width={bgWidth} height={26}
                    fill="rgba(0,0,0,0.55)" cornerRadius={4}
                    stroke={isAlignRef ? '#FFD700' : isAlignTarget ? '#00BFFF' : isSelected ? '#FFFFFF' : 'transparent'}
                    strokeWidth={isAlignRef || isAlignTarget || isSelected ? 2 : 0}
                  />
                  <Text
                    x={-(bgWidth / 2) + 8} y={-13}
                    width={bgWidth - 16} height={26}
                    text={label.text} fontSize={14} fontStyle="bold" fill="white"
                    align="center" verticalAlign="middle"
                  />
                </Group>
              );
            })}

            {/* Numbers */}
            {rn.map(numNode => {
              const isDouble = numNode.value >= 10;
              const isAlignRef = alignRefId === numNode.id;
              const isAlignTarget = alignTargetIds.includes(numNode.id);
              const isSelected = selectedIds.includes(numNode.id);
              const selStroke = isAlignRef ? '#FFD700' : isAlignTarget ? '#00BFFF' : isSelected ? '#FFFFFF' : undefined;
              return (
                <Group
                  key={numNode.id} x={numNode.x} y={numNode.y} opacity={numNode.opacity ?? 1}
                  draggable={toolMode === 'select'}
                  ref={(node: any) => { if (node) nodeRefs.current.set(numNode.id, node); else nodeRefs.current.delete(numNode.id); }}
                  onClick={e => onEl(numNode.id, e)}
                  onDblClick={e => handleDblClick(numNode.id, e, () => openEditText(numNode.id, 'number', String(numNode.value), e))}
                  onDragStart={e => {
                    if (selectedIdsRef.current.length > 1 && selectedIdsRef.current.includes(numNode.id))
                      dragPrevRef.current = { x: e.target.x(), y: e.target.y() };
                  }}
                  onDragMove={e => handleMultiDragMove(numNode.id, e)}
                  onDragEnd={e => {
                    if (selectedIdsRef.current.length > 1 && selectedIdsRef.current.includes(numNode.id)) {
                      handleMultiDragEnd();
                    } else {
                      setNumbers(p => p.map(n => n.id === numNode.id ? { ...n, x: e.target.x(), y: e.target.y() } : n));
                    }
                  }}
                >
                  {isDouble ? (
                    <Rect x={-16} y={-14} width={32} height={28} fill="rgba(0,0,0,0.55)" cornerRadius={14}
                      stroke={selStroke} strokeWidth={selStroke ? 2 : 0} />
                  ) : (
                    <Circle x={0} y={0} radius={14} fill="rgba(0,0,0,0.55)"
                      stroke={selStroke} strokeWidth={selStroke ? 2 : 0} />
                  )}
                  <Text
                    x={-16} y={-14} width={32} height={28}
                    text={String(numNode.value)}
                    fontSize={13} fontStyle="bold" fill="white"
                    align="center" verticalAlign="middle"
                  />
                </Group>
              );
            })}

            {/* Text Boxes */}
            {rb.map(box => {
              const isAlignRef = alignRefId === box.id;
              const isAlignTarget = alignTargetIds.includes(box.id);
              const isSelected = selectedIds.includes(box.id);
              return (
                <Group
                  key={box.id} x={box.x} y={box.y} opacity={box.opacity ?? 1}
                  draggable={toolMode === 'select'}
                  ref={(node: any) => { if (node) nodeRefs.current.set(box.id, node); else nodeRefs.current.delete(box.id); }}
                  onClick={e => onEl(box.id, e)}
                  onDblClick={e => handleDblClick(box.id, e, () => { if (toolMode === 'select') openEditBox(box); })}
                  onDragStart={e => {
                    if (selectedIdsRef.current.length > 1 && selectedIdsRef.current.includes(box.id))
                      dragPrevRef.current = { x: e.target.x(), y: e.target.y() };
                  }}
                  onDragMove={e => handleMultiDragMove(box.id, e)}
                  onDragEnd={e => {
                    if (selectedIdsRef.current.length > 1 && selectedIdsRef.current.includes(box.id)) {
                      handleMultiDragEnd();
                    } else {
                      setBoxes(p => p.map(b => b.id === box.id ? { ...b, x: e.target.x(), y: e.target.y() } : b));
                    }
                  }}
                >
                  <Rect
                    x={0} y={0} width={box.width} height={box.height}
                    fill="rgba(0,0,0,0.7)" cornerRadius={4}
                    stroke={isAlignRef ? '#FFD700' : isAlignTarget ? '#00BFFF' : isSelected ? '#FFFFFF' : 'transparent'}
                    strokeWidth={isAlignRef || isAlignTarget || isSelected ? 2 : 0}
                  />
                  <Text
                    x={8} y={0} width={box.width - 16} height={box.height}
                    text={box.text} fontSize={13} fontStyle="bold" fill="white"
                    wrap="word" align="center" verticalAlign="middle"
                  />
                  {toolMode === 'select' && selectedIds.length === 1 && selectedIds.includes(box.id) && (
                    <Circle
                      x={box.width} y={box.height} radius={6}
                      fill="#FFD700" stroke="#333" strokeWidth={1}
                      draggable
                      onClick={e => { e.cancelBubble = true; }}
                      onDragStart={() => snap()}
                      onDragEnd={e => {
                        e.cancelBubble = true;
                        const charW = 7;
                        const totalTextW = box.text.length * charW;
                        const innerW = Math.max(60, e.target.x()) - 16;
                        const wrappedLines = Math.max(1, Math.ceil(totalTextW / innerW));
                        const minH = Math.max(40, wrappedLines * 20 + 16);
                        setBoxes(p => p.map(b => b.id === box.id
                          ? { ...b, width: Math.max(60, e.target.x()), height: Math.max(minH, e.target.y()) }
                          : b
                        ));
                      }}
                    />
                  )}
                </Group>
              );
            })}

            {/* Shapes */}
            {rs.map(shape => {
              const isAlignRef = alignRefId === shape.id;
              const isAlignTarget = alignTargetIds.includes(shape.id);
              const isSelected = selectedIds.includes(shape.id);
              const shapeStroke = isAlignRef ? '#FFD700' : isAlignTarget ? '#00BFFF' : isSelected ? '#FFFFFF' : shape.color;
              const shapeStrokeW = isAlignRef || isAlignTarget || isSelected ? 3 : 2.5;
              return (
                <Group
                  key={shape.id} x={shape.x} y={shape.y} opacity={shape.opacity ?? 1}
                  draggable={toolMode === 'select'}
                  ref={(node: any) => { if (node) nodeRefs.current.set(shape.id, node); else nodeRefs.current.delete(shape.id); }}
                  onClick={e => onEl(shape.id, e)}
                  onDblClick={e => handleDblClick(shape.id, e)}
                  onDragStart={e => {
                    if (selectedIdsRef.current.length > 1 && selectedIdsRef.current.includes(shape.id))
                      dragPrevRef.current = { x: e.target.x(), y: e.target.y() };
                  }}
                  onDragMove={e => handleMultiDragMove(shape.id, e)}
                  onDragEnd={e => {
                    if (selectedIdsRef.current.length > 1 && selectedIdsRef.current.includes(shape.id)) {
                      handleMultiDragEnd();
                    } else {
                      setShapes(p => p.map(s => s.id === shape.id ? { ...s, x: e.target.x(), y: e.target.y() } : s));
                    }
                  }}
                >
                  {(shape.shapeType === 'ellipse' || shape.shapeType === 'oval') && (
                    <Ellipse x={0} y={0} radiusX={shape.width / 2} radiusY={shape.height / 2} fill="transparent" stroke={shapeStroke} strokeWidth={shapeStrokeW} />
                  )}
                  {(shape.shapeType === 'rect' || shape.shapeType === 'rectangle') && (
                    <Rect x={-shape.width / 2} y={-shape.height / 2} width={shape.width} height={shape.height} fill="transparent" stroke={shapeStroke} strokeWidth={shapeStrokeW} />
                  )}
                  {shape.shapeType === 'circle' && (
                    <Circle x={0} y={0} radius={shape.width / 2} fill="transparent" stroke={shapeStroke} strokeWidth={shapeStrokeW} />
                  )}
                  {shape.shapeType === 'square' && (
                    <Rect x={-shape.width / 2} y={-shape.height / 2} width={shape.width} height={shape.height} fill="transparent" stroke={shapeStroke} strokeWidth={shapeStrokeW} />
                  )}
                  {shape.shapeType === 'triangle' && (
                    <Line
                      points={[0, -shape.height / 2, shape.width / 2, shape.height / 2, -shape.width / 2, shape.height / 2]}
                      closed fill="transparent" stroke={shapeStroke} strokeWidth={shapeStrokeW}
                    />
                  )}
                  {/* Resize handle (bottom-right from center) — free resize for all */}
                  {toolMode === 'select' && selectedIds.length === 1 && selectedIds.includes(shape.id) && (
                    <Circle
                      x={shape.width / 2} y={shape.height / 2}
                      radius={6} fill="#FFD700" stroke="#333" strokeWidth={1}
                      draggable
                      onClick={e => { e.cancelBubble = true; }}
                      onDragStart={() => snap()}
                      onDragEnd={e => {
                        e.cancelBubble = true;
                        const isUniform = shape.shapeType === 'circle' || shape.shapeType === 'square';
                        const nx = e.target.x(), ny = e.target.y();
                        const minDim = 20;
                        if (isUniform) {
                          const sz = Math.max(minDim * 2, Math.max(nx, ny) * 2);
                          setShapes(p => p.map(s => s.id === shape.id ? { ...s, width: sz, height: sz } : s));
                        } else {
                          setShapes(p => p.map(s => s.id === shape.id
                            ? { ...s, width: Math.max(minDim * 2, nx * 2), height: Math.max(minDim * 2, ny * 2) }
                            : s
                          ));
                        }
                      }}
                    />
                  )}
                </Group>
              );
            })}

            {/* Triangles */}
            {rt.map(tri => {
              const isAlignRef = alignRefId === tri.id;
              const isAlignTarget = alignTargetIds.includes(tri.id);
              const isSelected = selectedIds.includes(tri.id);
              const stroke = isAlignRef ? '#FFD700' : isAlignTarget ? '#00BFFF' : isSelected ? '#FFFFFF' : tri.color;
              const sw = isAlignRef || isAlignTarget || isSelected ? 3 : 2.5;
              return (
                <Group key={tri.id} opacity={tri.opacity ?? 1}
                  draggable={toolMode === 'select'}
                  ref={(node: any) => { if (node) nodeRefs.current.set(tri.id, node); else nodeRefs.current.delete(tri.id); }}
                  onClick={e => onEl(tri.id, e)}
                  onDblClick={e => handleDblClick(tri.id, e)}
                  onDragStart={e => {
                    if (selectedIdsRef.current.length > 1 && selectedIdsRef.current.includes(tri.id))
                      dragPrevRef.current = { x: e.target.x(), y: e.target.y() };
                  }}
                  onDragMove={e => handleMultiDragMove(tri.id, e)}
                  onDragEnd={e => {
                    const dx = e.target.x();
                    const dy = e.target.y();
                    e.target.x(0);
                    e.target.y(0);
                    setTriangles(p => p.map(t => t.id === tri.id
                      ? { ...t, x1: t.x1 + dx, y1: t.y1 + dy, x2: t.x2 + dx, y2: t.y2 + dy, x3: t.x3 + dx, y3: t.y3 + dy }
                      : t
                    ));
                  }}
                >
                  <Line points={[tri.x1, tri.y1, tri.x2, tri.y2, tri.x3, tri.y3]} closed fill="transparent" stroke={stroke} strokeWidth={sw} hitStrokeWidth={10} />
                </Group>
              );
            })}

            {/* Arrow control point handles (Select mode only, not in readOnly) */}
            {!readOnly && !isPlay && toolMode === 'select' && ra.map(arr => (
              <Circle
                key={`cp-${arr.id}`}
                x={arr.cx} y={arr.cy}
                radius={6}
                fill="white"
                stroke="#999"
                strokeWidth={1}
                draggable
                onDragMove={e => setArrows(p => p.map(a =>
                  a.id === arr.id ? { ...a, cx: e.target.x(), cy: e.target.y() } : a
                ))}
              />
            ))}

            {/* Arrow start indicator */}
            {aStart && (
              <Circle listening={false} x={aStart.x} y={aStart.y} radius={5} fill="#FFD700" opacity={0.9} />
            )}

            {/* Triangle placement indicators */}
            {triP1 && (
              <Circle listening={false} x={triP1.x} y={triP1.y} radius={5} fill="#FFFFFF" opacity={0.8} />
            )}
            {triP2 && (
              <Circle listening={false} x={triP2.x} y={triP2.y} radius={5} fill="#FFFFFF" opacity={0.8} />
            )}
            {triP1 && triP2 && (
              <Line listening={false} points={[triP1.x, triP1.y, triP2.x, triP2.y]} stroke="#FFFFFF" strokeWidth={1.5} dash={[4, 4]} opacity={0.5} />
            )}
          </Layer>
        </Stage>
      </div>

      {/* Inline marker number editor */}
      {editNumMarkerId && editNumPos && (
        <div
          className="fixed z-[200] flex flex-col items-center gap-1"
          style={{ left: editNumPos.x - 24, top: editNumPos.y - 20 }}
        >
          <input
            autoFocus
            type="number"
            min="0"
            max="99"
            value={editNumValue}
            onChange={e => setEditNumValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') confirmEditNum();
              if (e.key === 'Escape') { setEditNumMarkerId(null); setEditNumValue(''); setEditNumPos(null); }
            }}
            onBlur={confirmEditNum}
            className="w-12 h-8 bg-gray-900 border-2 border-yellow-400 rounded text-center text-white font-bold text-sm outline-none"
            style={{ MozAppearance: 'textfield' } as any}
          />
          <div className="text-[10px] text-gray-400 whitespace-nowrap">0–99 or blank to clear</div>
        </div>
      )}

      {/* Pending textbox overlay */}
      {pendingTextPos && pendingTextTool === 'textbox' && (
        <div
          className="fixed z-[200] flex flex-col items-center gap-1"
          style={{ left: pendingTextPos.sx - 96, top: pendingTextPos.sy - 50 }}
        >
          <textarea
            autoFocus
            rows={3}
            value={pendingTextValue}
            onChange={e => setPendingTextValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commitPendingText();
              if (e.key === 'Escape') { setPendingTextPos(null); setPendingTextTool(null); setPendingTextValue(''); }
            }}
            onBlur={commitPendingText}
            placeholder="Box text..."
            className="w-48 bg-gray-900 border-2 border-yellow-400 rounded p-2 text-white font-bold text-sm text-center outline-none resize-none"
          />
        </div>
      )}

      {/* Pending text placement overlay (label/number tool) */}
      {pendingTextPos && pendingTextTool !== 'textbox' && (
        <div
          className="fixed z-[200] flex flex-col items-center gap-1"
          style={{ left: pendingTextPos.sx - (pendingTextTool === 'number' ? 32 : 64), top: pendingTextPos.sy - 20 }}
        >
          <input
            autoFocus
            type={pendingTextTool === 'number' ? 'number' : 'text'}
            min={pendingTextTool === 'number' ? 0 : undefined}
            max={pendingTextTool === 'number' ? 99 : undefined}
            value={pendingTextValue}
            onChange={e => setPendingTextValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitPendingText();
              if (e.key === 'Escape') { setPendingTextPos(null); setPendingTextTool(null); setPendingTextValue(''); }
            }}
            onBlur={e => {
              if (e.relatedTarget && (e.relatedTarget as HTMLElement).dataset.labelwidth) return;
              commitPendingText();
            }}
            placeholder={pendingTextTool === 'number' ? '0–99' : 'Label...'}
            className={`h-8 bg-gray-900 border-2 border-yellow-400 rounded px-2 text-white font-bold text-sm outline-none ${pendingTextTool === 'number' ? 'w-16 text-center' : 'w-32'}`}
            style={pendingTextTool === 'number' ? { MozAppearance: 'textfield' } as any : undefined}
          />
          <div className="text-[10px] text-gray-400 whitespace-nowrap">Enter to place · Esc to cancel</div>
        </div>
      )}

      {/* Edit text overlay (dblclick on label/number) */}
      {editTextId && editTextPos && (
        <div
          className="fixed z-[200] flex flex-col items-center gap-1"
          style={{ left: editTextPos.x - (editTextType === 'number' ? 32 : 64), top: editTextPos.y - 20 }}
        >
          <input
            autoFocus
            type={editTextType === 'number' ? 'number' : 'text'}
            min={editTextType === 'number' ? 0 : undefined}
            max={editTextType === 'number' ? 99 : undefined}
            value={editTextValue}
            onChange={e => setEditTextValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitEditText();
              if (e.key === 'Escape') { setEditTextId(null); setEditTextType(null); setEditTextValue(''); setEditTextPos(null); }
            }}
            onBlur={commitEditText}
            className={`h-8 bg-gray-900 border-2 border-blue-400 rounded px-2 text-white font-bold text-sm outline-none ${editTextType === 'number' ? 'w-16 text-center' : 'w-32'}`}
            style={editTextType === 'number' ? { MozAppearance: 'textfield' } as any : undefined}
          />
        </div>
      )}

      {/* Erase All confirm dialog */}
      {eraseConfirm && (
        <div className="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-sm w-full">
            <h3 className="text-white font-black text-lg mb-2">Erase all?</h3>
            <p className="text-gray-400 text-sm mb-5">Clears everything on the canvas. You can undo after.</p>
            <div className="flex gap-3">
              <button onClick={eraseAll}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded py-2 font-bold">
                Erase All
              </button>
              <button onClick={() => setEraseConfirm(false)}
                className="flex-1 bg-gray-800 hover:bg-gray-700 rounded py-2 font-bold">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default TacticalWhiteboard;
