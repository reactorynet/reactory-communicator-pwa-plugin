/**
 * @jest-environment jsdom
 *
 * The template editor drawer.
 *
 * The two behaviours worth guarding here are both irreversible-if-wrong:
 *
 *  1. **Detach.** A `$ref://` element's source is a pointer to a file in the repo.
 *     Saving over it forks the shipped template for one application, and nothing
 *     looks lost afterwards because the file stays on disk. The editor must ask,
 *     and must send nothing when the operator declines.
 *  2. **Discard.** Closing with unsaved edits must not throw them away silently.
 *
 * Everything else here (tab switching, preview rendering, empty validation) exists
 * to keep those two honest.
 */
import React from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('@reactory/client-core/api', () => ({
  useReactory: () => undefined,
}));

import TemplateEditorDrawer from '../email-templates/components/TemplateEditorDrawer';

const CLIENT = '69d067c16280356ef3c5733d';

const element = (overrides: any = {}) => ({
  id: 'el-1',
  role: 'body',
  format: 'html',
  source: '<p>inline body</p>',
  name: 'Body',
  isFileBacked: false,
  refPath: null,
  refError: null,
  isDetached: false,
  enabled: true,
  ...overrides,
});

const view = (overrides: any = {}) => ({
  id: 'view-1',
  view: 'forgot-password-email',
  name: 'Forgot password email',
  description: 'Transactional',
  kind: 'email',
  channel: 'email',
  engine: 'ejs',
  status: 'published',
  enabled: true,
  visibility: 'client',
  clientId: CLIENT,
  organizationId: null,
  businessUnitId: null,
  locale: 'en',
  seeded: true,
  subject: element({
    id: 'sub-1',
    role: 'subject',
    format: 'text',
    source: 'Reset your password',
    name: 'Subject',
  }),
  body: element({
    id: 'body-1',
    role: 'body',
    source: '$ref://defaults/forgot/forgot-password-body-html.ejs',
    isFileBacked: true,
    refPath: '/data/templates/email/defaults/forgot/forgot-password-body-html.ejs',
  }),
  otherElements: [],
  ...overrides,
});

/**
 * One mock for both operations. The document string identifies which is which —
 * that also asserts the editor calls the WP-1 operations and not the legacy ones.
 */
const makeReactory = (options: { previewHtml?: string; previewError?: string; saveError?: any } = {}) => {
  const graphqlMutation = jest.fn(async (document: any, variables?: any) => {
    const text = String(document);

    if (text.includes('communicatorPreviewEmailTemplate')) {
      if (options.previewError) {
        return {
          data: {
            communicatorPreviewEmailTemplate: {
              success: false,
              preview: null,
              error: { code: 'TEMPLATE_PREVIEW_FAILED', message: options.previewError },
            },
          },
        };
      }
      return {
        data: {
          communicatorPreviewEmailTemplate: {
            success: true,
            preview: { role: 'body', html: options.previewHtml ?? '<p>rendered</p>' },
            error: null,
          },
        },
      };
    }

    if (text.includes('communicatorSaveTemplateElement')) {
      if (options.saveError) {
        return {
          data: {
            communicatorSaveTemplateElement: {
              success: false,
              outcome: null,
              element: null,
              error: options.saveError,
            },
          },
        };
      }
      const input = variables?.input ?? {};
      return {
        data: {
          communicatorSaveTemplateElement: {
            success: true,
            outcome: input.detach ? 'detached-and-saved' : 'saved',
            element: {
              id: input.elementId,
              role: 'body',
              format: 'html',
              source: input.source,
              isFileBacked: false,
              isDetached: Boolean(input.detach),
            },
            error: null,
          },
        },
      };
    }

    return { data: null };
  });

  return { graphqlMutation, graphqlQuery: jest.fn() };
};

const saveCalls = (reactory: any) =>
  reactory.graphqlMutation.mock.calls.filter((call: any[]) =>
    String(call[0]).includes('communicatorSaveTemplateElement'),
  );

