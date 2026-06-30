'use client';

// The ONE unified renderer (§8): used for both static and playback modes.
// Takes a resolved BoardState (output of resolveBoardState) and draws it via react-konva.

import { Stage as KonvaStage, Layer, Rect, Circle, Line, Group, Text } from 'react-konva';
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

// ── Entity shapes ─────────────────────────────────────────────────────────────

function PlayerMarker({ e }: { e: EntitySnapshot }) {
  const r = e.radius ?? DEFAULT_RADIUS;
  const fill = teamFill(e.team, e.color);
  const stroke = teamStroke(e.team);
  const tc = contrastText(fill);
  const label = e.display?.positionSlot?.toString() ?? '';
  const fs = label.length >= 2 ? Math.round(r * 0.75) : Math.round(r * 0.9);

  return (
    <Group x={Math.round(e.x)} y={Math.round(e.y)}>
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
        />
      )}
    </Group>
  );
}

function ConeMarker({ e }: { e: EntitySnapshot }) {
  return (
    <Group x={e.x} y={e.y}>
      <Circle radius={9} fill="#EF4444" stroke="#DC2626" strokeWidth={2} />
      <Circle radius={4} fill="#FCA5A5" />
    </Group>
  );
}

function MinigoalMarker({ e }: { e: EntitySnapshot }) {
  return (
    <Group x={e.x} y={e.y}>
      <Rect x={-20} y={-14} width={5} height={28} fill="#FFD700" />
      <Rect x={15} y={-14} width={5} height={28} fill="#FFD700" />
      <Line points={[-15, -14, 15, -14]} stroke="white" strokeWidth={2} />
    </Group>
  );
}

function MannequinMarker({ e }: { e: EntitySnapshot }) {
  const r = e.radius ?? 16;
  return (
    <Group x={e.x} y={e.y}>
      <Circle radius={r} fill="#374151" stroke="#6B7280" strokeWidth={1.5} />
      <Line points={[0, -r + 4, 0, r - 4]} stroke="#9CA3AF" strokeWidth={2} />
    </Group>
  );
}

// ── BoardRenderer ─────────────────────────────────────────────────────────────

export interface BoardRendererProps {
  boardState: BoardState;
  stage: StageConfig;
}

export default function BoardRenderer({ boardState, stage }: BoardRendererProps) {
  const { entities, ball, activeAnnotations } = boardState;

  return (
    <div style={{ display: 'inline-block', verticalAlign: 'top' }}>
      <KonvaStage width={CW} height={CH}>
        <Layer>
          {/* Field */}
          {stage.fieldExtent === 'half' ? (
            <PitchHalf />
          ) : stage.fieldExtent === 'full' ? (
            <PitchFull />
          ) : (
            <PitchBlank />
          )}

          {/* Non-ball entities */}
          {entities.map(e => {
            if (e.kind === 'player') return <PlayerMarker key={e.id} e={e} />;
            if (e.kind === 'cone') return <ConeMarker key={e.id} e={e} />;
            if (e.kind === 'minigoal') return <MinigoalMarker key={e.id} e={e} />;
            if (e.kind === 'mannequin') return <MannequinMarker key={e.id} e={e} />;
            return null;
          })}

          {/* Ball */}
          <Group x={ball.x} y={ball.y}>
            <Circle radius={9} fill="white" stroke="#555" strokeWidth={1} />
            <Circle radius={3} fill="rgba(0,0,0,0.2)" />
          </Group>
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
