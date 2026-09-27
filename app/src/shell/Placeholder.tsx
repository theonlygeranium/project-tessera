// Temporary page for routes a Night 1 lane hasn't built yet.
import { TopBar } from '../components';
import { usePageTitle } from './usePageTitle';

export function Placeholder({ title, lane }: { title: string; lane: string }) {
  usePageTitle(title);
  return (
    <>
      <TopBar title={title} eyebrow="Night 1" />
      <p className="muted">This page is being built in {lane}.</p>
    </>
  );
}
