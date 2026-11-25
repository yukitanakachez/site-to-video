import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { cameraRect } from './Camera';
import type { Camera, CursorPoint } from '../types';

const MOVE_SEC = 0.7; // longest glide between two points
const ENTER_SEC = 0.5; // the cursor glides in this long before its first point
const CLICK_SEC = 0.45; // press pulse and ripple
const glide = Easing.bezier(0.65, 0, 0.35, 1);

// Where the cursor is at time t (s from the moment's start), in source pixels, plus the time of the
// latest click at or before t.
function cursorAt(points: CursorPoint[], t: number) {
  let x = points[0].x;
  let y = points[0].y;
  let lastClick = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i > 0) {
      const prev = points[i - 1];
      const dur = Math.min(MOVE_SEC, Math.max(0.15, (p.atSec - prev.atSec) * 0.8));
      if (t < p.atSec - dur) break; // still resting at the previous point
      const k =interpolate(t, [p.atSec - dur, p.atSec], [0, 1], { easing: glide, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      x = prev.x + (p.x - prev.x) * k;
      y = prev.y + (p.y - prev.y) * k;
    }
    if (p.click && t >= p.atSec) lastClick = p.atSec;
  }
  return { x, y, lastClick };
}

// An arrow pointer that follows the shot list's cursor points, pinned to the page through the
// camera, with a press pulse and ripple on each click. Its times (points and glides) are
// plan-seconds, played pace times faster.
export const Cursor: React.FC<{ points: CursorPoint[]; camera: Camera; durationInFrames: number; pace: number }> = ({ points, camera, durationInFrames, pace }) => {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();
  if (!points.length) return null;
  const sorted = [...points].sort((a, b) => a.atSec - b.atSec);
  const t = (frame / fps) * pace;
  const first = sorted[0].atSec;
  if (t < first - ENTER_SEC) return null;

  const r = cameraRect(camera, frame, durationInFrames);
  const s = W / r.w;
  const at = cursorAt(sorted, t);
  let sx = (at.x - r.x) * s;
  let sy = (at.y - r.y) * s;
  const size = Math.round(Math.max(W, H) * 0.024); // 46 px on a 1920 frame

  // entrance: glide in from lower right and fade up
  const enter = interpolate(t, [first - ENTER_SEC, first], [0, 1], { easing: glide, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  sx += (1 - enter) * size * 3;
  sy += (1 - enter) * size * 2;
  const opacity = interpolate(t, [first - ENTER_SEC, first - ENTER_SEC + 0.2], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const since = t - at.lastClick;
  const pressing = since >= 0 && since < CLICK_SEC;
  const press = pressing ? interpolate(since, [0, 0.08, CLICK_SEC * 0.6], [1, 0.8, 1], { extrapolateRight: 'clamp' }) : 1;
  const ripple = pressing ? since / CLICK_SEC : 0;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {pressing ? (
        <div style={{
          position: 'absolute',
          left: sx,
          top: sy,
          width: size * 2.4,
          height: size * 2.4,
          marginLeft: -size * 1.2,
          marginTop: -size * 1.2,
          borderRadius: '50%',
          border: `${Math.max(2, size / 12)}px solid rgba(255,255,255,0.9)`,
          boxShadow: '0 0 0 2px rgba(0,0,0,0.15)',
          transform: `scale(${0.2 + ripple * 0.9})`,
          opacity: 0.85 * (1 - ripple),
        }} />
      ) : null}
      <svg
        width={size}
        height={size * 1.4}
        viewBox="0 0 20 28"
        style={{
          position: 'absolute',
          left: sx - size * 0.1,
          top: sy - size * 0.07,
          opacity,
          transform: `scale(${press})`,
          transformOrigin: '10% 5%',
          filter: `drop-shadow(0 ${size / 14}px ${size / 7}px rgba(0,0,0,0.35))`,
          overflow: 'visible',
        }}
      >
        <path d="M2 1.5 L2 22.5 L7.2 17.6 L10.6 25.6 L14.1 24.1 L10.8 16.3 L17.8 16.3 Z" fill="#fff" stroke="#111" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </AbsoluteFill>
  );
};
