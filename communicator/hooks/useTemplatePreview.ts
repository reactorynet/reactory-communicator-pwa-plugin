import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { COMMUNICATOR_PREVIEW_EMAIL_TEMPLATE } from '../graphql';

export interface IEmailTemplatePreviewResult {
  role: string;
  subject?: string | null;
  text?: string | null;
  html?: string | null;
}

export interface UseTemplatePreviewOptions {
  /** A stored element to preview. Ignored when `source` is supplied. */
  elementId?: string;
  /** Unsaved draft source. Takes precedence over `elementId`. */
  source?: string;
  /** Supplies sample data server-side, e.g. a reset link for `password_reset`. */
  purpose?: string;
  templateVars?: Record<string, any>;
  /** Debounce for draft edits. Default 500 ms. */
  debounceMs?: number;
  /**
   * When false, no request is made.
   *
   * The drawer keeps every element's editor mounted so a draft survives a tab
   * switch, which means hidden editors would otherwise each fire a preview. Only
   * the visible one should.
   */
  enabled?: boolean;
}

export interface UseTemplatePreviewResult {
  preview: IEmailTemplatePreviewResult | null;
  loading: boolean;
  /** Server-reported failure, shown verbatim. */
  error: string | null;
  /**
   * True while the shown preview does not correspond to the current source.
   *
   * The operator needs this: a preview that silently lags behind the editor is
   * worse than one that admits it is out of date.
   */
  stale: boolean;
  refresh: () => void;
}

/**
 * Render email source through the server.
 *
 * Preview is computed **server-side** on purpose. `$ref://` resolution, the `t()`
 * translator and the tenant scope all live there, so a client-side render would
 * show the operator something the recipient will not get — and the moment that
 * happens the preview stops being evidence.
 *
 * Two guards:
 *
 *  - **debounce.** A request per keystroke is wasteful and races itself. Draft
 *    edits settle for `debounceMs` before a request goes out; a stored element
 *    previews immediately.
 *  - **sequence number.** A slow earlier response must never overwrite a newer
 *    one. Without it, the preview can settle on a result for source the operator
 *    has already replaced.
 */
export const useTemplatePreview = (
  reactory: any,
  options: UseTemplatePreviewOptions,
): UseTemplatePreviewResult => {
  const { elementId, source, purpose, templateVars, debounceMs = 500, enabled = true } = options;

  // The request identity: unsaved source wins, because that is what the operator
  // is looking at.
  const sourceKey = typeof source === 'string' ? source : '';
  const useDraft = typeof source === 'string';

  const [preview, setPreview] = useState<IEmailTemplatePreviewResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [renderedKey, setRenderedKey] = useState<string | null>(null);
  const [manualNonce, setManualNonce] = useState<number>(0);

  const mountedRef = useRef<boolean>(true);
  const sequenceRef = useRef<number>(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** Identity of what the current preview represents. */
  const requestKey = useMemo(
    () => (useDraft ? `draft:${sourceKey}` : `element:${elementId || ''}`),
    [useDraft, sourceKey, elementId],
  );

  const variablesKey = useMemo(() => JSON.stringify(templateVars || {}), [templateVars]);

  const run = useCallback(async () => {
    if (!reactory || typeof reactory.graphqlMutation !== 'function') {
      setError('The Reactory API is not available; cannot render a preview.');
      return;
    }

    if (useDraft && sourceKey.trim().length === 0) {
      // Nothing to render yet. Clearing beats showing the previous element's output
      // next to an empty editor.
      //
      // Bumping the sequence is load-bearing: without it an in-flight request for
      // the source the operator just deleted still passes the guard below and
      // repopulates the pane — and `stale` says false, so the pane asserts it is
      // current. That is the exact failure this hook exists to prevent.
      sequenceRef.current += 1;
      setPreview(null);
      setError(null);
      setLoading(false);
      setRenderedKey(requestKey);
      return;
    }

    if (!useDraft && !elementId) return;

    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;

    setLoading(true);
    setError(null);

    try {
      const input: Record<string, any> = { purpose };
      if (useDraft) input.source = sourceKey;
      else input.elementId = elementId;
      if (variablesKey && variablesKey !== '{}') input.templateVars = JSON.parse(variablesKey);

      const result: any = await reactory.graphqlMutation(COMMUNICATOR_PREVIEW_EMAIL_TEMPLATE, { input });

      if (sequenceRef.current !== sequence || mountedRef.current === false) return;

      const errors = result?.errors || [];
      if (errors.length > 0) {
        setError(errors[0]?.message || 'Failed to render the preview.');
        return;
      }

      const payload = result?.data?.communicatorPreviewEmailTemplate;

      if (!payload?.success) {
        setError(payload?.error?.message || 'Failed to render the preview.');
        return;
      }

      setPreview(payload.preview || null);
      setRenderedKey(requestKey);
    } catch (err: any) {
      if (sequenceRef.current !== sequence || mountedRef.current === false) return;
      setError(err?.message || 'Failed to render the preview.');
    } finally {
      if (sequenceRef.current === sequence && mountedRef.current !== false) {
        setLoading(false);
      }
    }
  }, [reactory, useDraft, sourceKey, elementId, purpose, variablesKey, requestKey]);

  /**
   * A stored element previews immediately; a draft waits for the operator to stop
   * typing.
   */
  useEffect(() => {
    if (enabled === false) return undefined;

    if (!useDraft) {
      run();
      // Invalidate on teardown: an unmounted or suspended editor's late response
      // must not land, regardless of what the host does with the result.
      return () => {
        sequenceRef.current += 1;
      };
    }

    const timer = setTimeout(run, debounceMs);
    return () => {
      clearTimeout(timer);
      sequenceRef.current += 1;
    };
  }, [run, useDraft, debounceMs, manualNonce, enabled]);

  const refresh = useCallback(() => setManualNonce((value) => value + 1), []);

  return {
    preview,
    loading,
    error,
    // `preview !== null` matters: without it the pane shows "out of date" beside an
    // empty iframe on first render, before anything has been asked for.
    stale: preview !== null && renderedKey !== requestKey && useDraft && sourceKey.trim().length > 0,
    refresh,
  };
};

export default useTemplatePreview;
