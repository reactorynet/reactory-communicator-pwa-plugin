import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { COMMUNICATOR_SAVE_TEMPLATE_ELEMENT, TEMPLATE_EDITOR_ERRORS } from '../../communicator/graphql';
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
}

/**
 * Draft state for one template element.
 *
 * ## The detach rule
 *
 * A `$ref://` element's `source` is a pointer to a file in the repository, not
 * content. The server refuses to overwrite one unless the caller passes
 * `detach: true`, and this hook surfaces that as `requiresDetach` so the UI can
 * ask first. Saving without asking would silently fork the shipped template for
 * one application, with the file left on disk and no record anywhere that it is no
 * longer in use.
 *
 * `save({ detach: true })` performs the conversion; the server records
 * `props.detachedFromRef` so the fork stays visible.
 *
 * ## Why the baseline moves on success
 *
 * `dirty` is measured against what the server last accepted, not against mount-time
 * props. Without that, a successful save still looks dirty, and closing the drawer
 * would prompt about changes that were already written.
 */
export const useElementDraft = (
  reactory: any,
  element: IEmailTemplateElement | null | undefined,
): UseElementDraftResult => {
  const baseline = element?.source ?? '';
  const elementId = element?.id;

  const [draft, setDraftState] = useState<string>(baseline);
  const [acceptedSource, setAcceptedSource] = useState<string>(baseline);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastOutcome, setLastOutcome] = useState<string | null>(null);

  const mountedRef = useRef<boolean>(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * A different element means a different draft. Keyed on id so switching tabs does
   * not carry one element's edits into another — the bug that would be worst here,
   * because it would write them to the wrong document.
   */
  useEffect(() => {
    setDraftState(baseline);
    setAcceptedSource(baseline);
    setError(null);
    setLastOutcome(null);
  }, [elementId, baseline]);

  const setDraft = useCallback((value: string) => {
    setDraftState(value);
    setError(null);
  }, []);

  const dirty = draft !== acceptedSource;
  const requiresDetach = Boolean(element?.isFileBacked) && dirty;

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
        const input: Record<string, any> = { elementId, source: draft };
        if (options.detach === true) input.detach = true;

        const result: any = await reactory.graphqlMutation(COMMUNICATOR_SAVE_TEMPLATE_ELEMENT, {
          input,
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
          return { ok: false, code, message };
        }

        const savedSource = payload?.element?.source ?? draft;

        setAcceptedSource(savedSource);
        setDraftState(savedSource);
        setLastOutcome(payload?.outcome ?? 'saved');

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
    [reactory, elementId, draft],
  );

  const revert = useCallback(() => {
    setDraftState(acceptedSource);
    setError(null);
  }, [acceptedSource]);

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
    }),
    [draft, setDraft, dirty, saving, error, clearError, requiresDetach, save, revert, lastOutcome],
  );
};

export default useElementDraft;
