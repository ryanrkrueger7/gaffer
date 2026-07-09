'use client';

// The ONE unified renderer (§8): used for both static and playback modes.
// Takes a resolved BoardState (output of resolveBoardState) and draws it via react-konva.

import { Stage as KonvaStage, Layer, Rect, Circle, Line, Arrow, Group, Text } from 'react-konva';
import type { Stage as StageConfig } from '@/lib/engine/types';
import type { BoardState, EntitySnapshot } from '@/lib/engine/resolve';

const CW = 800;
const CH = 600;
const DEFAULT_RADIUS = 22;

// ── Field markings ────────────────────────────────────────────────────────────
// Coordinates match the 800×600 canvas with a 10px inset boundary.
// No decorative stripe overlay — solid dark-green fill only.

function PitchFull() {
  return (
    <>
      {/* Background */}
      <Rect listening={false} x={0} y={0} width={CW} height={CH} fill="#166534" />
      {/* Outer boundary */}
      <Rect
        listening={false}
        x={10} y={10} width={780} height={580}
        stroke="white" strokeWidth={3} fill="transparent"
      />
      {/* Halfway line */}
      <Line listening={false} points={[10, 300, 790, 300]} stroke="white" strokeWidth={2} />
      {/* Center circle + spot */}
      <Circle listening={false} x={400} y={300} radius={60} stroke="white" strokeWidth={2} />
      <Circle listening={false} x={400} y={300} radius={3} fill="white" />

      {/* ── Top end ── */}
      {/* Penalty box */}
      <Line listening={false} points={[250, 10, 250, 90, 550, 90, 550, 10]} stroke="white" strokeWidth={2} />
      {/* Goal area */}
      <Line listening={false} points={[325, 10, 325, 35, 475, 35, 475, 10]} stroke="white" strokeWidth={2} />
      {/* Penalty spot */}
      <Circle listening={false} x={400} y={68} radius={3} fill="white" />
      {/* Penalty arc */}
      <Line
        listening={false} tension={0.3} stroke="white" strokeWidth={2}
        points={[330, 90, 340, 110, 360, 124, 380, 132, 400, 135, 420, 132, 440, 124, 460, 110, 470, 90]}
      />
      {/* Goal net */}
      <Rect listening={false} x={358} y={6} width={84} height={4} fill="white" />

      {/* ── Bottom end ── */}
      {/* Penalty box */}
      <Line listening={false} points={[250, 590, 250, 510, 550, 510, 550, 590]} stroke="white" strokeWidth={2} />
      {/* Goal area */}
      <Line listening={false} points={[325, 590, 325, 565, 475, 565, 475, 590]} stroke="white" strokeWidth={2} />
      {/* Penalty spot */}
      <Circle listening={false} x={400} y={532} radius={3} fill="white" />
      {/* Penalty arc */}
      <Line
        listening={false} tension={0.3} stroke="white" strokeWidth={2}
        points={[330, 510, 340, 490, 360, 476, 380, 468, 400, 465, 420, 468, 440, 476, 460, 490, 470, 510]}
      />
      {/* Goal net */}
      <Rect listening={false} x={358} y={590} width={84} height={4} fill="white" />
    </>
  );
}

function PitchHalf() {
  return (
    <>
      <Rect listening={false} x={0} y={0} width={CW} height={CH} fill="#166534" />
      <Rect
        listening={false}
        x={10} y={10} width={780} height={580}
        stroke="white" strokeWidth={3} fill="transparent"
      />
      {/* Penalty box */}
      <Line listening={false} points={[155, 10, 155, 185, 645, 185, 645, 10]} stroke="white" strokeWidth={2} />
      {/* Goal area */}
      <Line listening={false} points={[290, 10, 290, 65, 510, 65, 510, 10]} stroke="white" strokeWidth={2} />
      {/* Penalty spot */}
      <Circle listening={false} x={400} y={130} radius={3} fill="white" />
      {/* Penalty arc */}
      <Line
        listening={false} tension={0.3} stroke="white" strokeWidth={2}
        points={[315, 185, 330, 215, 358, 238, 388, 250, 400, 253, 412, 250, 442, 238, 470, 215, 485, 185]}
      />
      {/* Goal net */}
      <Rect listening={false} x={335} y={5} width={130} height={6} fill="white" />
    </>
  );
}

