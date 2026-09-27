import { Button } from '../../../components';
import styles from './editors.module.css';

export function ItemActions({ label, index, count, onMove, onRemove, canRemove = count > 1, axis = 'vertical' }: {
  label: string;
  index: number;
  count: number;
  onMove: (index: number, offset: number) => void;
  onRemove: (index: number) => void;
  canRemove?: boolean;
  axis?: 'vertical' | 'horizontal';
}) {
  const back = axis === 'horizontal' ? 'left' : 'up';
  const forward = axis === 'horizontal' ? 'right' : 'down';
  return <div className={styles.toolbar}>
    <Button density="compact" disabled={index === 0} onClick={() => onMove(index, -1)}>Move {label} {back}</Button>
    <Button density="compact" disabled={index >= count - 1} onClick={() => onMove(index, 1)}>Move {label} {forward}</Button>
    <Button density="compact" disabled={!canRemove} onClick={() => onRemove(index)}>Remove {label}</Button>
  </div>;
}
