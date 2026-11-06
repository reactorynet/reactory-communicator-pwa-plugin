/**
 * Types for the communicator template editor.
 *
 * These mirror the GraphQL shapes from WP-1 (`CommunicatorEmailTemplateView` and
 * friends) rather than the raw Mongo documents. Two details are deliberate:
 *
 *   - `channel` is a plain `string`. The stored value is the lowercase `Channel`
 *     enum value (`email`, `sms`), and the GraphQL enum (`EMAIL`) cannot serialise
 *     it — the server type returns the stored string for that reason.
 *   - `source` is the raw stored template text: inline EJS or a `$ref://` pointer.
 *     The editor must show exactly what the renderer will read, so it is never
 *     normalised or HTML-decoded on the way in.
 */

/** One editable element of a template (`subject` or `body`). */
export interface IEmailTemplateElement {
  id: string;
  /** `subject` | `body` | `text` */
  role: string;
  /** `text` | `html` */
  format: string;
  /** Raw stored source: inline EJS, or a `$ref://…` pointer to a file. */
  source: string;
  name?: string;
  /** True when `source` points at a file instead of holding inline content. */
  isFileBacked: boolean;
  /** Absolute path the pointer resolves to on this deployment, when resolvable. */
  refPath?: string | null;
  /** Why the pointer could not be resolved, when it could not. */
  refError?: string | null;
  /** True when a file-backed element has been converted to inline content. */
  isDetached: boolean;
  enabled: boolean;
  clientId?: string | null;
  organizationId?: string | null;
  businessUnitId?: string | null;
  updatedAt?: string | null;
}

/** A template view: the parent document plus its resolved elements. */
export interface IEmailTemplateView {
  id: string;
  /** View slug, e.g. `forgot-password-email`. */
  view: string;
  name: string;
  description?: string | null;
  kind: string;
  /** Stored channel value verbatim: `email`, `sms`, … */
  channel: string;
  engine: string;
  status: string;
  enabled: boolean;
  visibility: string;
  clientId?: string | null;
  organizationId?: string | null;
  businessUnitId?: string | null;
  locale?: string | null;
  subject?: IEmailTemplateElement | null;
  body?: IEmailTemplateElement | null;
  /** Any roles beyond subject/body, so nothing is hidden from an operator. */
  otherElements: IEmailTemplateElement[];
  /** True when the document came from the installer. */
  seeded: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

/** Scope filter for the list query. All three levels the model supports. */
export interface IEmailTemplateFilter {
  clientId?: string;
  organizationId?: string;
  businessUnitId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * The three scope levels a template can be bound at.
 *
 * A template is resolved most-specific-first, so an operator needs to see which
 * level a row belongs to rather than guessing from an empty column.
 */
export type EmailTemplateScopeLevel = 'client' | 'organization' | 'businessUnit';

export const scopeLevelOf = (view: IEmailTemplateView): EmailTemplateScopeLevel => {
  if (view.organizationId && view.businessUnitId) return 'businessUnit';
  if (view.organizationId) return 'organization';
  return 'client';
};

/** Human label for the scope level, for the list column. */
export const SCOPE_LEVEL_LABEL: Record<EmailTemplateScopeLevel, string> = {
  client: 'Application',
  organization: 'Organization',
  businessUnit: 'Business unit',
};

/**
 * Purpose hint for the server renderer, derived from the view slug.
 *
 * The preview needs a sample link (`resetLink`, `activationLink`) or the seeded
 * bodies render with an empty `href`. The mapping is by slug prefix because that is
 * how the seeded views are named; an unrecognised view simply previews without one
 * rather than guessing.
 */
export const purposeForView = (view: string | undefined | null): string | undefined => {
  const slug = String(view || '').toLowerCase();
  if (slug.includes('forgot') || slug.includes('reset')) return 'password_reset';
  if (slug.includes('activation') || slug.includes('register')) return 'registration';
  return undefined;
};
