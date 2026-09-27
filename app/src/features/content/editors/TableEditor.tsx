import { useId } from 'react';
import { Button, ChoiceGroup, FormField, TextInput } from '../../../components';
import { LIMITS, addColumn, addRow, moveColumn, moveRow, rectangular, removeColumn, removeRow, setCell, type TableContent } from '../model';
import { ItemActions } from './actions';
import styles from './editors.module.css';

export function TableEditor({ value, onChange }: { value: TableContent; onChange: (value: TableContent) => void }) {
  const headerName = useId();
  const rows = rectangular(value.rows);
  const write = (next: string[][], headerRow = value.headerRow) => onChange({ ...value, headerRow, rows: next });
  return <div className={styles.editor}>
    <FormField label="Caption">{control => <TextInput {...control} value={value.caption} onChange={e => onChange({ ...value, rows, caption: e.target.value })} />}</FormField>
    <ChoiceGroup
      legend="Header row"
      hideLegend
      type="checkbox"
      name={headerName}
      options={[{ value: 'header', label: 'First row is the header' }]}
      value={value.headerRow ? ['header'] : []}
      onChange={next => {
        const selected = Array.isArray(next) ? next : [next];
        write(rows, selected.includes('header'));
      }}
    />
    <fieldset className={styles.item}>
      <legend className={styles.legend}>Columns</legend>
      <div className={styles.columns}>
        {rows[0].map((_, index) => <div key={index} className={styles.column}>
          <span className={styles.columnName}>Column {index + 1}</span>
          <ItemActions axis="horizontal" label={`column ${index + 1}`} index={index} count={rows[0].length} onMove={(i, offset) => write(moveColumn(rows, i, offset))} onRemove={i => write(removeColumn(rows, i))} />
        </div>)}
      </div>
      <div className={styles.toolbar}>
        <Button density="compact" disabled={rows[0].length >= LIMITS.columns} onClick={() => write(addColumn(rows))}>Add column</Button>
      </div>
    </fieldset>
    <div className={styles.stack}>
      {rows.map((row, rowIndex) => <fieldset key={rowIndex} className={styles.item}>
        <legend className={styles.legend}>{value.headerRow && rowIndex === 0 ? 'Row 1, header' : `Row ${rowIndex + 1}`}</legend>
        <div className={styles.cells}>
          {row.map((cell, columnIndex) => <FormField key={columnIndex} label={value.headerRow && rowIndex === 0 ? `Header, column ${columnIndex + 1}` : `Row ${rowIndex + 1}, column ${columnIndex + 1}`}>
            {control => <TextInput {...control} value={cell} onChange={e => write(setCell(rows, rowIndex, columnIndex, e.target.value))} />}
          </FormField>)}
        </div>
        <ItemActions label={`row ${rowIndex + 1}`} index={rowIndex} count={rows.length} onMove={(i, offset) => write(moveRow(rows, i, offset))} onRemove={i => write(removeRow(rows, i))} />
      </fieldset>)}
      <div className={styles.toolbar}>
        <Button density="compact" disabled={rows.length >= LIMITS.rows} onClick={() => write(addRow(rows))}>Add row</Button>
      </div>
    </div>
  </div>;
}