function PitchBlank() {
  return <Rect listening={false} x={0} y={0} width={CW} height={CH} fill="#1a1a1a" />;
}

// ── Color helpers ─────────────────────────────────────────────────────────────

function teamFill(team?: 'A' | 'B' | 'neutral', color?: string): string {
  if (color) return color;
  if (team === 'A') return '#FFD700';
  if (team === 'B') return '#3B82F6';
  return '#9CA3AF';
}

function teamStroke(team?: 'A' | 'B' | 'neutral'): string {
  if (team === 'A') return '#92400e';
  if (team === 'B') return '#1e3a5f';
  return '#555555';
}

function contrastText(hex: string): string {
  const h = hex.startsWith('#') ? hex.slice(1) : '808080';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#000000' : '#ffffff';
}

// ── Bezier sampling helper ─────────────────────────────────────────────────────

function sampleQuadBezier(
  x1: number, y1: number,
  cx: number, cy: number,
  x2: number, y2: number,
  n = 20,
): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, mt = 1 - t;
    pts.push(
      mt * mt * x1 + 2 * mt * t * cx + t * t * x2,
      mt * mt * y1 + 2 * mt * t * cy + t * t * y2,
    );
  }
  return pts;
}

// ── Diagnostic action path overlay ────────────────────────────────────────────

/** One overlay line per authored action — computed at t by the page, rendered here. */
export interface ActionOverlay {
  id: string;
  kind: 'pass' | 'run' | 'carry';
  x1: number; y1: number;
  x2: number; y2: number;
  /** True when the playhead t is within [action.start, action.start + action.duration]. */
  active: boolean;
  /** True when this action is the currently selected one. */
  selected?: boolean;
  /** Bezier control point (absolute canvas coords) — present when path.type === 'bezier'. */
  cx?: number;
  cy?: number;
}

// Color palette for overlays — reuses existing dark-theme accents.
const OVERLAY_COLOR: Record<ActionOverlay['kind'], string> = {
  pass: '#38bdf8',   // sky — matches possession ring
  run: '#86efac',   // light green — matches accent text
  carry: '#fbbf24', // amber
};

// ── Shared marker props (optional editor hooks) ───────────────────────────────

interface MarkerDragProps {
  draggable?: boolean;
  isSelected?: boolean;
  isPending?: boolean;
  isOwner?: boolean;
  onDragEnd?: (x: number, y: number) => void;
  onDragStart?: () => void;
}

// ── Entity shapes ─────────────────────────────────────────────────────────────

function PlayerMarker({ e, draggable, isSelected, isPending, isOwner, onDragEnd, onDragStart }: { e: EntitySnapshot } & MarkerDragProps) {
  const r = e.radius ?? DEFAULT_RADIUS;
  const fill = teamFill(e.team, e.color);
  const stroke = teamStroke(e.team);
  const tc = contrastText(fill);
  // Label priority: jersey# → coaching role → position ID (GK/ST/CAM…) → drill label → slot.
  const label =
    e.display?.jerseyNumber?.toString() ??
    e.display?.roleName ??
    e.display?.inferredPositionId ??
    e.display?.drillLabel ??
    e.display?.positionSlot?.toString() ??
    '';
  const fs = label.length >= 2 ? Math.round(r * 0.75) : Math.round(r * 0.9);

  return (
    <Group
      x={Math.round(e.x)} y={Math.round(e.y)}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd ? (ev) => onDragEnd(ev.target.x(), ev.target.y()) : undefined}
    >
      {/* Possession ring — shown when this player currently owns the ball */}
      {isOwner && <Circle radius={r + 7} stroke="#38bdf8" strokeWidth={1.5} fill="transparent" listening={false} opacity={0.55} />}
      {isSelected && <Circle radius={r + 4} stroke="#22c55e" strokeWidth={2} fill="transparent" listening={false} />}
      {isPending && <Circle radius={r + 4} stroke="#f59e0b" strokeWidth={2} fill="transparent" listening={false} />}
      <Circle radius={r} fill={fill} stroke={stroke} strokeWidth={1.5} />
      {label.length > 0 && (
        <Text
          text={label}
          fontSize={fs}
          fontStyle="bold"
          fill={tc}
          x={-r} y={-r}
          width={r * 2} height={r * 2}
          align="center"
          verticalAlign="middle"
          listening={false}
        />
      )}
    </Group>
  );
}

