/**
 * @jest-environment jsdom
 *
 * Hook-level guarantees the drawer tests cannot see.
 *
 * Review found that the drawer's `key={element.id}` was doing the work that
 * `useElementDraft`'s docblock claimed for itself: deleting the hook's reset logic
 * left every test green. These tests exercise the hooks directly, so the guarantee
 * is pinned where it is implemented rather than where it happens to be masked.
 *
 * The same applies to the preview: the drawer renders mocked HTML for any input, so
 * a sequence-guard regression (or a response landing for source that was cleared)
 * was invisible. Those are the races below.
 */
import { act, waitFor } from '@testing-library/react';
// React 17 + @testing-library/react v12: renderHook ships separately.
import { renderHook } from '@testing-library/react-hooks';

import { useElementDraft } from '../email-templates/hooks/useElementDraft';
import { useTemplatePreview } from '../communicator/hooks/useTemplatePreview';

const element = (overrides: any = {}) => ({
  id: 'sub-1',
  role: 'subject',
  format: 'text',
  source: 'baseline subject',
  name: 'Subject',
  isFileBacked: false,
  isDetached: false,
  enabled: true,
  ...overrides,
});

/** A promise whose settlement the test controls. */
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const previewPayload = (html: string) => ({
  data: {
    communicatorPreviewEmailTemplate: {
      success: true,
      preview: { role: 'body', html },
      error: null,
    },
  },
});

describe('useElementDraft — draft isolation', () => {
  it("switches drafts with the element, never pairing one element's draft with another's id", () => {
    // Before the fix this produced a commit of { body-1, 'EDITED SUBJECT' }; a save
    // there would have written the subject's content over the body document.
    const reactory = { graphqlMutation: jest.fn() };

    const { result, rerender } = renderHook(
      ({ el }: any) => useElementDraft(reactory, el),
      { initialProps: { el: element() } },
    );

    act(() => result.current.setDraft('EDITED SUBJECT'));

    // Every intermediate value the hook exposes must belong to the new element.
    rerender({ el: element({ id: 'body-1', role: 'body', source: '$ref://body.ejs' }) });

    expect(result.current.draft).toBe('$ref://body.ejs');
    expect(result.current.dirty).toBe(false);
  });

  it('keeps a keystroke typed AFTER a switch (the reverse direction)', async () => {
    // `current` is derived and never written back, so after a switch the raw state is
    // still keyed to the previous element. `setDraft`'s mismatch branch re-keys it.
    // Remove that branch and every keystroke on the newly-shown element is dropped —
    // silently, with the suite still green before this test existed.
    const reactory = { graphqlMutation: jest.fn() };

    const { result, rerender } = renderHook(
      ({ el }: any) => useElementDraft(reactory, el),
      { initialProps: { el: element() } },
    );

    rerender({ el: element({ id: 'body-1', role: 'body', source: 'BODY BASELINE' }) });
    act(() => result.current.setDraft('typed into body'));

    expect(result.current.draft).toBe('typed into body');
    expect(result.current.dirty).toBe(true);
  });

  it('does not let a save carry a previous element id', async () => {
    const graphqlMutation = jest.fn().mockResolvedValue({
      data: {
        communicatorSaveTemplateElement: {
          success: true,
          outcome: 'saved',
          element: { id: 'body-1', source: 'body content', isFileBacked: false, isDetached: false },
          error: null,
        },
      },
    });
    const reactory = { graphqlMutation };

    const { result, rerender } = renderHook(
      ({ el }: any) => useElementDraft(reactory, el),
      { initialProps: { el: element() } },
    );

    act(() => result.current.setDraft('EDITED SUBJECT'));
    rerender({ el: element({ id: 'body-1', role: 'body', source: 'body content' }) });

    await act(async () => {
      await result.current.save();
    });

    expect(graphqlMutation.mock.calls[0][1].input).toMatchObject({
      elementId: 'body-1',
      source: 'body content',
    });
  });

  it('sends detach explicitly, so a stricter schema cannot silently break saving', async () => {
    const graphqlMutation = jest.fn().mockResolvedValue({
      data: {
        communicatorSaveTemplateElement: {
          success: true,
          outcome: 'saved',
          element: { id: 'sub-1', source: 'x', isFileBacked: false, isDetached: false },
          error: null,
        },
      },
    });

    const { result } = renderHook(() => useElementDraft({ graphqlMutation } as any, element()));
    act(() => result.current.setDraft('x'));

    await act(async () => {
      await result.current.save();
    });

    const input = graphqlMutation.mock.calls[0][1].input;
    // Present and false, not omitted: `detach: Boolean!` would reject an absent key.
    expect(input).toHaveProperty('detach');
    expect(input.detach).toBe(false);
  });
});

