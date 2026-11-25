import React from 'react';
import { Audio, Sequence, staticFile, useVideoConfig } from 'remotion';

// The mix: the voice (already sped up to the video's pace) at 0 dB from its start; the music bed at
// the per-frame gain the renderer worked out (−10 dB, ducked to −20 dB under narration). No sound
// effects (spec 16.2).
export const Soundtrack: React.FC<{
  voice: { file: string; startSec: number };
  music: { file: string; volume: number[] };
}> = ({ voice, music }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {music.file ? <Audio src={staticFile(music.file)} volume={(f) => music.volume[Math.min(f, music.volume.length - 1)] ?? 0} /> : null}
      {voice.file ? (
        <Sequence from={Math.round(voice.startSec * fps)} layout="none">
          <Audio src={staticFile(voice.file)} volume={1} />
        </Sequence>
      ) : null}
    </>
  );
};
