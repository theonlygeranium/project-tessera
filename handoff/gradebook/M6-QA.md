# Gradebook M6 QA · 2026-09-29

## Scope and result

Journey 21 covers the mock instructor and student gradebook flow. The app build, typecheck, and Vitest suite pass. Browser execution is blocked in this sandbox, so the journey, screenshots, accessibility audit, and browser performance targets still need an unrestricted local run before acceptance.

## 300 × 60 performance measurements

Host: owner's arm64 Mac, Node v22.22.3. Fixtures are fictional. All figures below are measurements, not production Worker or browser timings.

| Probe | Workload and method | Measured | Target / interpretation |
| --- | --- | ---: | --- |
| Grade engine, weighted | `shared/grading/engine.bench.ts`, 300 students × 60 items, five categories, median of seven warmed full-course runs, run without other checks | 43.2 ms | Under 50 ms on this Node run; Worker runtime remains unmeasured. |
| Grade engine, points | Same fixture and method | 45.3 ms | Under 50 ms on this Node run; Worker runtime remains unmeasured. |
| Grid render, first | `tools/gradebook_grid.bench.tsx`, actual `DataGrid` rendered to HTML in Node with 300 rows × 60 columns | 254.2 ms | Node server rendering is only a proxy for the under-1-second browser first-render target. |
| Grid render, median | Same probe, median of seven runs | 123.6 ms | Output was 3,640,161 bytes of HTML for 18,000 score cells. |
| Browser first render, scroll, keyboard edit | Playwright Chromium | Unmeasured | `listen EPERM` and then Chromium `MachPortRendezvousServer: Permission denied` prevented browser execution. |
| Preview D1 `getGradebook` p95 | Seeded 300 × 60 course | Unmeasured | No preview D1 measurement or migration in this worktree. |

Commands: `node_modules/.bin/esbuild shared/grading/engine.bench.ts --bundle --platform=node --format=cjs --outfile=/tmp/tessera-m6-engine-bench.cjs && node /tmp/tessera-m6-engine-bench.cjs`; `node_modules/.bin/esbuild tools/gradebook_grid.bench.tsx --bundle --platform=node --format=cjs --jsx=automatic --loader:.css=empty --outfile=/tmp/tessera-m6-grid-bench.cjs && node /tmp/tessera-m6-grid-bench.cjs`.

The current `DataGrid` renders every row and column with `rows.map` and `columns.map`; it does not implement the row and column virtualization called for in the gradebook specification. The Node render result cannot establish smooth browser scrolling or editing. This M6 change does not alter the grid implementation.

## Verification boundary

- `CACHE_DIR=/tmp/tessera-m6-cache npm run build`: exit 0. The cache override keeps Storybook writes inside the writable sandbox; the worktree's `node_modules` symlink points outside it.
- `npm run typecheck`: exit 0.
- `npm test`: exit 0, 75 files and 630 tests passed.
- `ONLY='Journey 21' node tests/e2e/journeys.mjs`: exit 1 before browser launch, `listen EPERM` on `0.0.0.0`. A route-only retry reached Chromium launch and failed with `MachPortRendezvousServer: Permission denied`; the temporary route change was removed.
- `CACHE_DIR=/tmp/tessera-m6-cache npm run a11y`: build succeeded, audit exit 1 before any axe scan, `listen EPERM` on `0.0.0.0`. Zero violations have not been established.

No Playwright screenshots were produced. The planned Journey 21 captures are grid, Priya panel, setup impact, release preview, student grade, and what-if; they still need visual comparison with the approved artboards. The keyboard-only and 320px browser walkthroughs remain unverified for the same reason.
