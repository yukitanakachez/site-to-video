// Props the renderer (kit/render.mjs) passes to the Demo composition. Times are seconds of the
// video, except cursor atSec, which is plan-seconds (the shot list's unit) played at DemoProps.pace.
export type Rect = { x: number; y: number; w: number; h: number };
export type Camera = { from: Rect; to: Rect; easing: 'inOut' | 'out' | 'linear' };
export type CursorPoint = { atSec: number; x: number; y: number; click?: boolean }; // atSec in plan-seconds
export type TerminalLine = { kind: 'cmd' | 'out'; text: string };
export type Source =
  | { type: 'screenshot' | 'clip'; file: string; width: number; height: number }
  | { type: 'terminal'; lines: TerminalLine[] }
  | { type: 'endcard'; title: string; url: string; logo: string | null };
export type Moment = {
  id: string;
  startSec: number;
  endSec: number;
  source: Source;
  camera?: Camera; // in the coordinates of source.file (already shifted if the renderer cropped it)
  caption: { text: string } | null;
  cursor: CursorPoint[]; // atSec in plan-seconds from the moment's start; x, y in source pixels
};
export type CaptionWord = { text: string; startSec: number; endSec: number };
export type CaptionPage = { startSec: number; endSec: number; lines: CaptionWord[][] };
export type DemoProps = {
  format: 'wide' | 'tall';
  durationSec: number;
  pace: number; // the timeline plays this many times faster than the shot list's plan-seconds
  moments: Moment[];
  captions: CaptionPage[];
  voice: { file: string; startSec: number }; // already sped up to the pace
  music: { file: string; volume: number[] }; // linear gain per frame
  background: string; // the page's dominant background colour, for the end card
  terminalTitle: string; // the terminal window's title bar
};
