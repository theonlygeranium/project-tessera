#!/usr/bin/env python3
"""Create the repo's labels and one `type:principle` issue per design principle.

Idempotent: existing labels are updated in place and issues whose titles already
exist (open or closed) are skipped. Needs a token with `repo` scope in GH_TOKEN
or GITHUB_TOKEN.

    python3 tools/seed_issues.py            # create / update
    python3 tools/seed_issues.py --dry-run  # print what would happen
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

REPO = "theonlygeranium/project-tessera"
API = f"https://api.github.com/repos/{REPO}"
SITE = "https://tessera.edstratumlabs.ai"

LABELS = [
    ("type:design", "0e6b63", "Change to a screen, flow, or the design system"),
    ("type:research", "1f4f9c", "New or corrected evidence"),
    ("type:bug", "b3382c", "The published site renders or behaves incorrectly"),
    ("type:principle", "5b4baf", "Tracks one design principle across all screens"),
    ("area:learner", "c7e6e1", "Learner surfaces"),
    ("area:author", "d9d2f2", "Course authoring"),
    ("area:instructor", "f3e3bf", "Teaching, grading, insights"),
    ("area:admin", "e6dfd3", "Institution admin and governance"),
    ("area:design-system", "ebe6dd", "Tokens, type, AI labeling, components"),
    ("a11y", "7a3e8f", "Accessibility"),
    ("needs-evidence", "9a6a12", "Waiting for a source or a test"),
]

# (title, areas, why, where it shows today, gaps, done when)
PRINCIPLES = [
    (
        "Modules are the single canonical course spine",
        ["area:learner", "area:author"],
        "Canvas's Modules page gives learners and instructors one shared mental model; it is the most copied LMS pattern (report §3). AI should edit that structure, not invent a parallel one (§7).",
        "Lesson player chunk rail; course builder outline tree (Module 3 → 3.1–3.4).",
        "No course-home screen showing the full module map; mobile has no module view.",
        "Every learner and author screen that shows course structure uses course → module → lesson → block, and AI actions in the builder only insert or edit blocks within it.",
    ),
    (
        "Next action is one click from login; one Today list spans all courses and paths",
        ["area:learner"],
        "USC's 10,000-response survey asked for integrated to-dos and calendars across courses (§2). A time-ordered action list is the primary entry point.",
        "Today dashboard, Today on phone, and the prototype's Resume card.",
        "No Calendar view; no notification digest design.",
        "From Today, a learner reaches their next due item in one click on desktop and phone, across degree courses and corporate paths.",
    ),
    (
        "Institution and program templates enforce cross-course consistency",
        ["area:admin", "area:author"],
        "Only 48% of students perceive consistency across courses (EDUCAUSE 2025, §2).",
        "Admin console lists 'Templates & brand' in navigation only.",
        "No template management screen; the builder does not show which template a course follows.",
        "A templates screen exists, the builder shows the applied template, and deviations surface in the publish-readiness bar.",
    ),
    (
        "Lessons are chunked with time estimates and embedded retrieval checks",
        ["area:learner", "area:author"],
        "Chunking lowers cognitive load; retrieval and spaced practice outperform rereading (§1).",
        "Chunk rail with minutes, inline knowledge check, review queue, builder chunking lint.",
        "Review queue cards are not yet practiceable in the prototype.",
        "Every lesson shows per-chunk time, contains at least one low-stakes check, and missed items flow into the review queue (prototype demonstrates the loop end to end).",
    ),
    (
        "Tutor is hint-first, source-grounded, and bound by instructor policy",
        ["area:learner", "area:instructor", "area:admin"],
        "Unguarded GPT-4 raised practice scores but lowered exam scores; hint-based guardrails removed the harm (Bastani et al., PNAS 2025). A scaffolded tutor beat active learning (Kestin et al., 2025) (§4).",
        "Lesson player tutor in hint mode with citations; prototype refuses 'just tell me the answer' and logs it; admin policy matrix.",
        "No instructor screen for setting tutor mode per activity.",
        "Tutor mode is visible to the learner, settable per activity by the instructor and per program by the admin, and every tutor reply cites a course source.",
    ),
    (
        "AI output is a labeled draft with provenance, diff, revert, and human approval",
        ["area:author", "area:instructor", "area:design-system"],
        "HAX G9/G11 and NN/G: users over-trust AI output unless tools support checking it (§4).",
        "Builder provenance chips, diff view, review-coverage meter; instructor feedback marked 'AI draft · edit before sending'.",
        "Version history and block-level revert are implied, not shown.",
        "No AI-authored content reaches learners without a recorded human review, and every AI block shows its source and a diff against the last human version.",
    ),
    (
        "The system explains adaptations and offers undo",
        ["area:learner"],
        "HAX G11 (explain why) and G16–G17; transparent adaptivity builds calibrated trust (§5).",
        "Today 'Moved up because… · Undo' strip (working in the prototype).",
        "Path skips from pre-checks are not designed yet.",
        "Every automated reorder, skip, or recommendation on learner screens has a one-line reason and an undo.",
    ),
    (
        "AI capabilities and limits are disclosed; no sparkle-only AI cues",
        ["area:design-system", "area:learner"],
        "NN/G (2024): no participant associated the sparkle icon with AI. PAIR warns against 'AI magic' framing (§2, §4).",
        "Tutor header states scope and who can see the chat; AI content uses the Marginalia markup contract (attribution, source footnotes).",
        "No first-run disclosure or settings page describing what the AI can and cannot do.",
        "A first-use disclosure exists for learners and authors, and a design-system audit finds no AI affordance without a text label.",
    ),
    (
        "Personalize on evidence-based variables, not learning styles",
        ["area:learner"],
        "Learning-style matching lacks the crossover evidence it needs (Pashler 2008; 2024 meta-analysis) (§5).",
        "Persona preset on Today; format switcher offers all formats to everyone; low-bandwidth mode on phone.",
        "No onboarding learning-profile screen.",
        "Onboarding asks about goals, time, language, accessibility, device, and role only, and every preset is editable later.",
    ),
    (
        "WCAG 2.2 AA holds across UI and generated content",
        ["a11y", "area:design-system", "area:author"],
        "ADA Title II deadlines (April 2027 / 2028); DOJ flagged AI-generated content as an accessibility risk (§2).",
        "Real form controls in mockups; contrast-checked tokens; builder accessibility lint; admin audit panel.",
        "No automated accessibility test in the repo; prototype not yet screen-reader tested.",
        "Axe (or equivalent) runs clean on every page in docs/, and a screen-reader walkthrough of the prototype is recorded in an issue.",
    ),
    (
        "Agentic actions are previewable change sets",
        ["area:instructor", "area:admin"],
        "Co-pilot, not autopilot: bulk changes need preview and approval (§4, HAX G9/G17).",
        "Instructor ⌘K change-set preview with conflict warning; admin 'Simulate' before apply; nudge requires approval.",
        "Change-set history and undo are described but not shown.",
        "Every agent-initiated bulk action shows was / will-be, affected counts, conflicts, and an undo window before and after Apply.",
    ),
    (
        "A quality and alignment linter runs before publish",
        ["area:author"],
        "QM Seventh Edition centers alignment of outcomes, assessments, and activities (§1).",
        "Builder publish-readiness bar (alignment, accessibility, reading level, chunking).",
        "No detailed linter report or QM/OSCQR rubric selection.",
        "Authors can open a full readiness report mapped to a selectable rubric, and publish is blocked or warned per institution policy.",
    ),
    (
        "Interoperability covers LTI 1.3, SIS/HRIS, SCORM, xAPI, cmi5, open APIs, and MCP",
        ["area:admin"],
        "Canvas's open ecosystem is a core reason for its adoption (§3).",
        "Admin integration-health panel.",
        "No integration setup or error-resolution screens.",
        "Admin can see status, last sync, and errors for each integration, and fix a failed sync from the console.",
    ),
    (
        "AI governance is visible: models, residency, retention, logs, FERPA/GDPR",
        ["area:admin"],
        "Security and data handling became purchase criteria after the 2026 Canvas breach (§3, §4).",
        "Admin AI policy matrix, policy inspector, retention simulation, spend KPI.",
        "No incident log or model/provider selection screen.",
        "Admins can see and change model, region, retention, and transcript visibility per program, with an exportable audit log.",
    ),
    (
        "Features are measured against learning outcomes, not engagement alone",
        ["area:instructor", "area:admin"],
        "Personalization evidence at the interface level is thin; test against outcomes (§5 caveat).",
        "Outcome mastery bars in the instructor view and admin KPIs.",
        "No experiment or evaluation plan for the prototype.",
        "An evaluation plan exists (SUS target of 80 or above, plus outcome measures), and each shipped feature names the outcome metric it should move.",
    ),
]


def token() -> str:
    t = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if not t:
        sys.exit("Set GH_TOKEN or GITHUB_TOKEN.")
    return t


def call(method: str, url: str, body: dict | None = None):
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body else None)
    req.add_header("Authorization", f"Bearer {token()}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


def existing_titles() -> set[str]:
    titles, page = set(), 1
    while True:
        status, items = call("GET", f"{API}/issues?state=all&per_page=100&page={page}")
        if status != 200 or not items:
            return titles
        titles |= {i["title"] for i in items}
        page += 1


def body_for(why, now, gaps, done) -> str:
    return (
        f"### Why\n{why}\n\n"
        f"### Where the screens show it today\n{now}\n\n"
        f"### Gaps\n{gaps}\n\n"
        f"### Done when\n{done}\n\n"
        f"---\nSource: research report, Design Principles Checklist · [live site]({SITE}/) · [report]({SITE}/research.html)"
    )


def main(dry: bool) -> None:
    for name, color, desc in LABELS:
        if dry:
            print("label", name)
            continue
        s, _ = call("POST", f"{API}/labels", {"name": name, "color": color, "description": desc})
        if s == 422:
            s, _ = call("PATCH", f"{API}/labels/{urllib.parse.quote(name, safe='')}", {"color": color, "description": desc})
        print(f"label {name}: {s}")

    have = set() if dry else existing_titles()
    for title, areas, why, now, gaps, done in PRINCIPLES:
        full = f"[Principle] {title}"
        if full in have:
            print(f"skip (exists): {full}")
            continue
        if dry:
            print("issue", full, areas)
            continue
        s, r = call("POST", f"{API}/issues", {"title": full, "body": body_for(why, now, gaps, done), "labels": ["type:principle", *areas]})
        print(f"issue #{r.get('number') if isinstance(r, dict) else '?'} {s}: {full}")


if __name__ == "__main__":
    main("--dry-run" in sys.argv)
