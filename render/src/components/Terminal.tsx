import React from 'react';
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { MONO, SANS } from '../fonts';
import type { TerminalLine } from '../types';

const CHARS_PER_SEC = 28;
const START_SEC = 0.35; // typing starts this long into the moment
const AFTER_CMD_SEC = 0.35; // pause between a command and its output
const OUT_STAGGER_SEC = 0.12; // each output line appears whole, this far apart
const AFTER_OUT_SEC = 0.45; // pause before the next command

type Timed = { line: TerminalLine; start: number; end: number };

// When each line starts and finishes (plan-seconds from the moment's start). Commands type at 28
// chars a plan-second; output lines appear whole. The video plays it pace times faster.
export function terminalSchedule(lines: TerminalLine[]): Timed[] {
  let t = START_SEC;
  const out: Timed[] = [];
  lines.forEach((line, i) => {
    if (line.kind === 'cmd') {
      if (i > 0) t += AFTER_OUT_SEC;
      const end = t + line.text.length / CHARS_PER_SEC;
      out.push({ line, start: t, end });
      t = end;
    } else {
      t += lines[i - 1]?.kind === 'cmd' ? AFTER_CMD_SEC : OUT_STAGGER_SEC;
      out.push({ line, start: t, end: t });
    }
  });
  return out;
}

// An animated terminal that types the README's own commands and shows its output exactly as the
// README prints it. Nothing is run. It types, pauses and blinks pace times faster than its schedule.
export const Terminal: React.FC<{ lines: TerminalLine[]; title: string; durationInFrames: number; format: 'wide' | 'tall'; pace: number }> = ({ lines, title, durationInFrames, format, pace }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (frame / fps) * pace;
  const wide = format === 'wide';
  const fontSize = wide ? 40 : 34;
  const schedule = terminalSchedule(lines);
  const typing = schedule.some((s) => s.line.kind === 'cmd' && t >= s.start && t < s.end);
  const blinkOn = typing || Math.floor(t * 2.2) % 2 === 0;
  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 14 });
  const push = interpolate(frame, [0, durationInFrames - 1], [1, 1.035], { easing: Easing.inOut(Easing.sin) });

  const shown = schedule.filter((s) => t >= s.start);
  return (
    <AbsoluteFill style={{
      background: 'radial-gradient(120% 90% at 30% 10%, #262a3a 0%, #12141c 55%, #0b0c11 100%)',
      justifyContent: 'center',
      alignItems: 'center',
    }}>
      <div style={{
        width: wide ? '74%' : '88%',
        minHeight: wide ? '58%' : '42%',
        borderRadius: 22,
        background: 'rgba(13, 15, 21, 0.96)',
        border: '1px solid rgba(255,255,255,0.09)',
        boxShadow: '0 40px 120px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.4)',
        overflow: 'hidden',
        opacity: enter,
        transform: `scale(${(0.96 + 0.04 * enter) * push})`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 24px', background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {['#ff5f57', '#febc2e', '#28c840'].map((c) => <div key={c} style={{ width: 16, height: 16, borderRadius: 8, background: c }} />)}
          <div style={{ flex: 1, textAlign: 'center', marginRight: 76, color: 'rgba(255,255,255,0.45)', fontFamily: SANS, fontWeight: 500, fontSize: wide ? 22 : 20 }}>{title}</div>
        </div>
        <div style={{ padding: wide ? '36px 44px' : '30px 32px', fontFamily: MONO, fontSize, lineHeight: 1.5, color: '#e6edf3', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {shown.map((s, i) => {
            const last = i === shown.length - 1;
            if (s.line.kind === 'out') return <div key={i} style={{ color: '#9da7b3' }}>{s.line.text}</div>;
            const n = Math.min(s.line.text.length, Math.floor((t - s.start) * CHARS_PER_SEC));
            return (
              <div key={i}>
                <span style={{ color: '#7ee787', fontWeight: 700 }}>$ </span>
                <span>{s.line.text.slice(0, n)}</span>
                {last ? <span style={{ display: 'inline-block', width: '0.6em', height: '1.1em', verticalAlign: '-0.18em', marginLeft: 2, background: blinkOn ? '#e6edf3' : 'transparent' }} /> : null}
              </div>
            );
          })}
          {shown.length === 0 || shown[shown.length - 1].line.kind === 'out' ? (
            <div>
              <span style={{ color: '#7ee787', fontWeight: 700 }}>$ </span>
              <span style={{ display: 'inline-block', width: '0.6em', height: '1.1em', verticalAlign: '-0.18em', background: blinkOn ? '#e6edf3' : 'transparent' }} />
            </div>
          ) : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};
