import {
  createBundledHighlighter,
  createSingletonShorthands,
  guessEmbeddedLanguages,
} from '@shikijs/core'
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript'

/**
 * Stands in for the `shiki` package everywhere it is imported, because Pierre
 * reaches for `bundledLanguages` (see @pierre/diffs resolveLanguage.js) and that
 * map lazily imports all ~700 Shiki grammars. Node and the browser fetch those
 * chunks on demand so nobody notices, but a Cloudflare Worker is a single
 * uploaded script, so every grammar ships and the Worker blew past the 3 MiB
 * limit at 16.25 MB. Registering only the languages this site can produce keeps
 * the same API and drops roughly 8.5 MB of the bundle.
 *
 * Pierre resolves a grammar from the file extension, not the fence label, so the
 * keys below are the names `getFiletypeFromFileName` returns for the extensions
 * `codeFileExtensions` in src/lib/markdown.ts can emit. Adding a fence language
 * there means adding its grammar here too, or the code block fails to highlight.
 * `.txt` needs no entry: it resolves to `text`, which Pierre skips.
 */
export const bundledLanguages = {
  css: () => import('@shikijs/langs/css'),
  html: () => import('@shikijs/langs/html'),
  javascript: () => import('@shikijs/langs/javascript'),
  json: () => import('@shikijs/langs/json'),
  jsx: () => import('@shikijs/langs/jsx'),
  markdown: () => import('@shikijs/langs/markdown'),
  sql: () => import('@shikijs/langs/sql'),
  toml: () => import('@shikijs/langs/toml'),
  tsx: () => import('@shikijs/langs/tsx'),
  typescript: () => import('@shikijs/langs/typescript'),
  yaml: () => import('@shikijs/langs/yaml'),
  zsh: () => import('@shikijs/langs/zsh'),
}

/** The one theme every code block on the site asks for. */
export const bundledThemes = {
  'night-owl': () => import('@shikijs/themes/night-owl'),
}

/**
 * Pierre always passes its own engine, so this default only decides which one
 * gets bundled. The JavaScript engine keeps the Oniguruma WASM build out of the
 * Worker; the WASM path still works, because Pierre imports `shiki/wasm` itself.
 */
export const createHighlighter = createBundledHighlighter({
  langs: bundledLanguages,
  themes: bundledThemes,
  engine: () => createJavaScriptRegexEngine(),
})

export const {
  codeToHast,
  codeToHtml,
  codeToTokens,
  codeToTokensBase,
  codeToTokensWithThemes,
  getLastGrammarState,
  getSingletonHighlighter,
} = createSingletonShorthands(createHighlighter, { guessEmbeddedLanguages })

export * from '@shikijs/core'
export {
  createJavaScriptRegexEngine,
  defaultJavaScriptRegexConstructor,
} from '@shikijs/engine-javascript'
export { createOnigurumaEngine, loadWasm } from '@shikijs/engine-oniguruma'
