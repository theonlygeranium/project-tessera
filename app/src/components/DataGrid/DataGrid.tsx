import { memo, useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import styles from './DataGrid.module.css';

export interface GridColumn<Row> {
  key: string; band: string; bandLabel: string; header: ReactNode;
  tint?: boolean;
  ariaLabel?: (row: Row) => string;
  readOnly?: boolean; render: (row: Row, active: boolean, editing: boolean) => ReactNode;
  editValue?: (row: Row) => string;
}
export interface DataGridProps<Row> {
  caption: string; rows: Row[]; columns: GridColumn<Row>[]; rowKey: (row: Row) => string;
  rowName: (row: Row) => string; density?: 'compact' | 'comfortable';
  selectedRows?: Set<string>; onSelectRow?: (key: string) => void;
  onOpenRow?: (key: string, opener: HTMLElement) => void;
  onCommit?: (row: Row, column: GridColumn<Row>, value: string) => Promise<boolean> | boolean;
  onAction?: (action: 'excuse' | 'missing' | 'override' | 'fill' | 'select' | 'shortcuts' | 'undo', selection: { row: number; col: number; fromRow: number; fromCol: number }) => void;
  onSelectionChange?: (selection: { row: number; col: number; fromRow: number; fromCol: number }) => void;
}

type Selection = { row: number; col: number; fromRow: number; fromCol: number };
type EditState = { rowKey: string; columnKey: string; value: string };
interface GridRowProps<Row> {
  row: Row; rowIndex: number; columns: GridColumn<Row>[]; rowKey: (row: Row) => string; rowName: (row: Row) => string;
  selected: boolean; onSelectRow?: (key: string) => void; onOpenRow?: (key: string, opener: HTMLElement) => void; active: Selection; edit: EditState | null;
  setCell: (value: Selection) => void; cancelEdit: () => void; setEditValue: (value: string) => void; setMessage: (value: string) => void;
  keyDown: (event: KeyboardEvent<HTMLTableCellElement>) => void; commit: (row: number, col: number) => Promise<void>;
  focus: RefObject<HTMLTableCellElement | null>; input: RefObject<HTMLInputElement | null>; beginEdit: (rowIndex: number, colIndex: number, seed?: string) => void;
}
const GridRow = memo(function GridRow<Row>({ row, rowIndex, columns, rowKey, rowName, selected, onSelectRow, onOpenRow, active, edit, setCell, cancelEdit, setEditValue, setMessage, keyDown, commit, focus, input, beginEdit }: GridRowProps<Row>) {
  const id = rowKey(row);
  return <tr className={selected ? styles.selectedRow : ''} aria-selected={selected}>
    <td className={styles.check}><input type="checkbox" tabIndex={-1} aria-label={`Select ${rowName(row)}`} checked={selected} onChange={() => onSelectRow?.(id)} /></td>
    <th scope="row" className={styles.student}>{onOpenRow ? <button type="button" className={styles.openRow} onClick={event => onOpenRow(id, event.currentTarget)} aria-label={`Open ${rowName(row)} grade details`}>{rowName(row)}</button> : rowName(row)}</th>
    {columns.map((column, colIndex) => {
      const here = active.row === rowIndex && active.col === colIndex;
      const editingHere = !!edit && edit.rowKey === id && edit.columnKey === column.key;
      const range = rowIndex >= Math.min(active.row, active.fromRow) && rowIndex <= Math.max(active.row, active.fromRow) && colIndex >= Math.min(active.col, active.fromCol) && colIndex <= Math.max(active.col, active.fromCol);
      return <td key={column.key} id={`grade-grid-${id}-${column.key}`} ref={here ? focus : undefined} role="gridcell" aria-label={column.ariaLabel?.(row)} aria-selected={range} aria-readonly={!!column.readOnly} tabIndex={here ? 0 : -1} className={[styles.value, column.tint && styles.bandAlt, colIndex === columns.length - 1 && styles.current, range && styles.range].filter(Boolean).join(' ')} onFocus={() => {
        if (!here) {
          if (edit && (edit.rowKey !== id || edit.columnKey !== column.key)) cancelEdit();
          setCell({ row: rowIndex, col: colIndex, fromRow: rowIndex, fromCol: colIndex });
        }
      }} onKeyDown={keyDown} onDoubleClick={() => { if (!column.readOnly) beginEdit(rowIndex, colIndex); }}>
        {editingHere ? <span className={styles.editor}><input ref={input} aria-label={`Edit ${rowName(row)}, ${column.key}`} value={edit!.value} onChange={event => setEditValue(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void commit(active.row + 1, active.col); } else if (event.key === 'Tab') { event.preventDefault(); void commit(active.row, active.col + 1); } else if (event.key === 'Escape') { event.preventDefault(); cancelEdit(); setMessage('Edit cancelled.'); requestAnimationFrame(() => focus.current?.focus()); } }} /><small>Enter save · Tab next · Esc cancel</small></span> : column.render(row, here, false)}
      </td>;
    })}
  </tr>;
}) as <Row>(props: GridRowProps<Row>) => ReactNode;

