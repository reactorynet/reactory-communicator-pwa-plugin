/**
 * highlight.js grammars for the communicator plugin's editors.
 *
 * @copyright Copied from `plugins/reactory-core/code-editor/languages.ts`.
 *
 * ## Why this is a copy rather than an import
 *
 * `reactory-core` and `reactory-communicator` are separate repositories, each
 * mounted as its own submodule. A relative import such as
 * `../../reactory-core/code-editor/CodeEditorPane` would compile in a fully
 * checked-out parent tree and fail everywhere else:
 *
 *   - the plugin cannot build on its own, which the plugin's tests explicitly
 *     support (nothing under `plugins/` is imported across plugin boundaries);
 *   - if `reactory-core` is an uninitialised submodule — an empty directory in a
 *     fresh clone — the communicator plugin would fail with `TS2307`, and the
 *     error would name this plugin rather than the missing submodule. That is
 *     exactly the failure mode `pluginImportFactory` now guards against.
 *
 * The cost is ~330 lines of duplication across two small, stable files (a
 * textarea and a highlight overlay). If a THIRD consumer appears, the right move
 * is to promote this into `@reactory/client-core` — the shared location both
 * plugins already import from — not to copy it again.
 *
 * The only intentional divergence from the original: `html` is registered. Email
 * bodies are HTML with embedded EJS, so HTML colouring is the useful grammar here;
 * the original registered sql/graphql/json/yaml for its own editors.
 */

import hljs from 'highlight.js/lib/core';
import htmlLanguage from 'highlight.js/lib/languages/xml';
import jsonLanguage from 'highlight.js/lib/languages/json';
import yamlLanguage from 'highlight.js/lib/languages/yaml';

/** Grammars the communicator editors use. */
export type CodeLanguage = 'html' | 'json' | 'yaml';

hljs.registerLanguage('html', htmlLanguage);
hljs.registerLanguage('json', jsonLanguage);
hljs.registerLanguage('yaml', yamlLanguage);

export { hljs };
