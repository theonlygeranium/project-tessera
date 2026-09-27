import { rectangular, type TableContent } from '../model';
import styles from './players.module.css';

export function TablePlayer({ value }: { value: TableContent }) {
  const rows = rectangular(value.rows);
  const body = value.headerRow ? rows.slice(1) : rows;
  const label = value.caption.trim() || 'Table';
  return <div className={styles.scroll} tabIndex={0} role="region" aria-label={label}>
    <table className={styles.table}>
      <caption>{value.caption}</caption>
      {value.headerRow && <thead><tr>{rows[0].map((cell, index) => <th key={index} scope="col">{cell}</th>)}</tr></thead>}
      <tbody>
        {body.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}
      </tbody>
    </table>
  </div>;
}
