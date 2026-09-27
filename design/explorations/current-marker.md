# Current-item marker: replacing the edge stripe (D-017)

The Night 1 rail and module map marked the current item with a 4px accent stripe (`box-shadow: inset 4px 0`), which D-017 forbids everywhere. The stripe was removed on 2026-09-27. Until the owner picks a replacement, the current item uses a soft `--accent-soft` fill, bold text, and its text label ("Current").

Options shown to the owner side by side:

| Option | Idea | Character |
|---|---|---|
| **A · Set tile** | A small accent tile (a tessera) set beside the current item, turned 45° so it reads as a marker, not a bullet. In outlines, done = quiet filled tile, current = accent diamond, to-do = hollow tile. | Unique to Tessera's name, charming, tiny footprint, also encodes progress. |
| **B · Lifted tile** | The current item is a white tile with a full 1px outline, lifted off the paper; everything else lies flat. | Quiet and architectural; the most conventional. |
| **C · Ink swash** | A soft highlighter swash under the words only (a thick, low `text-decoration` underline), like a reader marking a page. | Editorial and warm; echoes the Marginalia AI style. |
| **D · Crop marks** | Four tiny accent corner marks frame the current item. | Playful and precise; the busiest. |

Recommendation: **A · Set tile**. It's the only one that belongs to Tessera specifically, it works at 320 px and in dense outlines, and it carries state without color alone (shape differs by state).

**Decision (2026-09-27): the owner chose B · Lifted tile.** Implemented in `GlobalRailNav` (`.current`) and `LessonOutline` (current lesson): the current item is a white `--surface` tile with a full 1px `--control-line` outline and bold ink text, and the rail icon takes the accent. Other items keep a transparent 1px border, so nothing shifts. Module cards sit on `--surface-alt`, so a lifted row reads as raised.
