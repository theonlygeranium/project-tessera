// Shared loading and error states for pages.
import type { ApiError } from '../../../shared/api';
import { Button, StatusNotice } from '../components';

export function Loading({ label = 'Loading' }: { label?: string }) {
  return <p role="status" className="loading">{label}…</p>;
}

export function ErrorNotice({ error, onRetry }: { error: ApiError | Error | null; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <StatusNotice
      tone="error"
      title="Something went wrong"
      action={onRetry ? <Button density="compact" onClick={onRetry}>Try again</Button> : undefined}
    >
      {error.message}
    </StatusNotice>
  );
}