describe('useElementDraft — adopting the server element', () => {
  it('stops calling a detached element file-backed', async () => {
    // THE regression: after a detach the pane kept warning "read from a file" and
    // re-sent detach:true, because only `source` was adopted.
    const graphqlMutation = jest.fn().mockResolvedValue({
      data: {
        communicatorSaveTemplateElement: {
          success: true,
          outcome: 'detached-and-saved',
          element: {
            id: 'body-1',
            role: 'body',
            format: 'html',
            source: '<p>inline now</p>',
            isFileBacked: false,
            isDetached: true,
          },
          error: null,
        },
      },
    });

    const { result } = renderHook(() =>
      useElementDraft(
        { graphqlMutation } as any,
        element({ id: 'body-1', role: 'body', source: '$ref://body.ejs', isFileBacked: true }),
      ),
    );

    act(() => result.current.setDraft('<p>inline now</p>'));
    expect(result.current.requiresDetach).toBe(true);

    await act(async () => {
      await result.current.save({ detach: true });
    });

    expect(result.current.requiresDetach).toBe(false);
    expect(result.current.currentElement?.isFileBacked).toBe(false);
    expect(result.current.currentElement?.isDetached).toBe(true);

    // A second edit must NOT ask to detach again.
    act(() => result.current.setDraft('<p>inline again</p>'));
    expect(result.current.requiresDetach).toBe(false);
  });
});

describe('useElementDraft — state that must not leak between elements', () => {
  it('does not show one element save error on another', async () => {
    // `draft`, `dirty` and `requiresDetach` recover on a switch; the alerts did not,
    // so a refusal from the subject appeared under the body editor.
    const graphqlMutation = jest.fn().mockResolvedValue({
      data: {
        communicatorSaveTemplateElement: {
          success: false,
          outcome: null,
          element: null,
          error: { code: 'TEMPLATE_ELEMENT_EMPTY', message: 'REFUSAL FROM THE SUBJECT' },
        },
      },
    });

    const { result, rerender } = renderHook(
      ({ el }: any) => useElementDraft({ graphqlMutation } as any, el),
      { initialProps: { el: element() } },
    );

    act(() => result.current.setDraft('something'));
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.error).toContain('REFUSAL FROM THE SUBJECT');

    rerender({ el: element({ id: 'body-1', role: 'body', source: 'BODY' }) });

    expect(result.current.error).toBeNull();
  });

  it('does not attribute a save outcome to the element the operator switched to', async () => {
    const pending = deferred<any>();
    const graphqlMutation = jest.fn().mockReturnValue(pending.promise);

    const { result, rerender } = renderHook(
      ({ el }: any) => useElementDraft({ graphqlMutation } as any, el),
      { initialProps: { el: element() } },
    );

    act(() => result.current.setDraft('edited'));
    let saving: Promise<any>;
    act(() => {
      saving = result.current.save();
    });

    rerender({ el: element({ id: 'body-1', role: 'body', source: 'BODY' }) });

    await act(async () => {
      pending.resolve({
        data: {
          communicatorSaveTemplateElement: {
            success: true,
            outcome: 'detached-and-saved',
            element: { id: 'sub-1', source: 'edited', isFileBacked: false, isDetached: true },
            error: null,
          },
        },
      });
      await saving!;
    });

    // The body never saw that conversion.
    expect(result.current.lastOutcome).toBeNull();
  });

  it('drops a stale adoption when the host refreshes the element', async () => {
    // After a detach the hook adopts isFileBacked:false. If the element is restored
    // to a $ref elsewhere and the host refreshes, keeping the adoption would leave
    // the editor believing it is inline and unable to save.
    const graphqlMutation = jest.fn().mockResolvedValue({
      data: {
        communicatorSaveTemplateElement: {
          success: true,
          outcome: 'detached-and-saved',
          element: {
            id: 'body-1',
            role: 'body',
            format: 'html',
            source: '<p>inline</p>',
            isFileBacked: false,
            isDetached: true,
            updatedAt: '2026-11-06T10:00:00.000Z',
          },
          error: null,
        },
      },
    });

    const original = element({
      id: 'body-1',
      role: 'body',
      source: '$ref://body.ejs',
      isFileBacked: true,
      updatedAt: '2026-11-06T09:00:00.000Z',
    });

    const { result, rerender } = renderHook(
      ({ el }: any) => useElementDraft({ graphqlMutation } as any, el),
      { initialProps: { el: original } },
    );

    act(() => result.current.setDraft('<p>inline</p>'));
    await act(async () => {
      await result.current.save({ detach: true });
    });
    expect(result.current.currentElement?.isFileBacked).toBe(false);

    // Host refresh: new updatedAt, still file-backed (restored to the pointer).
    rerender({
      el: element({
        id: 'body-1',
        role: 'body',
        source: '$ref://body.ejs',
        isFileBacked: true,
        updatedAt: '2026-11-06T11:00:00.000Z',
      }),
    });

    expect(result.current.currentElement?.isFileBacked).toBe(true);
  });

  it('recovers when the server says file-backed but the props said inline', async () => {
    // Otherwise the operator gets error text and no route to the detach dialog: the
    // prompt is only reachable through requiresDetach.
    const graphqlMutation = jest.fn().mockResolvedValue({
      data: {
        communicatorSaveTemplateElement: {
          success: false,
          outcome: null,
          element: null,
          error: { code: 'TEMPLATE_ELEMENT_FILE_BACKED', message: 'This body is a file reference.' },
        },
      },
    });

    const { result } = renderHook(() =>
      useElementDraft(
        { graphqlMutation } as any,
        // Props claim inline; the server disagrees.
        element({ id: 'body-1', role: 'body', source: 'looks inline', isFileBacked: false }),
      ),
    );

    act(() => result.current.setDraft('an edit'));
    expect(result.current.requiresDetach).toBe(false);

    await act(async () => {
      await result.current.save();
    });

    // The next Save must ask to detach instead of repeating the same refusal.
    expect(result.current.requiresDetach).toBe(true);
  });
});

