#!/usr/bin/env python3
"""Build the static microsite in docs/ from the artboard sources in design/canvas/.

Each *.dc.html artboard is a Design Component page that depends on a runtime
(support.js). This script strips that runtime and emits plain, standalone HTML:

  * moves <helmet> contents (fonts, base styles) into <head>
  * removes <x-dc> wrappers and the data-dc-script block
  * resolves {{accent}} to the default accent color
  * rewrites links between artboards to the docs/screens/ file names
  * adds a scale-to-fit wrapper so a 1440px board is readable on any viewport

Run from the repo root:  python3 tools/build_docs.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "design" / "canvas"
OUT = ROOT / "docs" / "screens"
ACCENT = "#0e6b63"

# artboard file -> (slug, group, one-line description)
SCREENS = {
    "Main.dc.html": (
        "today-dashboard",
        "Learner",
        "Adaptive Today dashboard: one cross-course 'Do next' list, weekly time budget, "
        "spaced-review queue, persona preset, and a visible 'why this moved · Undo' strip.",
    ),
    "LessonPlayer.dc.html": (
        "lesson-player",
        "Learner",
        "Focus lesson player: single reading column, chunk rail with time estimates, "
        "format switcher, inline knowledge check, and a hint-mode tutor that cites course sources.",
    ),
    "MobileToday.dc.html": (
        "mobile-today",
        "Learner",
        "Today on a phone: 15-minute session launcher, offline and low-bandwidth mode, review card.",
    ),
    "CourseBuilder.dc.html": (
        "course-builder",
        "Author",
        "Prompt-to-course canvas: Brief → Outline → Draft → Review → Publish stepper, sources panel, "
        "provenance chips, tracked-changes diff, persona variants, and a publish-readiness bar.",
    ),
    "InstructorCommand.dc.html": (
        "instructor-command",
        "Instructor",
        "Instructor command center: keyboard triage, submission + rubric side by side, labeled AI-drafted "
        "feedback, class misconceptions from tutor chats, and a ⌘K change-set preview.",
    ),
    "AdminConsole.dc.html": (
        "admin-console",
        "Admin",
        "Governance & outcomes console: KPI strip, AI policy matrix, integration health, "
        "accessibility audit, and a policy inspector that simulates before applying.",
    ),
}

WRAPPER_CSS = """
html,body{margin:0;background:#e9e5dd}
.tessera-stage{display:flex;justify-content:center;padding:24px 16px 48px;box-sizing:border-box;min-height:100vh}
.tessera-frame{transform-origin:top left;box-shadow:0 18px 50px rgba(28,27,25,.18);border-radius:16px;overflow:hidden;background:#f4f1eb}
.tessera-bar{position:fixed;left:0;right:0;bottom:0;height:40px;display:flex;align-items:center;gap:14px;padding:0 16px;
  background:rgba(28,27,25,.92);color:#f4f1eb;font:500 13px/1 'IBM Plex Sans',system-ui,sans-serif;z-index:10}
.tessera-bar a{color:#9fd8cf;text-decoration:none}.tessera-bar a:hover{text-decoration:underline}
.tessera-bar span{opacity:.75}
body.tessera-embed{background:transparent}
body.tessera-embed .tessera-stage{padding:0;min-height:0;display:block}
body.tessera-embed .tessera-frame{box-shadow:none;border-radius:0}
body.tessera-embed .tessera-bar{display:none}
"""

WRAPPER_JS = """
(function(){
  var frame=document.querySelector('.tessera-frame');
  var w=parseInt(frame.dataset.w,10), h=parseInt(frame.dataset.h,10);
  var stage=document.querySelector('.tessera-stage');
  var embed=/[?&]embed=1/.test(location.search);
  if(embed){document.body.classList.add('tessera-embed');}
  function fit(){
    if(embed){frame.style.transform='none';frame.style.width=w+'px';frame.style.height=h+'px';return;}
    var avail=stage.clientWidth-32;
    var s=Math.min(1,avail/w);
    frame.style.transform='scale('+s+')';
    frame.style.width=w+'px';
    frame.style.height=h+'px';
    frame.parentElement.style.width=(w*s)+'px';
    frame.parentElement.style.height=(h*s)+'px';
  }
  window.addEventListener('resize',fit);fit();
})();
"""


def convert(name: str, html: str, index: dict) -> str:
    slug, group, _ = SCREENS[name]
    board = index["boards"][name]
    w, h = board["w"], board["h"]

    # helmet -> head
    helmet = re.search(r"<helmet>(.*?)</helmet>", html, re.S)
    helmet_html = helmet.group(1).strip() if helmet else ""
    html = re.sub(r"<helmet>.*?</helmet>", "", html, flags=re.S)
    html = html.replace('<script src="./support.js"></script>\n', "")
    html = re.sub(r"<script type=\"text/x-dc\".*?</script>\n", "", html, flags=re.S)
    html = html.replace("<x-dc>\n", "").replace("</x-dc>\n", "")
    html = html.replace("{{accent}}", ACCENT)

    # links between artboards
    for src_name, (target_slug, _, _) in SCREENS.items():
        html = html.replace(f'href="{src_name}"', f'href="{target_slug}.html"')

    # wrap the root element for scale-to-fit
    body_open = html.index("<body>") + len("<body>")
    body_close = html.rindex("</body>")
    root = html[body_open:body_close].strip()
    title = board.get("title", slug)
    wrapped = (
        f"\n<div class=\"tessera-stage\"><div>"
        f"<div class=\"tessera-frame\" data-w=\"{w}\" data-h=\"{h}\">\n{root}\n</div></div></div>\n"
        f"<nav class=\"tessera-bar\" aria-label=\"Site\"><a href=\"../index.html\">← All screens</a>"
        f"<span>{title}</span><span>{w}×{h}</span></nav>\n"
        f"<script>{WRAPPER_JS}</script>\n"
    )
    html = html[:body_open] + wrapped + html[body_close:]

    head_extra = f"{helmet_html}\n<style>{WRAPPER_CSS}</style>\n"
    html = html.replace("</head>", head_extra + "</head>", 1)
    return html


def main() -> None:
    index = json.loads((SRC / "canvas.json").read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    for name in index["order"]:
        src = SRC / name
        slug = SCREENS[name][0]
        (OUT / f"{slug}.html").write_text(convert(name, src.read_text(), index))
        print("wrote", OUT / f"{slug}.html")
    manifest = [
        {"file": f"screens/{SCREENS[n][0]}.html", "slug": SCREENS[n][0], "group": SCREENS[n][1],
         "title": index["boards"][n].get("title", n), "description": SCREENS[n][2],
         "w": index["boards"][n]["w"], "h": index["boards"][n]["h"]}
        for n in index["order"]
    ]
    (ROOT / "docs" / "screens.json").write_text(json.dumps(manifest, indent=2))
    print("wrote docs/screens.json")


if __name__ == "__main__":
    main()
