import type { HTMLAttributes, ReactNode } from 'react';
import styles from './DataTable.module.css';
export type DataTableProps<T> = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  caption: string; hideCaption?: boolean;
  columns: { key: string; header: string; align?: 'start' | 'end'; render?: (row: T) => ReactNode }[];
  rows: T[]; rowKey: (row: T) => string;
  empty?: ReactNode; density?: 'learner' | 'compact';
};
export function DataTable<T extends object>({ caption, hideCaption, columns, rows, rowKey, empty = 'No records yet.', density = 'learner', className, ...props }: DataTableProps<T>) {
  return <div {...props} className={[styles.region, styles[density], className].filter(Boolean).join(' ')} role="region" aria-label={caption} tabIndex={0}>
    <table className={styles.table}><caption className={hideCaption ? styles.visuallyHidden : styles.caption}>{caption}</caption>
      <thead><tr>{columns.map((column) => <th key={column.key} scope="col" className={column.align === 'end' ? styles.end : undefined}>{column.header}</th>)}</tr></thead>
      <tbody>{rows.length ? rows.map((row) => <tr key={rowKey(row)}>{columns.map((column) => <td key={column.key} className={column.align === 'end' ? styles.end : undefined}>{column.render ? column.render(row) : String((row as Record<string, unknown>)[column.key] ?? '')}</td>)}</tr>) : <tr><td colSpan={columns.length}>{empty}</td></tr>}</tbody>
    </table>
  </div>;
}
