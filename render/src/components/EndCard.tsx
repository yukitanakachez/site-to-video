import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { SANS } from '../fonts';

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return 0;
  const [r, g, b] = m.slice(1).map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const shortUrl = (url: string) => url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');

// The closing card: logo (if the page has one), product name and link, on the page's own
// background colour, with dark or light text to suit it.
export const EndCard: React.FC<{ title: string; url: string; logo: string | null; background: string; format: 'wide' | 'tall' }> = ({ title, url, logo, background, format }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dark = luminance(background) < 0.4;
  const ink = dark ? '#ffffff' : '#111118';
  const wide = format === 'wide';
  const pop = (delay: number) => spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 140, mass: 0.7 } });
  const fade = (delay: number) => interpolate(frame, [delay, delay + 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const titleSize = wide ? 128 : 112;

  return (
    <AbsoluteFill style={{ background, justifyContent: 'center', alignItems: 'center', fontFamily: SANS, color: ink }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: wide ? 34 : 40, padding: '0 8%' }}>
        {logo ? (
          <Img src={staticFile(logo)} style={{
            height: wide ? 132 : 150,
            maxWidth: wide ? 520 : 600,
            objectFit: 'contain',
            opacity: fade(0),
            transform: `scale(${0.85 + 0.15 * pop(0)})`,
          }} />
        ) : null}
        <div style={{
          fontSize: titleSize,
          fontWeight: 800,
          letterSpacing: '-0.035em',
          lineHeight: 1.02,
          textAlign: 'center',
          textWrap: 'balance',
          opacity: fade(4),
          transform: `translateY(${(1 - pop(4)) * 40}px)`,
        }}>{title}</div>
        <div style={{
          fontSize: wide ? 46 : 44,
          fontWeight: 600,
          padding: '0.32em 0.9em',
          borderRadius: 999,
          background: dark ? 'rgba(255,255,255,0.12)' : 'rgba(17,17,24,0.07)',
          border: `1.5px solid ${dark ? 'rgba(255,255,255,0.22)' : 'rgba(17,17,24,0.14)'}`,
          opacity: fade(11),
          transform: `translateY(${(1 - pop(11)) * 24}px)`,
        }}>{shortUrl(url)}</div>
      </div>
    </AbsoluteFill>
  );
};
