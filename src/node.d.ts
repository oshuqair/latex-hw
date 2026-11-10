export * from './index.js';
import type { Renderer, RendererInit } from './index.js';
/** Read the bundled Caveat Math + Amiri data from disk. */
export function loadDefaultFonts(): RendererInit;
/** Create (once) and register the default renderer; `render()` / `layout()` then work directly. */
export function createNodeRenderer(): Promise<Renderer>;
