// Node-side render probe for the real DataGrid component with fictional 300 × 60 data.
// Run with: node_modules/.bin/esbuild tools/gradebook_grid.bench.tsx --bundle --platform=node --format=cjs --loader:.css=empty --outfile=/tmp/tessera-gradebook-grid-bench.cjs && node /tmp/tessera-gradebook-grid-bench.cjs
import { renderToString } from 'react-dom/server';
import { DataGrid, type GridColumn } from '../app/src/components/DataGrid/DataGrid';

type Row = { id: string; name: string; scores: number[] };
const rows: Row[] = Array.from({ length: 300 }, (_, student) => ({
  id: `fictional-${student}`,
  name: `Fictional learner ${student + 1}`,
  scores: Array.from({ length: 60 }, (_, item) => (student * 7 + item * 3) % 11),
}));
const columns: GridColumn<Row>[] = Array.from({ length: 60 }, (_, item) => ({
  key: `item-${item}`,
  band: `category-${Math.floor(item / 12)}`,
  bandLabel: `Category ${Math.floor(item / 12) + 1}`,
  header: `Item ${item + 1}`,
  ariaLabel: row => `${row.name}, Item ${item + 1}, ${row.scores[item]} points`,
  editValue: row => String(row.scores[item]),
  render: row => row.scores[item],
}));
const durations: number[] = [];
let bytes = 0;
for (let run = 0; run < 7; run++) {
  const start = performance.now();
  const html = renderToString(<DataGrid caption="Fictional course gradebook" rows={rows} columns={columns} rowKey={row => row.id} rowName={row => row.name} />);
  durations.push(performance.now() - start);
  bytes = Buffer.byteLength(html);
}
const sorted = [...durations].sort((a, b) => a - b);
console.log(JSON.stringify({ rows: rows.length, assignments: columns.length, cells: rows.length * columns.length, firstRenderMs: Number(durations[0].toFixed(1)), medianRenderMs: Number(sorted[3].toFixed(1)), htmlBytes: bytes, runsMs: durations.map(ms => Number(ms.toFixed(1))) }));
