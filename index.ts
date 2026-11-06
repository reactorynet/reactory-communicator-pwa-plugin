import Reactory from '@reactorynet/reactory-core';

import { components as emailTemplateComponents } from './email-templates';

export * from './email-templates';

/**
 * Reactory Communicator — client plugin.
 *
 * The editor surface for the communicator module's transactional templates. It is
 * a separate plugin, not part of `reactory-core`, because:
 *
 *   - it owns a module-specific API surface (`communicator*` GraphQL operations)
 *     that `reactory-core` has no business knowing about;
 *   - it can ship and version independently of the core plugin, which every client
 *     application depends on.
 *
 * ## What it does NOT do
 *
 * No rich-text/WYSIWYG editing of email bodies. The stored body is EJS — a
 * rich-text engine would normalise `<% %>` markers and silently corrupt the
 * template. Bodies are edited as source in a code pane, and rendered server-side
 * for preview so the operator sees what the recipient will get.
 *
 * ## Registration
 *
 * `src/components/plugins/__index.ts` is generated at build/startup by
 * `pluginImportFactory.ts`, which imports EVERY directory under
 * `src/components/plugins/` that has an entry point. Adding this directory is
 * therefore enough — there is no allow-list to edit, and no change was needed in
 * the client when this plugin was introduced.
 */
export const components: Reactory.Client.IReactoryComponentRegistryEntry<any>[] = [
  ...emailTemplateComponents,
];

export default components;