function ConeMarker({ e, draggable, isSelected, isPending, onDragEnd, onDragStart }: { e: EntitySnapshot } & MarkerDragProps) {
  return (
    <Group
      x={e.x} y={e.y}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd ? (ev) => onDragEnd(ev.target.x(), ev.target.y()) : undefined}
    >
      {(isSelected || isPending) && <Circle radius={13} stroke={isSelected ? '#22c55e' : '#f59e0b'} strokeWidth={2} fill="transparent" listening={false} />}
      <Circle radius={9} fill="#EF4444" stroke="#DC2626" strokeWidth={2} />
      <Circle radius={4} fill="#FCA5A5" />
    </Group>
  );
}

function MinigoalMarker({ e, draggable, isSelected, isPending, onDragEnd, onDragStart }: { e: EntitySnapshot } & MarkerDragProps) {
  return (
    <Group
      x={e.x} y={e.y}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd ? (ev) => onDragEnd(ev.target.x(), ev.target.y()) : undefined}
    >
      {(isSelected || isPending) && <Rect x={-26} y={-20} width={52} height={40} stroke={isSelected ? '#22c55e' : '#f59e0b'} strokeWidth={2} fill="transparent" listening={false} />}
      <Rect x={-20} y={-14} width={5} height={28} fill="#FFD700" />
      <Rect x={15} y={-14} width={5} height={28} fill="#FFD700" />
      <Line points={[-15, -14, 15, -14]} stroke="white" strokeWidth={2} />
    </Group>
  );
}

function MannequinMarker({ e, draggable, isSelected, isPending, onDragEnd, onDragStart }: { e: EntitySnapshot } & MarkerDragProps) {
  const r = e.radius ?? 16;
  return (
    <Group
      x={e.x} y={e.y}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd ? (ev) => onDragEnd(ev.target.x(), ev.target.y()) : undefined}
    >
      {isSelected && <Circle radius={r + 4} stroke="#22c55e" strokeWidth={2} fill="transparent" listening={false} />}
      {isPending && <Circle radius={r + 4} stroke="#f59e0b" strokeWidth={2} fill="transparent" listening={false} />}
      <Circle radius={r} fill="#374151" stroke="#6B7280" strokeWidth={1.5} />
      <Line points={[0, -r + 4, 0, r - 4]} stroke="#9CA3AF" strokeWidth={2} listening={false} />
    </Group>
  );
}

// ── BoardRenderer ─────────────────────────────────────────────────────────────

