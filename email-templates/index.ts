import Reactory from '@reactorynet/reactory-core';

import EmailTemplatesPage from './EmailTemplatesPage';

export { default as EmailTemplatesPage } from './EmailTemplatesPage';
export type { EmailTemplatesPageProps } from './EmailTemplatesPage';

// Editor surface (WP-3). Exported so a host can mount the drawer on its own page
// rather than only through EmailTemplatesPage.
export { default as TemplateEditorDrawer } from './components/TemplateEditorDrawer';
export type { TemplateEditorDrawerProps } from './components/TemplateEditorDrawer';
export { default as ElementEditor } from './components/ElementEditor';
export { default as EjsSourcePane } from './components/EjsSourcePane';
export { default as PreviewPane } from './components/PreviewPane';
export { default as DetachConfirmDialog } from './components/DetachConfirmDialog';
export { default as useElementDraft } from './hooks/useElementDraft';
export { default as useTemplatePreview } from '../communicator/hooks/useTemplatePreview';
export * from '../communicator/types';
export * from '../communicator/graphql';

/**
 * Component registry entries contributed by the email-templates module.
 *
 * `nameSpace: 'communicator'` — the module's own namespace, not `core`. The route
 * that renders this page resolves `communicator.EmailTemplates@1.0.0`, and keeping
 * the namespace distinct means a `core.*` component can never collide with it.
 *
 * Roles match the WP-1 server gates: the page reads template views, so it needs
 * `COMMUNICATOR_TEMPLATE_VIEW` (or ADMIN). The server enforces this too — the
 * registry entry only prevents a signed-in user from seeing a screen that would
 * fail for them.
 */
export const components: Reactory.Client.IReactoryComponentRegistryEntry<any>[] = [
  {
    nameSpace: 'communicator',
    name: 'EmailTemplates',
    version: '1.0.0',
    component: EmailTemplatesPage,
    description:
      'Lists the transactional email templates, showing whether each element is stored inline or read from a file.',
    tags: ['communicator', 'email', 'templates', 'email-templates'],
    roles: ['COMMUNICATOR_TEMPLATE_VIEW', 'COMMUNICATOR_TEMPLATE_ADMIN', 'ADMIN'],
  },
];

export default components;
