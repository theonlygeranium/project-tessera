import { describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { SetupCheckList } from './SetupCheckList';

function findButton(node: ReactNode, label: string): ReactElement<{ children: ReactNode; onClick: () => void }> | null {
  if (Array.isArray(node)) return node.map(child => findButton(child, label)).find(Boolean) ?? null;
  if (!node || typeof node !== 'object' || !('props' in node)) return null;
  const element = node as ReactElement<{ children?: ReactNode; onClick?: () => void }>;
  if (element.type === 'button' && element.props.children === label) return element as ReactElement<{ children: ReactNode; onClick: () => void }>;
  return findButton(element.props.children, label);
}

describe('SetupCheckList', () => {
  it('offers a one-click fix without applying it automatically', () => {
    const patch = { categories: [] };
    const onApplyFix = vi.fn();
    const tree = SetupCheckList({ checks: [{ code: 'weights-not-100', severity: 'fix', target: '', params: { total: 95 }, fixes: [{ label: 'Scale weights to 100%', patch }] }], onApplyFix });
    expect(onApplyFix).not.toHaveBeenCalled();
    findButton(tree, 'Scale weights to 100%')?.props.onClick();
    expect(onApplyFix).toHaveBeenCalledWith(patch);
  });
});
