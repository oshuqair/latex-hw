export * from './index.js';
import type { Renderer, RendererInit } from './index.js';
/** Fetch the bundled fonts from `base` (URL of the fonts/ folder). */
export function loadFonts(base?: string): Promise<RendererInit>;
/** Create and register the default renderer from fonts at `base`. */
export function createBrowserRenderer(base?: string): Promise<Renderer>;
