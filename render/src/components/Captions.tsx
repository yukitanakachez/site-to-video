import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { SANS } from '../fonts';
import type { CaptionPage } from '../types';

const ACCENT = '#FFD43B';
const FADE_SEC = 0.12;

// Narration captions: one page (one narration line, or two rows of a long one) at a time, from its
// first word's start to its last word's end, each word lit as it is spoken. They sit in the
// format's safe area: 12% above the bottom on wide, 20% on tall (clear of phone app chrome).
export const Captions: React.FC<{ pages: CaptionPage[]; format: 'wide' | 'tall' }> = ({ pages, format }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const t = frame / fps;
  const page = pages.find((p) => t >= p.startSec && t < p.endSec);
  if (!page) return null;
  const wide = format === 'wide';
  const fontSize = wide ? 64 : 60;
  const fade = interpolate(t, [page.startSec, page.startSec + FADE_SEC, page.endSec - FADE_SEC, page.endSec], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const rise = interpolate(t, [page.startSec, page.startSec + 0.2], [12, 0], { easing: Easing.out(Easing.cubic), extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: height * (wide ? 0.12 : 0.2), pointerEvents: 'none' }}>
      <div style={{
        maxWidth: wide ? '82%' : '90%',
        padding: `${fontSize * 0.22}px ${fontSize * 0.45}px`,
        borderRadius: fontSize * 0.32,
        background: 'rgba(12, 12, 18, 0.78)',
        boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
        opacity: fade,
        transform: `translateY(${rise}px)`,
        fontFamily: SANS,
        fontWeight: 700,
        fontSize,
        lineHeight: 1.22,
        letterSpacing: '-0.01em',
        textAlign: 'center',
      }}>
        {page.lines.map((line, i) => (
          // a row that is wider than estimated wraps inside the box rather than spilling out of it
          <div key={i}>
            {line.map((w, j) => {
              const active = t >= w.startSec && t < w.endSec;
              const said = t >= w.startSec;
              return (
                <React.Fragment key={j}>
                  {j > 0 ? ' ' : null}
                  <span style={{ color: active ? ACCENT : said ? '#FFFFFF' : 'rgba(255,255,255,0.55)' }}>{w.text}</span>
                </React.Fragment>
              );
            })}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// A moment's on-screen caption (the page's own words for what is shown), in a fixed band at the
// top of the frame: 7% down on wide, 11% on tall (below phone status bars). At most two lines of
// 42 characters by the shot-list rule; tall wraps further at its narrower width.
export const MomentCaption: React.FC<{ text: string; durationInFrames: number; format: 'wide' | 'tall' }> = ({ text, durationInFrames, format }) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const wide = format === 'wide';
  const fontSize = wide ? 54 : 50;
  const inP = interpolate(frame, [4, 16], [0, 1], { easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const out = interpolate(frame, [durationInFrames - 8, durationInFrames - 1], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: 'center', paddingTop: height * (wide ? 0.07 : 0.11), pointerEvents: 'none' }}>
      <div style={{
        maxWidth: wide ? '70%' : '88%',
        padding: `${fontSize * 0.28}px ${fontSize * 0.55}px`,
        borderRadius: fontSize * 0.36,
        background: 'rgba(255, 255, 255, 0.94)',
        color: '#111118',
        boxShadow: '0 14px 50px rgba(0,0,0,0.22)',
        fontFamily: SANS,
        fontWeight: 800,
        fontSize,
        lineHeight: 1.15,
        letterSpacing: '-0.02em',
        textAlign: 'center',
        textWrap: 'balance',
        opacity: inP * out,
        transform: `translateY(${(1 - inP) * -18}px)`,
      }}>{text}</div>
    </AbsoluteFill>
  );
};
