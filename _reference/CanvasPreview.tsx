'use client';

import { useRef, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const TacticalWhiteboard = dynamic(
  () => import('@/components/admin/TacticalWhiteboard'),
  { ssr: false }
);

// TacticalWhiteboard uses hardcoded 800×600 canvas coordinates
const CANVAS_W = 800;
const CANVAS_H = 600;

interface CanvasPreviewProps {
  canvasState?: any;
  diagramUrl?: string | null;
  /** @deprecated description overlay removed — show description text outside this component */
  description?: string;
  fallbackHeight?: number;
}

/**
 * Renders a tactical diagram at full container width.
 * - If diagramUrl is present, renders it as a crisp <img> (natural aspect ratio, no scaling artifacts).
 * - Otherwise falls back to TacticalWhiteboard scaled via ResizeObserver.
 */
export default function CanvasPreview({
  canvasState,
  diagramUrl,
  fallbackHeight = 280,
}: CanvasPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);

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

  if (!canvasState && !diagramUrl) return null;

  // Prefer pre-rendered PNG — crisp on all displays, no canvas scaling
  if (diagramUrl) {
    return (
      <div style={{ width: '100%', lineHeight: 0 }}>
        <img
          src={diagramUrl}
          alt=""
          style={{ width: '100%', height: 'auto', display: 'block' }}
        />
      </div>
    );
  }

  // Fallback: live canvas rendering via TacticalWhiteboard
  if (containerWidth === 0) {
    return <div ref={containerRef} style={{ width: '100%', height: fallbackHeight }} />;
  }

  const scale = containerWidth / CANVAS_W;
  const height = Math.round(CANVAS_H * scale);

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', height, overflow: 'hidden' }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: CANVAS_W,
          height: CANVAS_H,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          pointerEvents: 'none',
        }}
      >
        <TacticalWhiteboard readOnly embedded initialState={canvasState} />
      </div>
    </div>
  );
}
