import { useCallback, useEffect, useRef, useState } from 'react';

import { COMMUNICATOR_EMAIL_TEMPLATES } from '../graphql';
import type { IEmailTemplateFilter, IEmailTemplateView } from '../types';

export interface UseEmailTemplatesResult {
  templates: IEmailTemplateView[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Load the email template views for the caller's scope.
 *
 * The server scopes by the caller's tenant when no `clientId` is given, so the
 * page does not need to know its own client id — and cannot ask for another
 * tenant's templates by guessing one.
 *
 * `network-only` rather than `cache-first`: an operator who has just saved a
 * template expects the list to reflect it. That is the opposite trade-off to
 * `useSqlConnections`, where the list is fixed for a session.
 *
 * NOT `cache-and-network`: that policy belongs to `watchQuery`/`useQuery`, and
 * `client.query()` throws `invariant(... , 16)` — "An error occurred! For more
 * details, see the full error text at https://go.apollo.dev/c/err" — if you pass
 * it. The error names no field and no cause, which is why it is called out here.
 *
 * A request sequence number means a slow first response can never overwrite a
 * newer one.
 */
export const useEmailTemplates = (
  reactory: any,
  filter: IEmailTemplateFilter = {},
): UseEmailTemplatesResult => {
  const [templates, setTemplates] = useState<IEmailTemplateView[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef<boolean>(true);
  const sequenceRef = useRef<number>(0);
  const filterKey = JSON.stringify(filter);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!reactory || typeof reactory.graphqlQuery !== 'function') {
      setError('The Reactory API is not available; cannot load email templates.');
      return;
    }

    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;

    setLoading(true);
    setError(null);

    try {
      const result: any = await reactory.graphqlQuery(
        COMMUNICATOR_EMAIL_TEMPLATES,
        { filter: JSON.parse(filterKey) },
        { fetchPolicy: 'network-only' },
      );

      if (sequenceRef.current !== sequence || mountedRef.current === false) return;

      const errors = result?.errors || [];
      if (errors.length > 0) {
        setError(errors[0]?.message || 'Failed to load email templates.');
        return;
      }

      const list = result?.data?.communicatorEmailTemplates;
      setTemplates(Array.isArray(list) ? list : []);
    } catch (err: any) {
      if (sequenceRef.current !== sequence || mountedRef.current === false) return;
      setError(err?.message || 'Failed to load email templates.');
    } finally {
      if (sequenceRef.current === sequence && mountedRef.current !== false) {
        setLoading(false);
      }
    }
  }, [reactory, filterKey]);

  useEffect(() => {
    load();
  }, [load]);

  return { templates, loading, error, reload: load };
};

export default useEmailTemplates;