describe('useTemplatePreview — races', () => {
  it('does not let a response for cleared source repopulate the pane', async () => {
    // THE regression review found: the empty-source branch returned without bumping
    // the sequence, so an in-flight render landed under an empty editor and reported
    // stale=false — the pane asserting it was current.
    const first = deferred<any>();
    const graphqlMutation = jest.fn().mockReturnValue(first.promise);
    const reactory = { graphqlMutation };

    const { result, rerender } = renderHook(
      ({ source }: any) =>
        // A LONG debounce is deliberate. With `debounceMs: 0` the empty-draft
        // branch fires on its own timer and can invalidate the request before the
        // fixture resolves — which masked a regression in the teardown bump roughly
        // a third of the time. At 500 ms nothing re-runs before the stale response
        // lands, so only SYNCHRONOUS invalidation (the effect teardown) can save it.
        useTemplatePreview(reactory, { source, debounceMs: 500 }),
      { initialProps: { source: 'ALPHA' } },
    );

    await waitFor(() => expect(graphqlMutation).toHaveBeenCalledTimes(1));

    // Operator selects all and deletes while the render is in flight, and the
    // stale response arrives before any debounce could settle.
    rerender({ source: '' });
    expect(result.current.preview).toBeNull();

    await act(async () => {
      first.resolve(previewPayload('<p>ALPHA - NO LONGER IN THE EDITOR</p>'));
      await first.promise;
    });

    // The invariant: the stale render must NOT appear. Deterministic only because
    // the effect teardown bumped the sequence synchronously.
    expect(result.current.preview).toBeNull();
    expect(result.current.stale).toBe(false);
  });

  it('keeps the newest result when two renders overlap', async () => {
    const slowA = deferred<any>();
    const fastB = deferred<any>();
    const graphqlMutation = jest
      .fn()
      .mockReturnValueOnce(slowA.promise)
      .mockReturnValueOnce(fastB.promise);

    const reactory = { graphqlMutation };
    const { result, rerender } = renderHook(
      ({ source }: any) => useTemplatePreview(reactory, { source, debounceMs: 0 }),
      { initialProps: { source: 'A' } },
    );

    await waitFor(() => expect(graphqlMutation).toHaveBeenCalledTimes(1));
    rerender({ source: 'B' });
    await waitFor(() => expect(graphqlMutation).toHaveBeenCalledTimes(2));

    // Newest resolves first, then the older one arrives late.
    await act(async () => {
      fastB.resolve(previewPayload('<p>B</p>'));
      await fastB.promise;
    });
    await act(async () => {
      slowA.resolve(previewPayload('<p>A - STALE</p>'));
      await slowA.promise;
    });

    expect(result.current.preview?.html).toBe('<p>B</p>');
  });

  it('makes no request while disabled, and exactly one when enabled', async () => {
    const graphqlMutation = jest.fn().mockResolvedValue(previewPayload('<p>x</p>'));
    const reactory = { graphqlMutation };

    const { rerender } = renderHook(
      ({ enabled }: any) =>
        useTemplatePreview(reactory, { source: 'draft', debounceMs: 0, enabled }),
      { initialProps: { enabled: false } },
    );

    // A hidden editor must not spend a render per keystroke.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(graphqlMutation).toHaveBeenCalledTimes(0);

    rerender({ enabled: true });
    await waitFor(() => expect(graphqlMutation).toHaveBeenCalledTimes(1));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(graphqlMutation).toHaveBeenCalledTimes(1);
  });

  it('is not "stale" before it has rendered anything', async () => {
    const graphqlMutation = jest.fn().mockResolvedValue(previewPayload('<p>x</p>'));
    const { result } = renderHook(() =>
      useTemplatePreview({ graphqlMutation } as any, { source: 'draft', debounceMs: 500 }),
    );

    // Nothing has been asked for yet; showing "out of date" beside an empty pane is
    // noise on every open.
    expect(result.current.preview).toBeNull();
    expect(result.current.stale).toBe(false);
  });
});