function DataGridInner<Row>({ caption, rows, columns, rowKey, rowName, density = 'compact', selectedRows, onSelectRow, onOpenRow, onCommit, onAction, onSelectionChange }: DataGridProps<Row>) {
  const [cell, setCell] = useState({ row: 0, col: 0, fromRow: 0, fromCol: 0 });
  const [edit, setEdit] = useState<EditState | null>(null);
  const [message, setMessage] = useState('Use arrow keys to move. Enter edits a score.');
  const focus = useRef<HTMLTableCellElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const visible = rows.length > 0 && columns.length > 0;
  const active = { row: Math.min(cell.row, Math.max(0, rows.length - 1)), col: Math.min(cell.col, Math.max(0, columns.length - 1)), fromRow: Math.min(cell.fromRow, Math.max(0, rows.length - 1)), fromCol: Math.min(cell.fromCol, Math.max(0, columns.length - 1)) };
  useEffect(() => { if (edit) input.current?.focus(); }, [edit?.rowKey, edit?.columnKey]);
  useEffect(() => { onSelectionChange?.(active); }, [active.row, active.col, active.fromRow, active.fromCol]);
  useEffect(() => {
    if (!edit) return;
    const stillThere = rows.some(r => rowKey(r) === edit.rowKey) && columns.some(c => c.key === edit.columnKey);
    if (!stillThere) setEdit(null);
  }, [rows, columns, edit, rowKey]);
  function cancelEdit() { setEdit(null); }
  function setEditValue(value: string) { setEdit(prev => prev ? { ...prev, value } : prev); }
  function beginEdit(rowIndex: number, colIndex: number, seed?: string) {
    const row = rows[rowIndex]; const column = columns[colIndex];
    if (!row || !column || column.readOnly) return;
    setEdit({ rowKey: rowKey(row), columnKey: column.key, value: seed ?? column.editValue?.(row) ?? '' });
    setMessage('Editing. Enter saves and moves down; Tab saves and moves right; Escape cancels.');
  }
  function move(row: number, col: number, extend = false) {
    if (edit) cancelEdit();
    const next = { row: Math.max(0, Math.min(rows.length - 1, row)), col: Math.max(0, Math.min(columns.length - 1, col)), fromRow: extend ? active.fromRow : Math.max(0, Math.min(rows.length - 1, row)), fromCol: extend ? active.fromCol : Math.max(0, Math.min(columns.length - 1, col)) };
    setCell(next);
    requestAnimationFrame(() => document.getElementById(`grade-grid-${rowKey(rows[next.row])}-${columns[next.col].key}`)?.focus());
  }
  async function commit(nextRow: number, nextCol: number) {
    if (!edit || !visible) return;
    const row = rows.find(r => rowKey(r) === edit.rowKey);
    const column = columns.find(c => c.key === edit.columnKey);
    if (!row || !column) { cancelEdit(); setMessage('Edit cancelled because the cell is no longer visible.'); return; }
    const ok = await onCommit?.(row, column, edit.value);
    if (ok === false) { setMessage('Could not save. Correct the value or press Escape.'); return; }
    cancelEdit(); setMessage('Score saved.');
    const rowIndex = rows.findIndex(r => rowKey(r) === edit.rowKey);
    const colIndex = columns.findIndex(c => c.key === edit.columnKey);
    move(nextRow === active.row + 1 ? rowIndex + 1 : rowIndex, nextCol === active.col + 1 ? colIndex + 1 : colIndex);
  }
  function keyDown(event: KeyboardEvent<HTMLTableCellElement>) {
    if (!visible || edit) return;
    const key = event.key;
    if (key.startsWith('Arrow')) { event.preventDefault(); move(active.row + (key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0), active.col + (key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0), event.shiftKey); }
    else if (key === 'Enter' && !columns[active.col].readOnly) { event.preventDefault(); beginEdit(active.row, active.col); }
    else if (key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey && /[\d.%-]/.test(key) && !columns[active.col].readOnly) { event.preventDefault(); beginEdit(active.row, active.col, key); }
    else if ((event.metaKey || event.ctrlKey) && key.toLowerCase() === 'd') { event.preventDefault(); onAction?.('fill', active); }
    else if ((event.metaKey || event.ctrlKey) && key.toLowerCase() === 'z') { event.preventDefault(); onAction?.('undo', active); }
    else if (key.toLowerCase() === 'e') { event.preventDefault(); onAction?.('excuse', active); }
    else if (key.toLowerCase() === 'm') { event.preventDefault(); onAction?.('missing', active); }
    else if (key.toLowerCase() === 'o') { event.preventDefault(); onAction?.('override', active); }
    else if (key === ' ') { event.preventDefault(); onAction?.('select', active); }
    else if (key === '?') { event.preventDefault(); onAction?.('shortcuts', active); }
  }
  const bands: { key: string; label: string; count: number }[] = [];
  for (const c of columns) { const last = bands.at(-1); if (last?.key === c.band) last.count++; else bands.push({ key: c.band, label: c.bandLabel, count: 1 }); }
  return <div className={styles.frame}>
    <div className={styles.scroll}><table role="grid" aria-label={caption} aria-rowcount={rows.length + 2} aria-colcount={columns.length + 2} className={[styles.grid, styles[density]].join(' ')}>
      <caption className={styles.sr}>{caption}</caption><thead><tr className={styles.bandRow}><th scope="col" rowSpan={2} className={styles.check}>Select</th><th scope="col" rowSpan={2} className={styles.student}>Student</th>{bands.map(b => <th key={b.key} scope="colgroup" colSpan={b.count}>{b.label}</th>)}</tr><tr className={styles.itemRow}>{columns.map((c, i) => <th key={c.key} scope="col" className={[c.tint && styles.bandAlt, i === columns.length - 1 && styles.current].filter(Boolean).join(' ')}>{c.header}</th>)}</tr></thead>
      <tbody>{rows.map((row, i) => <GridRow key={rowKey(row)} row={row} rowIndex={i} columns={columns} rowKey={rowKey} rowName={rowName} selected={!!selectedRows?.has(rowKey(row))} onSelectRow={onSelectRow} onOpenRow={onOpenRow} active={active} edit={edit} setCell={setCell} cancelEdit={cancelEdit} setEditValue={setEditValue} setMessage={setMessage} keyDown={keyDown} commit={commit} focus={focus} input={input} beginEdit={beginEdit} />)}</tbody>
    </table></div><span className={styles.sr} aria-live="polite">{message}</span>
    {!visible && <p>No students match this view.</p>}
  </div>;
}
export const DataGrid = DataGridInner;
