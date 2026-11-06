/**
 * @jest-environment jsdom
 *
 * `communicator.EmailTemplates` — the read-only list.
 *
 * The page exists so an operator can see the real template documents before
 * opening an editor. Two facts are load-bearing and are what these tests pin:
 *
 *   - **file vs inline.** A `$ref://` body lives in the repo; editing it forks the
 *     application's copy. An operator must see that *before* they start typing.
 *   - **scope level.** Templates resolve most-specific-first across application,
 *     organization and business unit, so the level has to be visible.
 */
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

jest.mock('@reactory/client-core/api', () => ({
  useReactory: () => undefined,
}));

import EmailTemplatesPage from '../email-templates/EmailTemplatesPage';

const view = (overrides: any = {}) => ({
  id: 'v1',
  view: 'forgot-password-email',
  name: 'Forgot password email',
  description: 'Transactional password-reset email.',
  kind: 'email',
  channel: 'email',
  engine: 'ejs',
  status: 'published',
  enabled: true,
  visibility: 'client',
  clientId: 'c1',
  organizationId: null,
  businessUnitId: null,
  locale: 'en',
  seeded: true,
  subject: {
    id: 's1',
    role: 'subject',
    format: 'text',
    source: "<%= t('emails.forgotPassword.subject') %>",
    isFileBacked: false,
    isDetached: false,
    enabled: true,
  },
  body: {
    id: 'b1',
    role: 'body',
    format: 'html',
    source: '$ref://defaults/forgot/forgot-password-body-html.ejs',
    isFileBacked: true,
    refPath: '/data/templates/email/defaults/forgot/forgot-password-body-html.ejs',
    isDetached: false,
    enabled: true,
  },
  otherElements: [],
  ...overrides,
});

const makeReactory = (rows: any[], options: { error?: string; reject?: boolean } = {}) => ({
  graphqlQuery: jest.fn().mockImplementation(() => {
    if (options.reject) return Promise.reject(new Error(options.error || 'boom'));
    return Promise.resolve({
      data: { communicatorEmailTemplates: rows },
      errors: options.error ? [{ message: options.error }] : [],
    });
  }),
});

const renderPage = (reactory: any) => render(<EmailTemplatesPage reactory={reactory} />);

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

describe('EmailTemplatesPage', () => {
  it('lists the template views it loads', async () => {
    renderPage(makeReactory([view()]));

    await waitFor(() => expect(screen.getByText('forgot-password-email')).toBeInTheDocument());
    expect(screen.getByText('Forgot password email')).toBeInTheDocument();
  });

  it('queries the WP-1 operation, not the legacy one', async () => {
    const reactory = makeReactory([view()]);
    renderPage(reactory);

    await waitFor(() => expect(reactory.graphqlQuery).toHaveBeenCalled());

    const document = reactory.graphqlQuery.mock.calls[0][0];
    expect(document).toContain('communicatorEmailTemplates');
    // The legacy operation parses `content` as JSON and cannot represent these rows.
    expect(document).not.toMatch(/query\s+CommunicatorTemplates\b/);
  });

  it('uses a fetch policy that client.query() accepts', async () => {
    // `cache-and-network` is a watchQuery/useQuery policy. Passing it to
    // `client.query()` throws Apollo invariant 16, whose message names neither the
    // policy nor the call — the page just renders "An error occurred!".
    const reactory = makeReactory([view()]);
    renderPage(reactory);

    await waitFor(() => expect(reactory.graphqlQuery).toHaveBeenCalled());

    const options = reactory.graphqlQuery.mock.calls[0][2] || {};
    expect(options.fetchPolicy).not.toBe('cache-and-network');
    expect(['cache-first', 'network-only', 'no-cache', 'cache-only']).toContain(
      options.fetchPolicy,
    );
  });

  it('marks a file-backed body and an inline subject differently', async () => {
    renderPage(makeReactory([view()]));

    await waitFor(() => expect(screen.getByText('Subject: inline')).toBeInTheDocument());
    expect(screen.getByText('Body: file')).toBeInTheDocument();
  });

  it('flags a detached element so a fork from the shipped file is visible', async () => {
    const detached = view({
      body: {
        ...view().body,
        source: '<div>inline</div>',
        isFileBacked: false,
        isDetached: true,
      },
    });

    renderPage(makeReactory([detached]));

    await waitFor(() =>
      expect(screen.getByText('Body: inline (detached)')).toBeInTheDocument(),
    );
  });

  it('warns when an element is missing rather than showing an empty cell', async () => {
    renderPage(makeReactory([view({ subject: null })]));

    await waitFor(() => expect(screen.getByText('Subject: none')).toBeInTheDocument());
  });

  it('shows the scope level', async () => {
    renderPage(makeReactory([view({ organizationId: 'org-1' })]));

    await waitFor(() => expect(screen.getByText('Organization')).toBeInTheDocument());
  });

  it('says so when no templates exist, and distinguishes that from no search results', async () => {
    renderPage(makeReactory([]));

    await waitFor(() =>
      expect(screen.getByText(/No email templates are configured/i)).toBeInTheDocument(),
    );
  });

  it('surfaces a GraphQL error instead of an empty list', async () => {
    renderPage(makeReactory([], { error: 'User does not have permissions' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/does not have permissions/i),
    );
  });

  it('surfaces a thrown request failure', async () => {
    renderPage(makeReactory([], { reject: true, error: 'Network down' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Network down/i));
  });
});
