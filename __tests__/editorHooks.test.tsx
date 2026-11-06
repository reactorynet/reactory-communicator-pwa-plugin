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
        useTemplatePreview(reactory, { source, debounceMs: 0 }),
      { initialProps: { source: 'ALPHA' } },
    );

    await waitFor(() => expect(graphqlMutation).toHaveBeenCalledTimes(1));

    // Operator selects all and deletes while the render is in flight.
    rerender({ source: '' });
    expect(result.current.preview).toBeNull();

    await act(async () => {
      first.resolve(previewPayload('<p>ALPHA - NO LONGER IN THE EDITOR</p>'));
      await first.promise;
    });

    // The invariant: the stale render must NOT appear.
    expect(result.current.preview).toBeNull();

    // Let the zero-delay debounce for the empty draft settle. `loading` is
    // cleared either by that branch or by the stale request's own finally — the
    // point is that it cannot stay stuck once both have run.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(result.current.preview).toBeNull();
    expect(result.current.loading).toBe(false);
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
