import React from 'react';
import { CalculateMetadataFunction, Composition } from 'remotion';
import { Demo } from './Demo';
import type { DemoProps } from './types';

export const FPS = 30;
const SIZES = { wide: { width: 1920, height: 1080 }, tall: { width: 1080, height: 1920 } };

const calculateMetadata: CalculateMetadataFunction<DemoProps> = ({ props }) => ({
  ...SIZES[props.format],
  durationInFrames: Math.round(props.durationSec * FPS),
});

// Only used when the project is opened in Remotion Studio; real renders pass every prop.
const defaultProps: DemoProps = {
  format: 'wide',
  durationSec: 3,
  pace: 1,
  moments: [{ id: 'm1', startSec: 0, endSec: 3, source: { type: 'endcard', title: 'Demo', url: 'https://example.com', logo: null }, caption: null, cursor: [] }],
  captions: [],
  voice: { file: '', startSec: 0 },
  music: { file: '', volume: [] },
  background: '#101014',
  terminalTitle: 'Terminal',
};

export const Root: React.FC = () => (
  <Composition
    id="Demo"
    component={Demo}
    fps={FPS}
    width={1920}
    height={1080}
    durationInFrames={90}
    defaultProps={defaultProps}
    calculateMetadata={calculateMetadata}
  />
);