export interface BoardRendererProps {
  boardState: BoardState;
  stage: StageConfig;
  // Optional editor hooks — additive, never break read-only usage.
  onBoardPointerDown?: (x: number, y: number) => void;
  selectedEntityId?: string | null;
  pendingEntityId?: string | null;
  /** Ball owner — receives a subtle possession ring so the coach always sees who's next. */
  ballOwnerEntityId?: string | null;
  onEntityDragEnd?: (id: string, x: number, y: number) => void;
  /** Ball entity id — enables drag on the ball when onEntityDragEnd is provided. */
  ballEntityId?: string;
  /** Diagnostic action path overlays — computed at t by the page, rendered behind entities. */
  actionOverlays?: ActionOverlay[];
  /** Ghost drag line shown while an authoring gesture is in progress. */
  ghostLine?: { x1: number; y1: number; x2: number; y2: number } | null;
  /**
   * DIAGNOSTIC: true when the resolved ball position is inside a player marker's radius.
   * Outlines ball in red. The page.tsx also fires a console.warn when this is true.
   */
  ballHidden?: boolean;
  /** Called on pointer move — page uses this to update ghost line cursor position. */
  onBoardPointerMove?: (x: number, y: number) => void;
  /** Called when an entity drag begins — page uses this to activate the ghost line. */
  onEntityDragStart?: (id: string) => void;
  /** When false, the ball is not rendered (no ball entity placed yet). Defaults to true. */
  showBall?: boolean;
  /** Called when an action overlay line is clicked. */
  onOverlayClick?: (actionId: string) => void;
  /** Draggable apex dot for the currently selected action's bezier curve. */
  apexDot?: { x: number; y: number; onDragMove: (x: number, y: number) => void; onDragEnd: (x: number, y: number) => void } | null;
}

