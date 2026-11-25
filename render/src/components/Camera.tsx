import React from 'react';
import { AbsoluteFill, Easing, Img, OffthreadVideo, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Camera as CameraMove, Rect } from '../types';

const EASINGS = {
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  out: Easing.out(Easing.cubic),
  linear: Easing.linear,
};

// The camera rect at a frame of the moment. A zoom moves the width geometrically (each frame zooms
// by the same ratio, so it reads as steady) and keeps the point the zoom closes in on fixed; a
// pure pan moves linearly. Both follow the shot list's easing.
export function cameraRect(camera: CameraMove, frame: number, durationInFrames: number): Rect {
  const p = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], {
    easing: EASINGS[camera.easing] ?? EASINGS.inOut,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const { from: a, to: b } = camera;
  const w = a.w * (b.w / a.w) ** p;
  const h = a.h * (b.h / a.h) ** p;
  // fraction of the zoom done, measured on the width; falls back to p for a pure pan
  const k = Math.abs(a.w - b.w) > 0.5 ? (a.w - w) / (a.w - b.w) : p;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w, h };
}

export const Camera: React.FC<{
  file: string;
  kind: 'screenshot' | 'clip';
  width: number;
  height: number;
  camera: CameraMove;
  durationInFrames: number;
  pace: number; // a clip, recorded in plan-seconds, plays this many times faster
}> = ({ file, kind, width, height, camera, durationInFrames, pace }) => {
  const frame = useCurrentFrame();
  const { width: W } = useVideoConfig();
  const r = cameraRect(camera, frame, durationInFrames);
  const s = W / r.w;
  const style: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    width,
    height,
    maxWidth: 'none',
    transformOrigin: '0 0',
    transform: `translate(${-r.x * s}px, ${-r.y * s}px) scale(${s})`,
  };
  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: '#000' }}>
      {kind === 'clip'
        ? <OffthreadVideo src={staticFile(file)} muted playbackRate={pace} style={style} />
        : <Img src={staticFile(file)} style={style} />}
    </AbsoluteFill>
  );
};
