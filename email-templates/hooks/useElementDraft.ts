import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  COMMUNICATOR_SAVE_TEMPLATE_ELEMENT,
  TEMPLATE_EDITOR_ERRORS,
} from '../../communicator/graphql';
import type { IEmailTemplateElement } from '../../communicator/types';

export interface SaveElementResult {
  ok: boolean;
  /** `saved` | `detached-and-saved`, when the server accepted the write. */
  outcome?: string;
  /** Server error code, when it refused. */
  code?: string;
  message?: string;
}

export interface UseElementDraftResult {
  draft: string;
  setDraft: (value: string) => void;
  /** The draft differs from what the server last accepted. */
  dirty: boolean;
  saving: boolean;
  error: string | null;
  clearError: () => void;
  /** True when saving would convert a `$ref://` pointer to inline content. */
  requiresDetach: boolean;
  save: (options?: { detach?: boolean }) => Promise<SaveElementResult>;
  revert: () => void;
  /** Outcome of the last successful save, e.g. `detached-and-saved`. */
  lastOutcome: string | null;
  /**
   * The element as the server last described it.
   *
   * `undefined` until a save succeeds. It differs from the `element` argument in the
   * one way that matters here: after a detach the server returns
   * `isFileBacked: false`, and without adopting that the editor keeps warning about
   * a file it no longer reads and asks to detach a second time.
   */
  currentElement: IEmailTemplateElement | null | undefined;
}

interface DraftState {
  elementId: string | undefined;
  draft: string;
  accepted: string;
}

/**
 * Draft state for one template element.
 *
 * ## The detach rule
 *
 * A `$ref://` element's `source` is a pointer to a file in the repository, not
 * content. The server refuses to overwrite one unless the caller passes
 * `detach: true`, and this hook surfaces that as `requiresDetach` so the UI can ask
 * first. Saving without asking would silently fork the shipped template for one
 * application, with the file left on disk and no record anywhere that it is no
 * longer in use.
 *
 * ## Why the state is keyed during render, not in an effect
 *
 * An effect that resets on `[elementId, baseline]` produces one commit in which the
 * NEW element's id is paired with the PREVIOUS element's draft. Save in that commit
 * writes one element's content to another document — the worst possible outcome
 * here. Deriving during render closes the window entirely:
 *
 *     const current = state.elementId === elementId ? state : freshState()
 *
 * The drawer also remounts each editor per element id, so it was never exposed;
 * but `useElementDraft` and `ElementEditor` are exported for hosts, and a host that
 * renders `ElementEditor` without a key gets the bug. Relying on a caller's `key`
 * for correctness is not a contract.
 *
 * It also fixes the second failure the effect caused: when a host refreshed the
 * element after a save, a *dirty* draft was silently replaced by the saved baseline,
 * the dirty indicator cleared, and the close guard stopped firing.
 */