export default function BoardRenderer({
  boardState,
  stage,
  onBoardPointerDown,
  selectedEntityId,
  pendingEntityId,
  ballOwnerEntityId,
  onEntityDragEnd,
  ballEntityId,
  actionOverlays,
  ghostLine,
  ballHidden,
  onBoardPointerMove,
  onEntityDragStart,
  showBall = true,
  onOverlayClick,
  apexDot,
}: BoardRendererProps) {
  const { entities, ball, activeAnnotations } = boardState;
  const isDraggable = !!onEntityDragEnd;

  return (
    <div style={{ display: 'inline-block', verticalAlign: 'top' }}>
      <KonvaStage
        width={CW} height={CH}
        onClick={onBoardPointerDown ? (e) => {
          const pos = e.target.getStage()?.getPointerPosition();
          if (pos) onBoardPointerDown(pos.x, pos.y);
        } : undefined}
        onMouseMove={onBoardPointerMove ? (e) => {
          const pos = e.target.getStage()?.getPointerPosition();
          if (pos) onBoardPointerMove(pos.x, pos.y);
        } : undefined}
      >
        <Layer>
          {/* Field */}
          {stage.fieldExtent === 'half' ? (
            <PitchHalf />
          ) : stage.fieldExtent === 'full' ? (
            <PitchFull />
          ) : (
            <PitchBlank />
          )}

          {/* ── Diagnostic: authored action path overlays (behind entities) ── */}
          {actionOverlays?.map(ov => {
            const color = OVERLAY_COLOR[ov.kind];
            const opacity = ov.selected ? 1 : (ov.active ? 0.85 : 0.22);
            const sw = ov.selected ? 2.5 : (ov.active ? 2 : 1);
            const pts = ov.cx != null && ov.cy != null
              ? sampleQuadBezier(ov.x1, ov.y1, ov.cx, ov.cy, ov.x2, ov.y2)
              : [ov.x1, ov.y1, ov.x2, ov.y2];
            if (ov.kind === 'run') {
              // Arrow for runs — directional indicator
              return (
                <Arrow
                  key={ov.id}
                  points={pts}
                  stroke={color} fill={color}
                  strokeWidth={sw} opacity={opacity}
                  pointerLength={8} pointerWidth={6}
                  listening={!!onOverlayClick}
                  hitStrokeWidth={12}
                  onClick={onOverlayClick ? (e) => { e.cancelBubble = true; onOverlayClick(ov.id); } : undefined}
                />
              );
            }
            // Pass: solid line; Carry: dashed line
            return (
              <Line
                key={ov.id}
                points={pts}
                stroke={color} strokeWidth={sw} opacity={opacity}
                dash={ov.kind === 'carry' ? [7, 4] : undefined}
                listening={!!onOverlayClick}
                hitStrokeWidth={12}
                onClick={onOverlayClick ? (e) => { e.cancelBubble = true; onOverlayClick(ov.id); } : undefined}
              />
            );
          })}

          {/* ── Ghost drag line — shown while authoring gesture is in progress ── */}
          {ghostLine && (
            <Line
              points={[ghostLine.x1, ghostLine.y1, ghostLine.x2, ghostLine.y2]}
              stroke="white" strokeWidth={1.5} opacity={0.45}
              dash={[5, 5]}
              listening={false}
            />
          )}

          {/* ── Apex dot — draggable handle for bezier curve authoring ── */}
          {apexDot && (
            <Circle
              x={apexDot.x} y={apexDot.y}
              radius={7}
              fill="white"
              stroke="#22c55e"
              strokeWidth={2}
              draggable
              onDragMove={(e) => apexDot.onDragMove(e.target.x(), e.target.y())}
              onDragEnd={(e) => apexDot.onDragEnd(e.target.x(), e.target.y())}
            />
          )}

          {/* Non-ball entities */}
          {entities.map(e => {
            const sel = selectedEntityId === e.id;
            const pend = pendingEntityId === e.id;
            const dragEnd = isDraggable
              ? (x: number, y: number) => onEntityDragEnd!(e.id, x, y)
              : undefined;
            const dragStart = isDraggable && onEntityDragStart
              ? () => onEntityDragStart(e.id)
              : undefined;
            if (e.kind === 'player') return (
              <PlayerMarker key={e.id} e={e} isSelected={sel} isPending={pend} isOwner={ballOwnerEntityId === e.id} draggable={isDraggable} onDragEnd={dragEnd} onDragStart={dragStart} />
            );
            if (e.kind === 'cone') return (
              <ConeMarker key={e.id} e={e} isSelected={sel} isPending={pend} draggable={isDraggable} onDragEnd={dragEnd} onDragStart={dragStart} />
            );
            if (e.kind === 'minigoal') return (
              <MinigoalMarker key={e.id} e={e} isSelected={sel} isPending={pend} draggable={isDraggable} onDragEnd={dragEnd} onDragStart={dragStart} />
            );
            if (e.kind === 'mannequin') return (
              <MannequinMarker key={e.id} e={e} isSelected={sel} isPending={pend} draggable={isDraggable} onDragEnd={dragEnd} onDragStart={dragStart} />
            );
            return null;
          })}

          {/* Ball — only rendered when a ball entity has been placed */}
          {/* DIAGNOSTIC: stroke turns red when ball center is inside a player marker (tangent offset broken). */}
          {showBall && (
            <Group
              x={ball.x} y={ball.y}
              draggable={isDraggable && !!ballEntityId}
              onDragStart={isDraggable && ballEntityId && onEntityDragStart ? () => onEntityDragStart(ballEntityId) : undefined}
              onDragEnd={isDraggable && ballEntityId ? (ev) => onEntityDragEnd!(ballEntityId, ev.target.x(), ev.target.y()) : undefined}
            >
              <Circle radius={9} fill="white" stroke={ballHidden ? '#ef4444' : '#555'} strokeWidth={ballHidden ? 2.5 : 1} />
              <Circle radius={3} fill="rgba(0,0,0,0.2)" />
            </Group>
          )}
        </Layer>
      </KonvaStage>

      {/* Annotation band — system-positioned display layer, never overlapping markers */}
      <div
        style={{
          width: CW,
          minHeight: 48,
          background: '#0d1f10',
          borderTop: '1px solid #1e3a20',
          padding: activeAnnotations.length > 0 ? '10px 18px' : '0',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {activeAnnotations.map(ann => (
          <p
            key={ann.id}
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 600,
              color: '#bbf7d0',
              letterSpacing: '0.01em',
              lineHeight: 1.5,
            }}
          >
            {ann.text}
          </p>
        ))}
      </div>
    </div>
  );
}
