/**
 * GraphQL documents for the communicator template editor.
 *
 * These call the WP-1 operations (`communicatorEmailTemplates`,
 * `communicatorPreviewEmailTemplate`, `communicatorSaveTemplateElement`), which
 * read the documents the SEND path reads — a parent `view` with `elements`
 * pointing at `subject`/`body` children whose content is inline EJS or a
 * `$ref://` pointer.
 *
 * The older `communicatorTemplates` operation is deliberately not used: it models
 * a single document with a JSON `content` object, which is not what the renderer
 * consumes, and it threw on every seeded row before WP-1 fixed the parse.
 */

/** Elements are requested through a shared fragment so both queries stay in step. */
const ELEMENT_FIELDS = `
  id
  role
  format
  source
  name
  isFileBacked
  refPath
  refError
  isDetached
  enabled
  clientId
  organizationId
  businessUnitId
  updatedAt
`;

/** List template views for the caller's scope, with elements resolved. */
export const COMMUNICATOR_EMAIL_TEMPLATES = `
  query CommunicatorEmailTemplates($filter: CommunicatorEmailTemplateFilter) {
    communicatorEmailTemplates(filter: $filter) {
      id
      view
      name
      description
      kind
      channel
      engine
      status
      enabled
      visibility
      clientId
      organizationId
      businessUnitId
      locale
      seeded
      createdAt
      updatedAt
      subject { ${ELEMENT_FIELDS} }
      body { ${ELEMENT_FIELDS} }
      otherElements { ${ELEMENT_FIELDS} }
    }
  }
`;

/** One view by document id or view slug. */
export const COMMUNICATOR_EMAIL_TEMPLATE = `
  query CommunicatorEmailTemplate($id: ID, $view: String) {
    communicatorEmailTemplate(id: $id, view: $view) {
      id
      view
      name
      description
      kind
      channel
      engine
      status
      enabled
      visibility
      clientId
      organizationId
      businessUnitId
      locale
      seeded
      createdAt
      updatedAt
      subject { ${ELEMENT_FIELDS} }
      body { ${ELEMENT_FIELDS} }
      otherElements { ${ELEMENT_FIELDS} }
    }
  }
`;

/**
 * Render an element (or unsaved source) through the real renderer.
 *
 * Server-side on purpose: `$ref://` resolution, the `t()` translator and the
 * tenant scope all live there, so a client-side render would show the operator
 * something the recipient will not get.
 */
export const COMMUNICATOR_PREVIEW_EMAIL_TEMPLATE = `
  mutation CommunicatorPreviewEmailTemplate($input: CommunicatorPreviewEmailTemplateInput!) {
    communicatorPreviewEmailTemplate(input: $input) {
      success
      preview {
        role
        subject
        text
        html
      }
      error {
        code
        message
      }
    }
  }
`;

/** Save one element's source. Refused for a file-backed element unless `detach`. */
export const COMMUNICATOR_SAVE_TEMPLATE_ELEMENT = `
  mutation CommunicatorSaveTemplateElement($input: CommunicatorSaveTemplateElementInput!) {
    communicatorSaveTemplateElement(input: $input) {
      success
      outcome
      element {
        ${ELEMENT_FIELDS}
      }
      error {
        code
        message
      }
    }
  }
`;

/** Error codes the editor branches on, kept beside the documents that produce them. */
export const TEMPLATE_EDITOR_ERRORS = {
  FILE_BACKED: 'TEMPLATE_ELEMENT_FILE_BACKED',
  EMPTY: 'TEMPLATE_ELEMENT_EMPTY',
  NOT_FOUND: 'TEMPLATE_ELEMENT_NOT_FOUND',
  NO_ROLE: 'TEMPLATE_ELEMENT_NO_ROLE',
} as const;