export const useElementDraft = (
  reactory: any,
  element: IEmailTemplateElement | null | undefined,
): UseElementDraftResult => {
  const baseline = element?.source ?? '';
  const elementId = element?.id;

  const freshState = useCallback(
    (): DraftState => ({ elementId, draft: baseline, accepted: baseline }),
    [elementId, baseline],
  );

  const [state, setState] = useState<DraftState>(freshState);

  /**
   * Element as the server last described it, adopted after a save.
   *
   * Scoped to the id it was returned for, so a stale adoption cannot leak onto a
   * different element.
   */
  const [savedElement, setSavedElement] = useState<IEmailTemplateElement | null | undefined>(
    undefined,
  );


  const [saving, setSaving] = useState<boolean>(false);

  /**
   * Alerts are keyed to the element that produced them.
   *
   * The draft was hardened for a keyless host; these were not, so a failed save on
   * the subject showed its error on the body, and a save that resolved after a
   * switch attributed its outcome to the other element.
   */
  const [errorState, setErrorState] = useState<{ elementId: string | undefined; message: string } | null>(null);
  const [outcomeState, setOutcomeState] = useState<{ elementId: string | undefined; outcome: string } | null>(null);

  const error = errorState?.elementId === elementId ? errorState.message : null;
  const lastOutcome = outcomeState?.elementId === elementId ? outcomeState.outcome : null;
  const setError = useCallback(
    (message: string | null) => setErrorState(message === null ? null : { elementId, message }),
    [elementId],
  );
  const setLastOutcome = useCallback(
    (outcome: string | null) => setOutcomeState(outcome === null ? null : { elementId, outcome }),
    [elementId],
  );

  /**
   * A host that refreshes the prop for the same id has newer truth than our local
   * adoption — drop it, or a `$ref` restored elsewhere leaves the editor believing
   * the element is inline and unable to save.
   */
  useEffect(() => {
    setSavedElement(undefined);
  }, [elementId, element?.updatedAt]);

  const mountedRef = useRef<boolean>(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** Derive, don't sync. See the docblock. */
  /**
   * Keyed comparison, with a string check: two elements that both lack an id would
   * otherwise compare equal (`undefined === undefined`) and share one draft.
   */
  const sameElement = typeof elementId === 'string' && state.elementId === elementId;
  const current = sameElement ? state : freshState();
  const draft = current.draft;
  const acceptedSource = current.accepted;

  const currentElement =
    savedElement && savedElement.id === elementId ? savedElement : element;

  const dirty = draft !== acceptedSource;
  const requiresDetach = Boolean(currentElement?.isFileBacked) && dirty;

  const setDraft = useCallback(
    (value: string) => {
      setState((previous) => {
        const base = previous.elementId === elementId ? previous : freshState();
        return { ...base, draft: value };
      });
      setError(null);
    },
    [elementId, freshState],
  );

  const save = useCallback(
    async (options: { detach?: boolean } = {}): Promise<SaveElementResult> => {
      if (!elementId) {
        return { ok: false, message: 'This element has no id; it cannot be saved.' };
      }

      if (draft.trim().length === 0) {
        // The server rejects this too; failing locally avoids a pointless round trip
        // and keeps the message next to the field.
        setError('An element cannot be empty: it would render as an empty email.');
        return { ok: false, code: TEMPLATE_EDITOR_ERRORS.EMPTY, message: 'Empty content' };
      }

      if (!reactory || typeof reactory.graphqlMutation !== 'function') {
        setError('The Reactory API is not available; cannot save.');
        return { ok: false, message: 'API unavailable' };
      }

      setSaving(true);
      setError(null);

      try {
        // `detach` is always sent. The schema field is nullable so omitting it works
        // today, but a later tightening to `Boolean!` would make every inline save
        // fail variable validation — a silent, total loss of saving.
        const result: any = await reactory.graphqlMutation(COMMUNICATOR_SAVE_TEMPLATE_ELEMENT, {
          input: { elementId, source: draft, detach: options.detach === true },
        });

        if (mountedRef.current === false) return { ok: false, message: 'Unmounted' };

        const errors = result?.errors || [];
        if (errors.length > 0) {
          const message = errors[0]?.message || 'Failed to save the element.';
          setError(message);
          return { ok: false, message };
        }

        const payload = result?.data?.communicatorSaveTemplateElement;

        if (!payload?.success) {
          const code = payload?.error?.code;
          const message = payload?.error?.message || 'Failed to save the element.';
          setError(message);

          /**
           * The server refused because the element is file-backed while our props
           * said inline. Adopting a file-backed element arms the detach prompt, so
           * the next Save asks instead of dead-ending on an error the operator has
           * no way to act on.
           *
           * One mechanism, not two: an earlier `forceDetach` flag sat beside this and
           * was provably redundant — removing it changed nothing the tests could see.
           */
          if (code === TEMPLATE_EDITOR_ERRORS.FILE_BACKED && currentElement) {
            setSavedElement({ ...currentElement, isFileBacked: true });
          }

          return { ok: false, code, message };
        }

        const savedSource = payload?.element?.source ?? draft;

        setState({ elementId, draft: savedSource, accepted: savedSource });
        setLastOutcome(payload?.outcome ?? 'saved');

        /**
         * Adopt the server's view of the element wholesale.
         *
         * `describeElement()` runs after `document.save()`, so this is the freshest
         * description in the system, and the mutation now selects every field of the
         * contract (see `communicator/graphql.ts`) — a merge is unnecessary and a
         * partial merge is a class of bug this avoids entirely.
         *
         * `isFileBacked` is the field that changes on a detach; without adopting it
         * the pane keeps warning about a file the element no longer reads and offers
         * to convert it a second time.
         */
        if (payload?.element) {
          setSavedElement(payload.element as IEmailTemplateElement);
        }

        return { ok: true, outcome: payload?.outcome };
      } catch (err: any) {
        if (mountedRef.current === false) return { ok: false, message: 'Unmounted' };
        const message = err?.message || 'Failed to save the element.';
        setError(message);
        return { ok: false, message };
      } finally {
        if (mountedRef.current !== false) setSaving(false);
      }
    },
    [reactory, elementId, draft, element],
  );

  const revert = useCallback(() => {
    setState((previous) => {
      const base = previous.elementId === elementId ? previous : freshState();
      return { ...base, draft: base.accepted };
    });
    // The conversion notice belongs to a save that is no longer the working state.
    setLastOutcome(null);
    setError(null);
  }, [elementId, freshState]);

  const clearError = useCallback(() => setError(null), []);

  return useMemo(
    () => ({
      draft,
      setDraft,
      dirty,
      saving,
      error,
      clearError,
      requiresDetach,
      save,
      revert,
      lastOutcome,
      currentElement,
    }),
    [
      draft,
      setDraft,
      dirty,
      saving,
      error,
      clearError,
      requiresDetach,
      save,
      revert,
      lastOutcome,
      currentElement,
    ],
  );
};

export default useElementDraft;
