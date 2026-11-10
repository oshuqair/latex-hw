export type Dir = 'ltr' | 'rtl';

/** A Tegaki bundle (only the fields latex-hw reads). */
export interface TegakiBundleLike {
  family?: string;
  unitsPerEm?: number;
  /** char -> compact glyph data ({ w, t, s: [{ p: [x, y, width][], d, a, r?, n? }] }) */
  glyphData: Record<string, { w: number; t: number; s: { p: number[][]; d: number; a: number; r?: number }[] }>;
  /** shaped glyph id -> glyph data (Arabic bundle) */
  glyphDataById?: Record<string, { w: number; t: number; s: { p: number[][]; d: number; a: number; r?: number }[] }>;
  features?: string[];
}

export interface RendererInit {
  fonts: { latin: TegakiBundleLike; arabic?: TegakiBundleLike };
  /** TTF bytes for harfbuzzjs: `arabic` = the subset the bundle's glyph ids refer to; `arabicFull` = full Amiri for missing characters. */
  fontData?: { arabic?: ArrayBuffer; arabicFull?: ArrayBuffer };
  /** Operator dictionary: `name -> word` markdown, or [english, arabic][] pairs. */
  dictionary?: string | [string, string][];
}

export interface RenderOptions {
  /** Reading direction; 'rtl' runs the mirroring pass. Default 'ltr'. */
  dir?: Dir;
  /** Display style (default true, or from $$…$$ / \[…\]). */
  display?: boolean;
  /** px per em (default 48). */
  fontSize?: number;
  /** Multiplier on fontSize (default 1). */
  scale?: number;
  /** rtl: \sin -> جا etc. (default true). */
  translateOperators?: boolean;
  /** Wrap bare Arabic in \\text{}. A single letter stays its own variable (`س^2` → `\\text{س}^2`);
   *  two adjacent letters stay two variables (`أج` → `\\text{أ}\\text{ج}`, write `\\text{كح}` for a
   *  two-letter name); three or more letters join as a word. `لا` stays one ligature.
   *  Arabic-Indic digits are wrapped, Western digits are not. Default true. */
  autoWrapArabic?: boolean;
  /** Stroke colour (default '#000'). */
  color?: string;
  /** Caveat's em relative to MathJax's em (default 1.2). Scales advances, heights and strokes together. */
  latinScale?: number;
  /** Amiri size factor (default 1). */
  arabicScale?: number;
  /** Pen width relative to Caveat's mean stroke width (default 0.85). */
  penScale?: number;
  /** 'uniform' (one pen for everything, default) or 'stroke' (Arabic strokes keep their mean Tegaki width). */
  strokeWidth?: 'uniform' | 'stroke';
  /** Seconds between units (glyphs, rules, delimiters). Default 0.12. */
  unitPause?: number;
  /** rtl: draw < > ≤ ≥ ⊂ ∈ ⊢ … mirrored, as Unicode bidi does (default true). A relation whose partner
   *  is in Caveat Math is drawn as that partner (< as >), so its strokes keep their natural order. false = latex-svg behaviour. */
  mirrorRelations?: boolean;
  /** Margin around the ink in px (default 2 pen widths, min 4). */
  margin?: number;
}

export type StrokeSource = 'glyph' | 'rule' | 'delimiter' | 'radical' | 'arrow' | 'dots' | 'fallback';

export interface StrokeInfo {
  index: number;
  /** SVG path data, absolute px, y down */
  d: string;
  width: number;
  length: number;
  /** suggested timing, seconds */
  start: number;
  duration: number;
  source: StrokeSource;
  char?: string;
  font?: 'latin' | 'arabic';
  glyphId?: string;
  mirrored: boolean;
  /** MathML node path, e.g. "mfrac/mrow/mi" */
  node: string;
  /** Tegaki priority: 0 body, -1 dots and marks */
  priority: number;
}

export interface Warning { code: string; message: string; char?: string }

export interface RenderResult {
  /** Static SVG: one <path class="hw-stroke"> per stroke, in writing order, with data-* attributes. */
  svg: string;
  strokes: StrokeInfo[];
  width: number;
  height: number;
  baseline: number;
  totalDuration: number;
  warnings: Warning[];
  /** The TeX actually sent to MathJax (after delimiter stripping, Arabic auto-wrap and the operator dictionary). */
  expression: string;
}

export interface Box { x: number; y: number; w: number; h: number }
export type Affine = [number, number, number, number, number, number];
export type Element =
  | { kind: 'glyph'; char: string; code: number; variant: string; font: 'latin'; box: Box; matrix: Affine; mirrored: boolean; node: string }
  | { kind: 'text-run'; text: string; font: 'arabic' | 'latin'; fontSize: number; advance: number; box: Box; matrix: Affine; mirrored: false; node: string }
  | { kind: 'rule'; box: Box; node: string }
  | { kind: 'stretchy'; shape: string | null; char: string; box: Box; mirrored: boolean; node: string; parts?: string[]; matrix?: Affine };

export interface LayoutResult {
  unitsPerEm: 1000;
  viewBox: { x: number; y: number; w: number; h: number };
  dir: Dir;
  elements: Element[];
  warnings: Warning[];
  expression: string;
}

export interface Renderer {
  render(latex: string, options?: RenderOptions): RenderResult;
  layout(latex: string, options?: RenderOptions): LayoutResult;
}

export function createRenderer(init: RendererInit): Promise<Renderer>;
export function setDefaultRenderer(r: Renderer | Promise<Renderer>): void;
export function render(latex: string, options?: RenderOptions): Promise<RenderResult>;
export function layout(latex: string, options?: RenderOptions): Promise<LayoutResult>;
export const keepMirroredCharacters: Set<number>;
export const mirroredRelations: Set<number>;
export const relationPairs: Map<number, number>;
export function rtlGlyphPolicy(code: number, options: { mirrorRelations?: boolean }, has?: (code: number) => boolean): { keep: boolean; drawCode: number; relation?: boolean };
export const rtlStrokeDirection: Set<number>;
export const DEFAULT_DICTIONARY: [string, string][];
export function parseDictionary(markdown: string): [string, string][];
export function translateOperators(tex: string, entries?: [string, string][]): string;
/** Wrap bare Arabic letters, Arabic-Indic digits and Arabic punctuation in `\\text{}`. */
export function autoWrapArabic(tex: string): string;
export function stripDelimiters(input: string): { tex: string; display: boolean | null };
