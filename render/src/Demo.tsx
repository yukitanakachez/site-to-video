import React from 'react';
import { AbsoluteFill, Freeze, Sequence, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import './fonts';
import { Camera } from './components/Camera';
import { Captions, MomentCaption } from './components/Captions';
import { Cursor } from './components/Cursor';
import { EndCard } from './components/EndCard';
import { Soundtrack } from './components/Soundtrack';
import { Terminal } from './components/Terminal';
import type { DemoProps, Moment } from './types';

const CROSSFADE = 6; // frames: each moment fades in over the previous one's last frame
const ENDCARD_FADE = 10;

const Visual: React.FC<{ m: Moment; durationInFrames: number; props: DemoProps }> = ({ m, durationInFrames, props }) => {
  const src = m.source;
  if (src.type === 'endcard') return <EndCard title={src.title} url={src.url} logo={src.logo} background={props.background} format={props.format} />;
  if (src.type === 'terminal') return <Terminal lines={src.lines} title={props.terminalTitle} durationInFrames={durationInFrames} format={props.format} pace={props.pace} />;
  return (
    <>
      <Camera file={src.file} kind={src.type} width={src.width} height={src.height} camera={m.camera!} durationInFrames={durationInFrames} pace={props.pace} />
      <Cursor points={m.cursor} camera={m.camera!} durationInFrames={durationInFrames} pace={props.pace} />
    </>
  );
};

const FadeIn: React.FC<{ frames: number; children: React.ReactNode }> = ({ frames, children }) => {
  const frame = useCurrentFrame();
  const opacity = frames > 0 ? interpolate(frame, [0, frames], [0, 1], { extrapolateRight: 'clamp' }) : 1;
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

export const Demo: React.FC<DemoProps> = (props) => {
  const { fps } = useVideoConfig();
  const frames = props.moments.map((m) => {
    const from = Math.round(m.startSec * fps);
    return { m, from, len: Math.max(1, Math.round(m.endSec * fps) - from) };
  });
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {frames.map(({ m, from, len }, i) => {
        const next = frames[i + 1];
        const fade = next ? (next.m.source.type === 'endcard' ? ENDCARD_FADE : CROSSFADE) : 0;
        return (
          <React.Fragment key={m.id}>
            <Sequence from={from} durationInFrames={len} name={m.id}>
              <FadeIn frames={i === 0 ? 0 : m.source.type === 'endcard' ? ENDCARD_FADE : CROSSFADE}>
                <Visual m={m} durationInFrames={len} props={props} />
                {m.caption ? <MomentCaption text={m.caption.text} durationInFrames={len} format={props.format} /> : null}
              </FadeIn>
            </Sequence>
            {fade ? (
              // hold this moment's last frame underneath (earlier in the tree) while the next fades in
              <Sequence from={from + len} durationInFrames={fade} name={`${m.id}-hold`}>
                <Freeze frame={len - 1}>
                  <Visual m={m} durationInFrames={len} props={props} />
                </Freeze>
              </Sequence>
            ) : null}
          </React.Fragment>
        );
      })}
      <Captions pages={props.captions} format={props.format} />
      <Soundtrack voice={props.voice} music={props.music} />
    </AbsoluteFill>
  );
};