const renderDrawer = (reactory: any, overrides: any = {}) => {
  const onClose = jest.fn();
  render(
    <TemplateEditorDrawer
      open
      view={view(overrides.view)}
      reactory={reactory}
      onClose={onClose}
      onSaved={overrides.onSaved}
      purpose="password_reset"
    />,
  );
  return { onClose };
};

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

describe('TemplateEditorDrawer', () => {
  it('shows a tab per element and opens on the first', async () => {
    renderDrawer(makeReactory());

    expect(screen.getByRole('tab', { name: /subject/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /body/i })).toBeInTheDocument();

    // Subject is active: its source is in the editor.
    await waitFor(() =>
      expect(screen.getByLabelText(/text source/i)).toHaveValue('Reset your password'),
    );
  });

  it('previews the draft through the server, not locally', async () => {
    const reactory = makeReactory({ previewHtml: '<p>Hello Sample</p>' });
    renderDrawer(reactory);

    await waitFor(() => {
      const previewCalls = reactory.graphqlMutation.mock.calls.filter((call: any[]) =>
        String(call[0]).includes('communicatorPreviewEmailTemplate'),
      );
      expect(previewCalls.length).toBeGreaterThan(0);
      // The draft is sent as `source`; the server owns $ref resolution and t().
      expect(previewCalls[0][1].input.source).toBe('Reset your password');
    });
  });

  it('surfaces a render failure verbatim', async () => {
    renderDrawer(makeReactory({ previewError: 't is not defined' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('t is not defined'));
  });

  it('saves an inline element without asking about detach', async () => {
    const reactory = makeReactory();
    const onSaved = jest.fn();
    renderDrawer(reactory, { onSaved });

    await waitFor(() => expect(screen.getByLabelText(/text source/i)).toBeInTheDocument());

    const editor = screen.getByLabelText(/text source/i);
    await userEvent.clear(editor);
    await userEvent.type(editor, 'New subject line');

    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(saveCalls(reactory)).toHaveLength(1));
    expect(saveCalls(reactory)[0][1].input).toEqual({
      elementId: 'sub-1',
      source: 'New subject line',
    });
    expect(saveCalls(reactory)[0][1].input.detach).toBeUndefined();
  });

  it('REFUSES to overwrite a file-backed element without confirmation', async () => {
    const reactory = makeReactory();
    renderDrawer(reactory);

    // Switch to the body, which is file-backed.
    await userEvent.click(screen.getByRole('tab', { name: /body/i }));
    await waitFor(() => expect(screen.getByLabelText(/html source/i)).toBeInTheDocument());

    const editor = screen.getByLabelText(/html source/i);
    await userEvent.clear(editor);
    await userEvent.type(editor, '<p>forked</p>');

    // The label tells the operator what saving will do.
    await userEvent.click(screen.getByRole('button', { name: /converts to inline/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/convert this body to inline content/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/\$ref:\/\/defaults\/forgot\//)).toBeInTheDocument();

    // Declining must write NOTHING.
    await userEvent.click(within(dialog).getByRole('button', { name: /keep reading the file/i }));

    expect(saveCalls(reactory)).toHaveLength(0);
  });

  it('detaches when the operator confirms', async () => {
    const reactory = makeReactory();
    renderDrawer(reactory);

    await userEvent.click(screen.getByRole('tab', { name: /body/i }));
    await waitFor(() => expect(screen.getByLabelText(/html source/i)).toBeInTheDocument());

    const editor = screen.getByLabelText(/html source/i);
    await userEvent.clear(editor);
    await userEvent.type(editor, '<p>forked</p>');

    await userEvent.click(screen.getByRole('button', { name: /converts to inline/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /convert and save/i }));

    await waitFor(() => expect(saveCalls(reactory)).toHaveLength(1));
    expect(saveCalls(reactory)[0][1].input).toMatchObject({
      elementId: 'body-1',
      source: '<p>forked</p>',
      detach: true,
    });

    // The operator is told the file is no longer in use.
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/no longer reads the file/i),
    );
  });

  it('refuses empty content without a round trip', async () => {
    const reactory = makeReactory();
    renderDrawer(reactory);

    await waitFor(() => expect(screen.getByLabelText(/text source/i)).toBeInTheDocument());
    await userEvent.clear(screen.getByLabelText(/text source/i));

    // Reverting would be the only other option; Save must stay disabled.
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
    expect(saveCalls(reactory)).toHaveLength(0);
  });

  it('surfaces a server-side save refusal', async () => {
    const reactory = makeReactory({
      saveError: { code: 'TEMPLATE_ELEMENT_FILE_BACKED', message: 'This body is a file reference.' },
    });
    renderDrawer(reactory);

    await waitFor(() => expect(screen.getByLabelText(/text source/i)).toBeInTheDocument());
    const editor = screen.getByLabelText(/text source/i);
    await userEvent.clear(editor);
    await userEvent.type(editor, 'changed');

    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    // The "unsaved changes" banner is also an alert; assert the message itself.
    await waitFor(() =>
      expect(screen.getByText(/is a file reference/i)).toBeInTheDocument(),
    );
  });

  it('guards closing while an element is dirty', async () => {
    const reactory = makeReactory();
    const { onClose } = renderDrawer(reactory);

    await waitFor(() => expect(screen.getByLabelText(/text source/i)).toBeInTheDocument());
    const editor = screen.getByLabelText(/text source/i);
    await userEvent.clear(editor);
    await userEvent.type(editor, 'edited');

    // Escape is the same `attemptClose` path the header button uses.
    await userEvent.keyboard('{Escape}');

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/discard unsaved changes/i)).toBeInTheDocument();

    // Keep editing: the drawer stays and nothing is thrown away.
    await userEvent.click(within(dialog).getByRole('button', { name: /keep editing/i }));
    expect(onClose).not.toHaveBeenCalled();

    // Discard: close is requested.
    await userEvent.keyboard('{Escape}');
    const dialog2 = await screen.findByRole('dialog');
    await userEvent.click(within(dialog2).getByRole('button', { name: /discard and close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes without prompting when nothing is dirty', async () => {
    const { onClose } = renderDrawer(makeReactory());

    await userEvent.click(screen.getByRole('button', { name: /close editor/i }));

    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByText(/discard unsaved changes/i)).not.toBeInTheDocument();
  });

  it("keeps each element's draft separate when switching tabs", async () => {
    // The failure this prevents is severe: subject edits appearing in the body
    // editor, or a save writing one element's content to another document.
    renderDrawer(makeReactory());

    await waitFor(() => expect(screen.getByLabelText(/text source/i)).toBeInTheDocument());
    const subject = screen.getByLabelText(/text source/i);
    await userEvent.clear(subject);
    await userEvent.type(subject, 'ONLY THE SUBJECT');

    await userEvent.click(screen.getByRole('tab', { name: /body/i }));
    await waitFor(() => expect(screen.getByLabelText(/html source/i)).toBeInTheDocument());

    expect(screen.getByLabelText(/html source/i)).toHaveValue(
      '$ref://defaults/forgot/forgot-password-body-html.ejs',
    );

    // And the subject edit survives the round trip.
    await userEvent.click(screen.getByRole('tab', { name: /subject/i }));
    await waitFor(() =>
      expect(screen.getByLabelText(/text source/i)).toHaveValue('ONLY THE SUBJECT'),
    );
  });

  it('marks a tab with a dot while its element is dirty', async () => {
    renderDrawer(makeReactory());

    await waitFor(() => expect(screen.getByLabelText(/text source/i)).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/text source/i), '!');

    const subjectTab = screen.getByRole('tab', { name: /subject/i });
    await waitFor(() =>
      expect(within(subjectTab).getByLabelText(/unsaved changes/i)).toBeInTheDocument(),
    );
  });
});
