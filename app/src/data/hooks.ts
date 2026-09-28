// React Query helpers over the API. Query keys are [operation, input].
// Night 1 keeps cache rules simple: every successful mutation invalidates all
// queries, so every screen shows fresh data after any change.
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import type { ApiError, Input, Operation, Output } from '../../../shared/api';
import { api } from './client';

type Call<K extends Operation> = (input: Input<K>) => Promise<Output<K>>;
const run = <K extends Operation>(op: K, input: Input<K>) => (api[op] as unknown as Call<K>)(input);

export function useApiQuery<K extends Operation>(
  op: K,
  input: Input<K>,
  options: Omit<UseQueryOptions<Output<K>, ApiError>, 'queryKey' | 'queryFn'> = {},
) {
  return useQuery<Output<K>, ApiError>({ queryKey: [op, input ?? null], queryFn: () => run(op, input), ...options });
}

export function useApiMutation<K extends Operation>(op: K, options: { onSuccess?: (data: Output<K>) => void } = {}) {
  const client = useQueryClient();
  return useMutation<Output<K>, ApiError, Input<K>>({
    mutationFn: (input) => run(op, input),
    // Run the caller's handler right away with the mutation's own result, and refresh
    // every query alongside. Waiting for the refresh first let a slow or restarted
    // refetch delay the handler until much later: "Switch persona" navigated to sign-in
    // after a later mutation, signing the next persona out (found by journey 9).
    onSuccess: async (data) => {
      const refresh = client.invalidateQueries();
      options.onSuccess?.(data);
      await refresh;
    },
  });
}

export { api };
