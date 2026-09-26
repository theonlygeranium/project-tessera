/* Project Tessera — learner flow prototype.
   Today → lesson (knowledge check) → reflect → module check (3 items, tutor in hint mode)
   → result → back to Today with updated mastery, review queue and time budget.
   Everything is scripted client-side; no network calls, no storage. */
(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const icon = {
    check: '<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    doc: '<svg viewBox="0 0 24 24" style="width:12px;height:12px"><path d="M6 3h9l5 5v13H6z"/><path d="M14 3v6h6"/></svg>',
    mark: '<svg viewBox="0 0 24 24" style="color:var(--accent)" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
    up: '<svg viewBox="0 0 24 24" style="color:var(--ok)"><path d="M4 17l6-6 4 4 6-8"/><path d="M14 7h6v6"/></svg>',
    card: '<svg viewBox="0 0 24 24" style="color:var(--ai)"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M7 3h10"/></svg>',
    eye: '<svg viewBox="0 0 24 24" style="color:var(--muted)"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    clock: '<svg viewBox="0 0 24 24" style="color:var(--muted)"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  };

  /* ---------------- content ---------------- */
  const CHUNKS = [
    { title: 'Why evaluation misleads', t: '3 m' },
    { title: 'Subgroup metrics', t: '4 m' },
    { title: 'Worked example: loan model', t: '5 m' },
    { title: 'Check: leakage & fairness', t: '4 m' },
    { title: 'Reflect & next steps', t: '2 m' },
    { title: 'Module 3 check', t: '6 m' },
  ];

  const KC = {
    q: 'Which change would you make first before trusting the 94% figure?',
    options: [
      { id: 'a', text: 'Increase the size of the training set' },
      { id: 'b', text: 'Split by customer so no person appears in both sets' },
      { id: 'c', text: 'Switch from accuracy to F1' },
    ],
    correct: 'b',
    ok: 'Right. Leakage invalidates every downstream metric, so fix the split first. F1 would still be inflated.',
    no: {
      a: 'Not yet. More data does not help if the same customers still appear in both sets; the test set would still contain memorized people.',
      c: 'Close, but F1 is computed from the same contaminated predictions, so it would be inflated too. What has to change about the data?',
    },
  };

  const QUIZ = [
    {
      q: 'A model scores 91% overall but 74% for applicants over 55. What should the evaluation report include?',
      options: [
        { id: 'a', text: 'Only the overall 91%, since it reflects the full population' },
        { id: 'b', text: 'Overall accuracy plus performance for each relevant subgroup' },
        { id: 'c', text: 'Only the 74% figure, as the worst case' },
      ],
      correct: 'b',
      explain: 'Report both: the headline tells you how the model does on average; subgroup figures show who the average hides.',
      review: 'Why report subgroup performance alongside the headline metric?',
    },
    {
      q: 'Your team finds that the same patients appear in both training and test data. What is the most direct fix?',
      options: [
        { id: 'a', text: 'Re-split so each patient appears in only one set' },
        { id: 'b', text: 'Remove the patient ID column from the features' },
        { id: 'c', text: 'Add more test patients' },
      ],
      correct: 'a',
      explain: 'Dropping the ID column does not stop the model from memorizing the same people through their other features. Group-level splitting is the fix.',
      review: 'Why doesn’t dropping the ID column fix person-level leakage?',
    },
    {
      q: 'Which of these is the strongest sign that a feature is acting as a proxy for age?',
      options: [
        { id: 'a', text: 'It has high importance in the model' },
        { id: 'b', text: 'It correlates strongly with age and removing it narrows the age-group gap' },
        { id: 'c', text: 'It was not collected with consent' },
      ],
      correct: 'b',
      explain: 'Importance alone says nothing about age. Correlation plus a change in the subgroup gap when the feature is removed is evidence of a proxy.',
      review: 'What evidence shows a feature is acting as a proxy for a protected attribute?',
    },
  ];

  // Tutor scripts: hint-first, short, cited. Keyed by the item the learner is on.
  const TUTOR = {
    kc: {
      hints: [
        'Think about what every metric is computed from. If the same customers sit in both sets, which inputs are already contaminated?',
        'Metric choice changes how you summarize predictions. Which option changes the data the predictions come from?',
      ],
      worked: 'Worked contrast: a team switches from accuracy (94%) to F1 (0.91) and still ships a leaky model, because both metrics use the same memorized test rows. A second team re-splits by customer and sees accuracy drop to 88%: lower, but honest.',
      cites: ['Week 3 slides, p. 4', 'Reading 3.2, §2'],
    },
    reflect: {
      hints: [
        'Pick one number you have reported at work or in a course. Who might that average be hiding?',
        'Try the frame: "Before I trust this figure, I would check ___ because ___."',
      ],
      worked: 'Example reflection: "Our churn model reports 90% accuracy. Before trusting it I would check whether customers who churned and rejoined appear in both sets, and whether accuracy holds for accounts under six months old."',
      cites: ['Reflection guide, Module 3'],
    },
    0: {
      hints: [
        'Who reads an evaluation report, and what decision do they make from it? What would they miss with only one number?',
        'The lesson said a headline metric is "a claim about the average person." Which option keeps both the average and the people it hides?',
      ],
      worked: 'Worked example: a hiring screen reports 88% overall, 90% for one group and 71% for another. The report lists all three, plus the gap, so reviewers can decide whether 71% is acceptable.',
      cites: ['Reading 3.2, §3', 'Fairness audit guide, p. 6'],
    },
    1: {
      hints: [
        'If you delete the ID column, can the model still recognize the same patient from their other features?',
        'The fix has to change which rows land in each set, not which columns the model sees.',
      ],
      worked: 'Worked example: in the loan case, dropping customer_id left accuracy at 93%, because income, address and tenure still identified people. Splitting by customer brought it to 88%.',
      cites: ['Week 3 slides, p. 6', 'Worked example: loan model'],
    },
    2: {
      hints: [
        'High importance tells you a feature matters. Does it tell you why it matters?',
        'Look for two pieces of evidence: a relationship with age, and an effect on the age-group gap.',
      ],
      worked: 'Worked example: "tenure" correlated 0.71 with age. Removing it cut the approval gap from 17 to 6 points, while overall accuracy fell by 1 point. That pattern is proxy evidence.',
      cites: ['Fairness audit guide, §4', 'Reading 3.3'],
    },
  };

  /* ---------------- state ---------------- */
  const initial = () => ({
    chunk: 3,            // 0-based; 3 = knowledge check, 4 = reflect, 5 = module check
    kc: null,            // selected option id after submit
    reflection: '',
    q: 0,                // module-check question index
    answers: [],         // [{id, correct}]
    pending: null,       // selected but not yet submitted option for current quiz item
    hintIdx: {},         // per tutor context
    hintsUsed: 0,
    answerRequests: 0,
    tutorOpen: false,
    chatStarted: {},
    finished: false,     // result applied to Today
    whyUndone: false,
  });
  let S = initial();

  /* ---------------- routing ---------------- */
  const VIEWS = ['today', 'lesson', 'result'];
  function currentView() {
    const h = location.hash.replace('#', '');
    return VIEWS.includes(h) ? h : 'today';
  }
  function go(view) {
    if (view === 'result' && S.answers.length < QUIZ.length) view = 'lesson';
    if (location.hash !== '#' + view) location.hash = view; else render();
  }
  window.addEventListener('hashchange', render);

  /* ---------------- rendering ---------------- */
  function render() {
    const v = currentView();
    $$('.view').forEach((el) => { el.hidden = el.dataset.view !== v; });
    $$('.rail-btn').forEach((b) => b.toggleAttribute('aria-current', b.dataset.go === v || (v === 'result' && b.dataset.go === 'lesson')));
    $$('.rail-btn[aria-current]').forEach((b) => b.setAttribute('aria-current', 'page'));
    if (v === 'today') renderToday();
    if (v === 'lesson') renderLesson();
    if (v === 'result') renderResult();
    const step = v === 'today' ? (S.finished ? 'Step 4 of 4 · Back on Today, updated' : 'Step 1 of 4 · Today')
      : v === 'result' ? 'Step 4 of 4 · Result'
      : S.chunk === 5 ? `Step 3 of 4 · Module check, question ${S.q + 1} of ${QUIZ.length}` : 'Step 2 of 4 · Lesson';
    $('#step-label').textContent = step;
    $('#main').focus({ preventScroll: true });
  }

  function score() { return S.answers.filter((a) => a.correct).length; }

  function reviewCards() {
    const base = [
      ['Recall', 'Name the three components of a fairness audit.', 'Last seen 6 days ago'],
      ['Apply', 'A dataset was collected for billing. Can it train a churn model?', 'Last seen 3 days ago'],
      ['Recall', 'What does a runbook’s “blast radius” section state?', 'Last seen 9 days ago'],
      ['Explain', 'Why does test-set leakage inflate reported accuracy?', 'Last seen 12 days ago'],
    ];
    if (!S.finished) return base.map((c) => [...c, false]);
    const added = S.answers.map((a, i) => (!a.correct ? ['Explain', QUIZ[i].review, 'Added from Module 3 check', true] : null)).filter(Boolean);
    added.push(['Apply', 'Name one proxy check you would run before reporting subgroup results.', 'Added from your reflection', true]);
    return [...added, ...base.map((c) => [...c, false])];
  }

  function renderToday() {
    const cards = reviewCards();
    $('#review-count').textContent = cards.length;
    $('#review-grid').innerHTML = cards.map(([tag, q, meta, isNew]) =>
      `<div class="rcard${isNew ? ' new' : ''}"><span class="tag">${esc(tag)}${isNew ? ' · new' : ''}</span><span>${esc(q)}</span><span class="muted small" style="margin-top:auto">${esc(meta)}</span></div>`).join('');

    const why = $('.why');
    if (S.whyUndone) { why.innerHTML = '<span>Order restored to due date only.</span><button class="link" type="button" data-act="redo-why">Redo</button>'; }
    else { why.innerHTML = `${'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v.01M11 12h1v4h1"/></svg>'}<span>Moved up because it is due in 26 hours and you set "finish the certificate by November."</span><button class="link" type="button" data-act="undo-why">Undo</button>`; }

    const resume = $('#task-resume');
    const toast = $('#toast');
    if (S.finished) {
      const pct = score() >= 2 ? 71 : 63;
      resume.innerHTML = `<span class="tile teal"><svg viewBox="0 0 24 24" class="solid"><path d="M8 5v14l11-7z"/></svg></span>
        <span class="task-body"><strong>Start: Module 4 · Governance frameworks</strong><span class="muted small">Responsible AI in Practice · unlocked by your Module 3 check · 22 min</span></span>
        <span class="chip teal">Start</span>`;
      resume.dataset.go = 'today';
      resume.dataset.act = 'module4';
      $('#mastery-pct').textContent = pct + '%';
      $('#mastery-bar').style.width = pct + '%';
      $('#comp-count').textContent = score() >= 2 ? '5' : '4';
      $('#ring-fill').setAttribute('stroke-dasharray', '73 113');
      $('#ring-text').textContent = '2 h 18 m / 4 h';
      $('#today-sub').textContent = 'Two things left this week. About 1 h 30 m of work, and you have 1 h 42 m planned.';
      toast.hidden = false;
      toast.innerHTML = `${icon.check}<span>Module 3 complete · ${score()}/${QUIZ.length} · mastery 58% → ${pct}% · ${cards.filter((c) => c[3]).length} review card${cards.filter((c) => c[3]).length === 1 ? '' : 's'} added</span>`;
    } else {
      resume.innerHTML = RESUME_HTML;
      resume.dataset.go = 'lesson';
      delete resume.dataset.act;
      $('#mastery-pct').textContent = '58%';
      $('#mastery-bar').style.width = '58%';
      $('#comp-count').textContent = '4';
      $('#ring-fill').setAttribute('stroke-dasharray', '52 113');
      $('#ring-text').textContent = '1 h 50 m / 4 h';
      $('#today-sub').textContent = TODAY_SUB;
      toast.hidden = true;
    }
  }
  const RESUME_HTML = $('#task-resume').innerHTML;
  const TODAY_SUB = $('#today-sub').textContent;

  function chunkList() {
    $('#chunk-list').innerHTML = CHUNKS.map((c, i) => {
      const cls = i < S.chunk ? 'done' : i === S.chunk ? 'current' : '';
      return `<li><div class="chunk ${cls}" ${i === S.chunk ? 'aria-current="step"' : ''}><span class="dot">${i < S.chunk ? icon.check : ''}</span><span>${esc(c.title)}</span><span class="t">${c.t}</span></div></li>`;
    }).join('');
    const pct = S.chunk === 5 ? Math.round(83 + (S.q / QUIZ.length) * 17) : Math.round(((S.chunk + 0.5) / CHUNKS.length) * 100);
    $('#lesson-prog').style.width = pct + '%';
    $('#lesson-prog-text').textContent = S.chunk === 5 ? `Check · ${S.q + 1} of ${QUIZ.length}` : `Chunk ${S.chunk + 1} of 5`;
  }

  function optionsHTML(name, opts, chosen, correct, locked) {
    return opts.map((o) => {
      let cls = 'opt';
      if (locked && o.id === correct) cls += ' correct';
      else if (locked && o.id === chosen) cls += ' wrong';
      return `<label class="${cls}"><input type="radio" name="${name}" value="${o.id}" ${chosen === o.id ? 'checked' : ''} ${locked ? 'disabled' : ''}> <span>${esc(o.text)}</span></label>`;
    }).join('');
  }

  function renderLesson() {
    chunkList();
    const r = $('#reading');
    if (S.chunk === 3) {
      const locked = S.kc !== null;
      const ok = S.kc === KC.correct;
      r.innerHTML = `
        <div class="formats" role="group" aria-label="Format">
          <button aria-pressed="true">Read</button><button aria-pressed="false">Watch · 4 m</button><button aria-pressed="false">Listen</button><button aria-pressed="false">Plain language</button><button aria-pressed="false">Español</button>
        </div>
        <h1 id="lesson-h">Check: leakage and fairness</h1>
        <p class="prose">In the loan example, the team reported 94% accuracy. Two problems hid inside that number. First, the customer ID appeared in both the training and test sets, so the model partly memorized people rather than patterns. Second, accuracy was averaged across all applicants, which masked a 17-point gap between two age groups.</p>
        <div class="callout row">${icon.mark}<span><strong>Remember:</strong> a single headline metric is a claim about the average person. Fairness questions are about who the average hides.</span></div>
        <section class="check" aria-label="Knowledge check">
          <div class="qhead"><span class="label">Quick check · not graded</span></div>
          <form id="kc-form"><fieldset><legend>${esc(KC.q)}</legend>${optionsHTML('kc', KC.options, S.kc, KC.correct, locked)}</fieldset>
          ${locked ? '' : '<div class="check-actions"><button class="btn primary" type="submit">Check answer</button></div>'}</form>
          ${locked ? `<div class="feedback ${ok ? 'ok' : 'no'}" role="status">${ok ? icon.check : icon.x}<span><strong>${ok ? 'Right.' : 'Not quite.'}</strong> ${esc(ok ? KC.ok.replace(/^Right\. /, '') : KC.no[S.kc])} ${ok ? 'This item will return in your review queue in 3 days.' : ''}</span></div>` : ''}
        </section>
        <div class="row">
          <button class="btn primary" data-act="next-chunk" ${locked ? '' : 'disabled'}>Continue to Reflect</button>
          ${locked && !ok ? '<button class="btn" data-act="kc-retry">Try again</button>' : ''}
          <button class="btn" data-act="open-tutor">Explain differently</button>
        </div>`;
    } else if (S.chunk === 4) {
      r.innerHTML = `
        <h1 id="lesson-h">Reflect and next steps</h1>
        <p class="prose">Think of one number you have reported or relied on, at work or in a course. Before you trusted it, what would you have checked?</p>
        <label for="reflection" class="label">Your reflection · visible to you and Dr. Okafor</label>
        <textarea id="reflection" placeholder="Before I trust this figure, I would check ___ because ___.">${esc(S.reflection)}</textarea>
        <div class="row">
          <button class="btn primary" data-act="to-check">Save and start Module 3 check</button>
          <span class="muted small">3 questions · about 6 minutes · tutor in hint mode</span>
        </div>`;
    } else {
      const item = QUIZ[S.q];
      const done = S.answers[S.q];
      const locked = !!done;
      r.innerHTML = `
        <div class="kicker">Module 3 check · question ${S.q + 1} of ${QUIZ.length}</div>
        <h1 id="lesson-h">Evaluation and fairness</h1>
        <section class="check" aria-label="Question ${S.q + 1}">
          <div class="qhead"><span class="label">Counts toward mastery · 2 attempts</span><span class="chip violet">Tutor: hint mode</span></div>
          <form id="quiz-form"><fieldset><legend>${esc(item.q)}</legend>${optionsHTML('quiz', item.options, locked ? done.id : S.pending, item.correct, locked)}</fieldset>
          ${locked ? '' : '<div class="check-actions"><button class="btn primary" type="submit">Submit answer</button><button class="btn" type="button" data-act="open-tutor">Ask the tutor for a hint</button></div>'}</form>
          ${locked ? `<div class="feedback ${done.correct ? 'ok' : 'no'}" role="status">${done.correct ? icon.check : icon.x}<span><strong>${done.correct ? 'Correct.' : 'Not this time.'}</strong> ${esc(item.explain)}${done.correct ? '' : ' This question is now in your review queue.'}</span></div>` : ''}
        </section>
        <div class="row">
          ${locked ? `<button class="btn primary" data-act="next-q">${S.q + 1 < QUIZ.length ? 'Next question' : 'See results'}</button>` : ''}
        </div>`;
    }
    renderTutor();
  }

  /* ---------------- tutor ---------------- */
  function tutorKey() { return S.chunk === 3 ? 'kc' : S.chunk === 4 ? 'reflect' : S.q; }

  function renderTutor() {
    const t = $('#tutor');
    t.hidden = !S.tutorOpen;
    $$('.tutor-toggle').forEach((b) => b.setAttribute('aria-expanded', String(S.tutorOpen)));
    const key = tutorKey();
    if (S.tutorOpen && !S.chatStarted[key]) {
      S.chatStarted[key] = true;
      const where = key === 'kc' ? 'this knowledge check' : key === 'reflect' ? 'your reflection' : `question ${key + 1}`;
      addMsg('ai', `I can help with ${where}. I will give hints and point you to the course materials rather than answers. What part feels unclear?`, TUTOR[key].cites.slice(0, 1));
    }
  }

  let hintLabel = '';
  function addMsg(kind, text, cites) {
    const chat = $('#chat');
    const m = document.createElement('div');
    if (kind === 'ai') {
      // Shared AI markup contract (docs/assets/ai-voice.css): label, body with refs, numbered sources.
      m.className = 'ai ai--chat';
      const refs = cites && cites.length ? `<sup class="ai-ref">${cites.map((_, i) => i + 1).join(',')}</sup>` : '';
      m.innerHTML = `<div class="ai-who">Course tutor${hintLabel ? ` <span class="ai-src">· ${esc(hintLabel)}</span>` : ''}</div>`
        + `<div class="ai-body">${esc(text)}${refs}</div>`
        + (cites && cites.length ? `<div class="ai-cites">${cites.map((c, i) => `<span class="ai-cite" data-n="${i + 1}">${esc(c)}</span>`).join('')}</div>` : '');
      hintLabel = '';
    } else {
      m.className = 'msg ' + kind;
      m.textContent = text;
    }
    chat.appendChild(m);
    chat.scrollTop = chat.scrollHeight;
  }

  function aiReply(text, cites) {
    const chat = $('#chat');
    const typing = document.createElement('div');
    typing.className = 'typing';
    typing.textContent = 'Tutor is thinking…';
    chat.appendChild(typing);
    chat.scrollTop = chat.scrollHeight;
    setTimeout(() => { typing.remove(); addMsg('ai', text, cites); }, 550);
  }

  function nextHint() {
    const key = tutorKey();
    const script = TUTOR[key];
    const i = S.hintIdx[key] || 0;
    S.hintsUsed++;
    if (i < script.hints.length) {
      S.hintIdx[key] = i + 1;
      hintLabel = `hint ${i + 1} of ${script.hints.length}`;
      aiReply(script.hints[i], [script.cites[i % script.cites.length]]);
    } else {
      aiReply('You have both hints for this one. Want a worked example on a different case? It uses the same idea without giving this answer away.', []);
    }
  }

  function freeText(q) {
    const key = tutorKey();
    const s = q.toLowerCase();
    if (/\b(answer|which one|correct option|just tell)\b/.test(s)) return askAnswer();
    S.hintsUsed++;
    const replies = {
      kc: 'Good question. Let me turn it around: if you changed only the metric, would the model have seen fewer of the test customers during training?',
      reflect: 'Say more about where that number came from. Who collected the data, and who might be under-represented in it?',
      0: 'Think about the person reading the report. What decision could they get wrong if they only saw 91%?',
      1: 'Try this test: after your fix, could any single patient still influence both training and evaluation?',
      2: 'What would you expect to happen to the age-group gap if the feature had nothing to do with age?',
    };
    aiReply(replies[key], [TUTOR[key].cites[0]]);
  }

  function askAnswer() {
    S.answerRequests++;
    addMsg('sys', 'Dr. Okafor set this module to hint mode, so the tutor won’t give answers. Requests like this are shown to your instructor as "asked for answer", without judgment.', null);
    nextHint();
  }

  /* ---------------- result ---------------- */
  function renderResult() {
    const sc = score();
    const pct = sc >= 2 ? 71 : 63;
    $('#result-h').textContent = sc === QUIZ.length ? 'All three correct. Module 4 is unlocked.' : sc >= 2 ? `${sc} of ${QUIZ.length}. Module 4 is unlocked.` : `${sc} of ${QUIZ.length}. Worth one more pass.`;
    $('#result-sub').textContent = sc >= 2
      ? 'You met the mastery threshold for Outcome 3.2. Missed items go to your review queue so they come back before the final.'
      : 'Mastery for Outcome 3.2 needs 2 of 3. Review the cards added below, then retake the check. Module 4 unlocks either way on Friday.';
    $('#answers').innerHTML = QUIZ.map((item, i) => {
      const a = S.answers[i];
      const chosen = item.options.find((o) => o.id === a.id).text;
      return `<li><span class="res ${a.correct ? 'ok' : 'no'}">${a.correct ? 'Correct' : 'Missed'}</span> · ${esc(item.q)}<br><span class="muted small">You chose: ${esc(chosen)}</span></li>`;
    }).join('');
    const newCards = S.answers.filter((a) => !a.correct).length + 1;
    $('#changes').innerHTML = [
      `${icon.up}<span><strong>Mastery</strong> for Responsible AI in Practice: 58% → ${pct}%${sc >= 2 ? ' · competency "Evaluate models for leakage and fairness" verified' : ''}</span>`,
      `${icon.card}<span><strong>${newCards} review card${newCards > 1 ? 's' : ''}</strong> added, scheduled for Oct 1 and Oct 8</span>`,
      `${icon.clock}<span><strong>28 minutes</strong> logged against your 4-hour weekly plan</span>`,
      `${icon.eye}<span><strong>Dr. Okafor sees</strong> your score, your reflection, and a summary of your tutor chat (${S.hintsUsed} hint${S.hintsUsed === 1 ? '' : 's'}${S.answerRequests ? `, ${S.answerRequests} answer request${S.answerRequests > 1 ? 's' : ''}` : ''})</span>`,
    ].map((h) => `<li>${h}</li>`).join('');
    const missed = S.answers.map((a, i) => (!a.correct ? i : null)).filter((i) => i !== null);
    const topic = { 0: 'reporting subgroup performance', 1: 'fixing person-level leakage', 2: 'identifying proxy features' };
    $('#ai-summary').textContent = missed.length
      ? `You were solid on ${[0, 1, 2].filter((i) => !missed.includes(i)).map((i) => topic[i]).join(' and ') || 'the lesson concepts'}. The gap is ${missed.map((i) => topic[i]).join(' and ')}. Suggested next step: the 4-minute "Subgroup metrics" chunk, then the new review cards.`
      : `You answered every item without needing the worked examples${S.hintsUsed ? ` (you used ${S.hintsUsed} hint${S.hintsUsed > 1 ? 's' : ''})` : ''}. Suggested next step: Module 4, which builds on the proxy analysis you just did.`;
    setTimeout(() => $('#result-h').focus(), 0);
  }

  /* ---------------- events ---------------- */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act],[data-go]');
    if (!el) return;
    const act = el.dataset.act;
    switch (act) {
      case 'toggle-tutor': S.tutorOpen = !S.tutorOpen; renderTutor(); if (S.tutorOpen) $('#ask').focus(); else $('.tutor-toggle').focus(); return;
      case 'open-tutor': S.tutorOpen = true; renderTutor(); if (S.chunk === 3 && S.kc) { hintLabel = 'worked example'; aiReply(TUTOR.kc.worked, TUTOR.kc.cites); } $('#ask').focus(); return;
      case 'hint': nextHint(); return;
      case 'worked': { const k = tutorKey(); S.hintsUsed++; hintLabel = 'worked example'; if (typeof k === 'number' && !S.answers[k]) aiReply('Here is a parallel case, not this question:\n' + TUTOR[k].worked, TUTOR[k].cites); else aiReply(TUTOR[k].worked, TUTOR[k].cites); return; }
      case 'answer': askAnswer(); return;
      case 'kc-retry': S.kc = null; renderLesson(); return;
      case 'next-chunk': S.chunk = 4; renderLesson(); render(); return;
      case 'to-check': S.reflection = ($('#reflection') || {}).value || ''; S.chunk = 5; S.q = 0; renderLesson(); render(); return;
      case 'next-q':
        if (S.q + 1 < QUIZ.length) { S.q++; S.pending = null; render(); }
        else go('result');
        return;
      case 'finish': S.finished = true; S.tutorOpen = false; break; // falls through to data-go
      case 'retry': S.answers = []; S.q = 0; S.pending = null; S.chunk = 5; go('lesson'); return;
      case 'reset': S = initial(); $('#chat').innerHTML = ''; go('today'); window.scrollTo(0, 0); return;
      case 'undo-why': S.whyUndone = true; renderToday(); return;
      case 'redo-why': S.whyUndone = false; renderToday(); return;
      case 'module4': { const t = $('#toast'); t.hidden = false; t.innerHTML = `${icon.mark}<span>Module 4 is outside this prototype. Use Reset to walk the flow again.</span>`; return; }
    }
    if (el.dataset.go) go(el.dataset.go);
  });

  document.addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target.id === 'kc-form') {
      const v = (new FormData(e.target)).get('kc');
      if (!v) return;
      S.kc = v; renderLesson();
      if (v !== KC.correct && !S.tutorOpen) {
        // nudge, don't auto-open
        const fb = $('.feedback'); if (fb) fb.insertAdjacentHTML('beforeend', ' <button class="link" data-act="open-tutor" type="button">Talk it through with the tutor</button>');
      }
    }
    if (e.target.id === 'quiz-form') {
      const v = (new FormData(e.target)).get('quiz');
      if (!v) return;
      const item = QUIZ[S.q];
      S.answers[S.q] = { id: v, correct: v === item.correct };
      S.pending = null;
      renderLesson();
    }
    if (e.target.id === 'ask-form') {
      const input = $('#ask');
      const q = input.value.trim();
      if (!q) return;
      addMsg('me', q);
      input.value = '';
      freeText(q);
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.name === 'quiz') S.pending = e.target.value;
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && S.tutorOpen) { S.tutorOpen = false; renderTutor(); const t = $('.tutor-toggle'); if (t) t.focus(); }
  });

  if (!location.hash) history.replaceState(null, '', '#today');
  render();
})();
