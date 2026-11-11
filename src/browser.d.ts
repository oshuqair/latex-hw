export * from './index.js';
import type { Renderer, RendererInit } from './index.js';
/** Fetch the bundled fonts. `base` is the URL of a fonts/ folder; omit it to use the files shipped with the package. */
export function loadFonts(base?: string): Promise<RendererInit>;
/** Create and register the default renderer. `base` is optional (see `loadFonts`). */
export function createBrowserRenderer(base?: string): Promise<Renderer>;
