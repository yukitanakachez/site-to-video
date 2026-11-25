// Inter (captions, titles, end card) and JetBrains Mono (terminal), both SIL OFL 1.1, bundled from
// @fontsource; licences in render/fonts/. The CSS files declare every subset with a unicode-range.
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import { continueRender, delayRender } from 'remotion';

export const SANS = 'Inter, "Helvetica Neue", Arial, sans-serif';
export const MONO = '"JetBrains Mono", Menlo, Consolas, monospace';

// Holds the first frame until the faces we draw with have loaded, so no frame shows a fallback font.
const handle = delayRender('Loading fonts');
Promise.all([
  ...['500', '600', '700', '800'].map((w) => document.fonts.load(`${w} 64px Inter`)),
  document.fonts.load('400 40px "JetBrains Mono"'),
  document.fonts.load('700 40px "JetBrains Mono"'),
]).then(() => continueRender(handle), (e) => { console.error('font load failed', e); continueRender(handle); });
