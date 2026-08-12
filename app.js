(() => {
  'use strict';

  const STORAGE_KEY = 'ipmat-study-quest-v2';
  const LEGACY_KEY = 'ipmat-study-quest-v1';
  const EXAM_DATE = '2027-04-15T00:00:00';
  const STAGES = [
    { key: 'study', label: 'STUDY', days: 0 },
    { key: 'r1', label: '24H', days: 1 },
    { key: 'r4', label: 'DAY 4', days: 4 },
    { key: 'r13', label: 'DAY 13', days: 13 }
  ];
  const TOPIC_GROUPS = {
    'Arithmetic': ['Time, Speed & Distance', 'Ratio, Proportion & Variation', 'Mean, Median & Mode', 'Simple & Compound Interest', 'Profit & Loss', 'Time & Work', 'Mixture & Alligation', 'Averages', 'Percentages'],
    'Algebra': ['Progression & Series', 'Modulus', 'Functions', 'Polynomials', 'Linear Equations', 'Inequalities', 'Indices', 'Minima & Maxima', 'Identities', 'Quadratic Equations'],
    'Modern Maths': ['Logarithms', 'Permutation & Combination', 'Set Theory', 'Matrices & Determinants', 'Probability', 'Binomial Theorem'],
    'Geometry': ['Circles', 'Triangles', 'Trigonometry', 'Straight Lines', 'Quadrilaterals', 'Conic Sections', 'Polygons', 'Solids'],
    'Number System': ['Remainder', 'Divisibility Rules', 'Factorisation', 'Integral Solutions', 'HCF & LCM', 'Unit Digit'],
    'Verbal Ability': ['Reading Comprehension', 'Sentence Completion', 'Vocabulary', 'Sentence Correction', 'Parajumbles', 'Incorrect Word', 'Paracompletion', 'Spelling', 'Verbal Analogies', 'Critical Reasoning', 'Idioms & Phrasal Verbs'],
    'Logical Reasoning': [],
    'Data Interpretation': []
  };
  const TOPIC_OPTIONS = Object.keys(TOPIC_GROUPS);
  const DEFAULT_QUOTES = [
    { id: 'kabir-1', text: 'धीरे-धीरे रे मना, धीरे सब कुछ होय। माली सींचे सौ घड़ा, ऋतु आए फल होय।', author: 'Kabir' },
    { id: 'kabir-2', text: 'दुख में सुमिरन सब करे, सुख में करे न कोय। जो सुख में सुमिरन करे, दुख कहे को होय।', author: 'Kabir' },
    { id: 'kabir-3', text: 'साईं इतना दीजिए, जा में कुटुम समाय। मैं भी भूखा न रहूँ, साधु न भूखा जाय।', author: 'Kabir' },
    { id: 'kabir-4', text: 'माला फेरत जुग भया, फिरा न मन का फेर। कर का मनका डार दे, मन का मनका फेर।', author: 'Kabir' },
    { id: 'vivekananda-1', text: 'Arise, awake, and stop not till the goal is reached.', author: 'Swami Vivekananda' }
  ];

  const $ = id => document.getElementById(id);
  const page = document.body.dataset.page;
  let state = loadState();
  let activeTopicTab = 'all';
  let calendarCursor = firstOfMonth(parseDate(todayKey()));
  let calendarSelected = todayKey();
  let editingNoteId = '';
  let toastTimer;
  let quoteMarkTaps = 0;
  let secretKeys = '';
  let syncClient = null;
  let syncUser = null;
  let syncTimer = null;
  let pullingCloud = false;

  function baseState() {
    return {
      version: 5, examDate: EXAM_DATE.slice(0, 10), topics: [], calendarNotes: [], quotes: DEFAULT_QUOTES.map(quote => ({ ...quote })), quoteCursor: -1, lastChangedAt: Date.now(),
      profile: { name: '', asked: false }, settings: { email: '', notifications: false, lastAlert: '', moonMode: false }
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      if (!saved || !Array.isArray(saved.topics)) return baseState();
      const initial = baseState();
      const { security: _legacySecurity, ...savedWithoutSecurity } = saved;
      return {
        ...initial, ...savedWithoutSecurity,
        topics: saved.topics.map(normaliseTopic),
        calendarNotes: Array.isArray(saved.calendarNotes) ? saved.calendarNotes.map(normaliseNote) : [],
        quotes: Array.isArray(saved.quotes) && saved.quotes.length ? saved.quotes.map(normaliseQuote).filter(Boolean) : initial.quotes,
        quoteCursor: Number.isInteger(saved.quoteCursor) ? saved.quoteCursor : -1,
        profile: { ...initial.profile, ...(saved.profile || {}) },
        settings: { ...initial.settings, ...(saved.settings || {}) }, lastChangedAt: Number(saved.lastChangedAt) || Date.now()
      };
    } catch (_) { return baseState(); }
  }

  function saveState(options = {}) { if (!options.keepTimestamp) state.lastChangedAt = Date.now(); localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); if (!options.skipCloud) scheduleCloudPush(); }
  function normaliseTopic(topic) {
    const completed = Array.isArray(topic.completedStages) ? topic.completedStages.filter(key => STAGES.some(stage => stage.key === key)) : [];
    return {
      id: topic.id || makeId(), subject: String(topic.subject || ''), topic: String(topic.topic || ''), subtopic: String(topic.subtopic || ''), resource: String(topic.resource || ''),
      studyStyle: String(topic.studyStyle || 'Revision'), nextStep: String(topic.nextStep || topic.notes || ''), notes: String(topic.notes || ''),
      studyDate: validKey(topic.studyDate) ? topic.studyDate : todayKey(), completedStages: completed, reviews: Array.isArray(topic.reviews) ? topic.reviews : [],
      createdAt: Number(topic.createdAt) || Date.now(), updatedAt: Number(topic.updatedAt) || Date.now()
    };
  }
  function normaliseNote(note) { return { id: note.id || makeId(), date: validKey(note.date) ? note.date : todayKey(), text: String(note.text || ''), createdAt: Number(note.createdAt) || Date.now() }; }
  function normaliseQuote(quote) { if (!quote || !String(quote.text || '').trim()) return null; return { id: quote.id || makeId(), text: String(quote.text).trim(), author: String(quote.author || 'Your collection').trim(), createdAt: Number(quote.createdAt) || Date.now() }; }

  function makeId() { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
  function pad(value) { return String(value).padStart(2, '0'); }
  function todayKey() { const now = new Date(); return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`; }
  function validKey(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')); }
  function parseDate(key) { return new Date(`${key}T00:00:00`); }
  function firstOfMonth(date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
  function toKey(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
  function startDay(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
  function addDays(key, days) { const date = parseDate(key); date.setDate(date.getDate() + days); return date; }
  function dayDifference(a, b) { return Math.round((startDay(a) - startDay(b)) / 86400000); }
  function formatDate(value, options = { weekday: 'short', day: 'numeric', month: 'short' }) { return new Intl.DateTimeFormat(undefined, options).format(value instanceof Date ? value : parseDate(value)); }
  function formatLongDate(value) { return formatDate(value, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  function escapeHtml(value) { return String(value || '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
  function plural(count, word) { return `${count} ${word}${count === 1 ? '' : 's'}`; }

  function currentStage(topic) { return STAGES.find(stage => !topic.completedStages.includes(stage.key)) || null; }
  function stageIndex(topic) { const stage = currentStage(topic); return stage ? STAGES.findIndex(item => item.key === stage.key) : STAGES.length; }
  function dueDate(topic, stage = currentStage(topic)) { return stage ? addDays(topic.studyDate, stage.days) : null; }
  function dueKind(topic) {
    const date = dueDate(topic);
    if (!date) return 'won';
    const difference = dayDifference(date, new Date());
    if (difference < 0) return 'overdue';
    if (difference === 0) return 'today';
    if (difference === 1) return 'tomorrow';
    return difference <= 7 ? 'week' : 'later';
  }
  function topicTitle(topic) { return `${topic.subject ? `${topic.subject} · ` : ''}${topic.topic}${topic.subtopic ? ` — ${topic.subtopic}` : ''}`; }
  function bucketTopics(kind) { return state.topics.filter(topic => dueKind(topic) === kind).sort((a, b) => dueDate(a) - dueDate(b)); }
  function totalProgress() { return state.topics.reduce((sum, topic) => sum + topic.completedStages.length, 0); }
  function completeCycles() { return state.topics.filter(topic => !currentStage(topic)).length; }
  function activityDays() {
    const days = new Set();
    state.topics.forEach(topic => { if (topic.completedStages.includes('study')) days.add(topic.studyDate); topic.reviews.forEach(review => { if (validKey(review.date)) days.add(review.date); }); });
    return days;
  }
  function activeDaysThisWeek() { const days = activityDays(); let count = 0; for (let number = 0; number < 7; number += 1) { const date = new Date(); date.setDate(date.getDate() - number); if (days.has(toKey(date))) count += 1; } return count; }
  function activitiesOn(key) { const total = state.topics.filter(topic => topic.studyDate === key && topic.completedStages.includes('study')).length + state.topics.reduce((count, topic) => count + topic.reviews.filter(review => review.date === key && review.stage !== 'study').length, 0); return total; }

  function showToast(message, kind = '') {
    const toast = $('toast'); if (!toast) return;
    toast.textContent = message; toast.className = `toast ${kind}`.trim(); requestAnimationFrame(() => toast.classList.add('show'));
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
  }

  function greeting() { return state.profile.name ? `Hey ${state.profile.name}, what’s up?` : 'Hey, what’s up?'; }
  function updateGreeting() { document.querySelectorAll('[data-greeting]').forEach(node => { node.textContent = greeting(); }); }
  function updateTime() {
    const now = new Date();
    const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(now);
    const date = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(now);
    document.querySelectorAll('#liveClock').forEach(node => { node.textContent = `${date} · ${time}`; });
    document.querySelectorAll('#lastChecked').forEach(node => { node.textContent = `Live check: ${time}`; });
    document.querySelectorAll('[data-countdown]').forEach(node => {
      const remaining = Math.max(0, new Date(EXAM_DATE).getTime() - Date.now());
      const days = Math.floor(remaining / 86400000); const hours = Math.floor((remaining % 86400000) / 3600000); const minutes = Math.floor((remaining % 3600000) / 60000); const seconds = Math.floor((remaining % 60000) / 1000);
      const targets = { days, hours: pad(hours), minutes: pad(minutes), seconds: pad(seconds) };
      Object.entries(targets).forEach(([key, value]) => { const item = node.querySelector(`[data-time="${key}"]`); if (item) item.textContent = value; });
    });
    updateGreeting();
  }
  function countdownMarkup() { return '<div class="target-clock" data-countdown><div class="target-unit"><b data-time="days">—</b><span>DAYS</span></div><div class="target-unit"><b data-time="hours">—</b><span>HOURS</span></div><div class="target-unit"><b data-time="minutes">—</b><span>MIN</span></div><div class="target-unit"><b data-time="seconds">—</b><span>SEC</span></div><small class="target-caption">UNTIL IPMAT · 15 APR 2027</small></div>'; }

  function rotateQuote(advance = true) {
    if (!state.quotes.length) state.quotes = DEFAULT_QUOTES.map(quote => ({ ...quote }));
    if (advance) { state.quoteCursor = (state.quoteCursor + 1 + state.quotes.length) % state.quotes.length; saveState({ keepTimestamp: true, skipCloud: true }); }
    const index = ((state.quoteCursor % state.quotes.length) + state.quotes.length) % state.quotes.length;
    const quote = state.quotes[index];
    document.querySelectorAll('[data-quote-text]').forEach(node => { node.textContent = quote.text; });
    document.querySelectorAll('[data-quote-author]').forEach(node => { node.textContent = `— ${quote.author}`; });
    const gardenText = $('gardenQuoteText'); if (gardenText) gardenText.textContent = quote.text;
    const gardenAuthor = $('gardenQuoteAuthor'); if (gardenAuthor) gardenAuthor.textContent = `— ${quote.author}`;
  }
  function quoteRibbonMarkup() { return '<section class="quote-ribbon" aria-label="A rotating thought"><span class="quote-mark" aria-hidden="true">“</span><div><blockquote data-quote-text>Loading a thought…</blockquote><cite data-quote-author></cite></div><button class="icon-button" type="button" data-action="next-quote" aria-label="Show another quote">↻</button></section>'; }

  function miniMission(topic) {
    const stage = currentStage(topic); const kind = dueKind(topic); const due = dueDate(topic);
    const description = kind === 'overdue' ? `${Math.abs(dayDifference(due, new Date()))}d late · ${stage.label}` : `${stage.label} revision`;
    return `<article class="lane-card"><div><b title="${escapeHtml(topicTitle(topic))}">${escapeHtml(topicTitle(topic))}</b><small>${description}</small></div><button class="button ${kind === 'overdue' ? 'danger' : 'primary'} small" data-action="done-stage" data-id="${topic.id}">Done</button></article>`;
  }
  function laneMarkup(topics, empty) { return topics.length ? topics.slice(0, 5).map(miniMission).join('') : `<div class="lane-empty">${empty}</div>`; }

  function renderToday() {
    const overdue = bucketTopics('overdue'); const today = bucketTopics('today'); const tomorrow = bucketTopics('tomorrow'); const week = bucketTopics('week');
    const heroTitle = $('todayGreeting'); const heroSub = $('todaySubtitle');
    const checkIn = new URLSearchParams(location.search).get('checkin') === '1';
    heroTitle.textContent = greeting();
    heroSub.textContent = overdue.length ? 'Do one red card gently. The rest can wait.' : today.length ? 'Your revision list is here. One card at a time.' : tomorrow.length ? 'Nothing due right now. Your next small task is tomorrow.' : 'A quiet schedule is a good schedule. Add a topic when you study.';
    if (checkIn) setTimeout(openCheckinPopup, 120);
    $('overdueLane').innerHTML = laneMarkup(overdue, 'Nothing overdue. Keep it this way. 🌿');
    $('todayLane').innerHTML = laneMarkup(today, 'No revision due today. Breathe easy. ✨');
    $('tomorrowLane').innerHTML = laneMarkup(tomorrow, 'Tomorrow is clear for now.');
    $('weekLane').innerHTML = laneMarkup(week, 'No more missions in the next 7 days.');
    $('overdueBadge').textContent = plural(overdue.length, 'task'); $('todayBadge').textContent = plural(today.length, 'task'); $('tomorrowBadge').textContent = plural(tomorrow.length, 'task'); $('weekBadge').textContent = plural(week.length, 'task');
    const days = activeDaysThisWeek(); const scale = Math.min(1, .62 + days * .055 + Math.min(state.topics.length, 8) * .01);
    $('treeScene').style.setProperty('--tree-scale', scale.toFixed(2));
    $('treeCaption').textContent = days ? `You showed up ${days} of the last 7 days. Your tree is quietly growing.` : 'Your tree grows when you return. Add one topic to plant the first seed.';
  }

  function populateSuggestions() {
    const topicList = $('topicOptions'); const subtopicList = $('subtopicOptions');
    if (topicList) topicList.innerHTML = TOPIC_OPTIONS.map(topic => `<option value="${escapeHtml(topic)}"></option>`).join('');
    if (subtopicList) {
      const topic = $('topic')?.value.trim(); const values = TOPIC_GROUPS[topic] || Object.values(TOPIC_GROUPS).flat();
      subtopicList.innerHTML = values.map(value => `<option value="${escapeHtml(value)}"></option>`).join('');
    }
  }
  function topicRowMarkup(topic) {
    const stage = currentStage(topic); const kind = dueKind(topic); const due = dueDate(topic); const progress = stageIndex(topic);
    const stages = STAGES.map((definition, index) => `<span class="stage ${topic.completedStages.includes(definition.key) ? 'done' : index === progress ? 'current' : ''}">${definition.label}${topic.completedStages.includes(definition.key) ? ' ✓' : ''}</span>`).join('');
    const dueText = !stage ? 'Cycle complete' : kind === 'overdue' ? `${Math.abs(dayDifference(due, new Date()))}d overdue` : kind === 'today' ? 'Due today' : kind === 'tomorrow' ? 'Due tomorrow' : `Due ${formatDate(due)}`;
    const resource = topic.resource ? `📚 ${escapeHtml(topic.resource)}` : 'No resource added';
    const nextMove = topic.nextStep ? `<span class="topic-style">Next: ${escapeHtml(topic.nextStep)}</span>` : `<span class="topic-style">${escapeHtml(topic.studyStyle)}</span>`;
    const action = stage ? `<button class="button ${kind === 'overdue' ? 'danger' : 'primary'} small" data-action="done-stage" data-id="${topic.id}">Done: ${stage.label}</button>` : '<span class="button green small">Cycle complete</span>';
    return `<article class="topic-row ${['overdue', 'today'].includes(kind) ? 'needs-attention' : ''}"><div class="topic-top"><span class="subject-pill">${escapeHtml(topic.subject || 'OPEN')}</span><div class="topic-title"><h3>${escapeHtml(topic.topic)}${topic.subtopic ? ` <span>· ${escapeHtml(topic.subtopic)}</span>` : ''}</h3><p>${resource}</p></div><span class="due-pill ${kind}">${dueText}</span></div><div class="topic-meta">${nextMove}<span class="quiet-text">Started ${formatDate(topic.studyDate)}</span></div><div class="stage-track">${stages}</div><div class="topic-actions">${action}<span class="spacer"></span><button class="button ghost small" data-action="edit-topic" data-id="${topic.id}">Edit</button><button class="icon-button" data-action="delete-topic" data-id="${topic.id}" aria-label="Delete ${escapeHtml(topic.topic)}">×</button></div></article>`;
  }
  function filteredTopics() {
    const search = ($('searchTopics')?.value || '').trim().toLowerCase(); const dueFilter = $('dueFilter')?.value || 'all'; const stageFilter = $('stageFilter')?.value || 'all'; const sort = $('sortTopics')?.value || 'next';
    const results = state.topics.filter(topic => {
      const matchesTab = activeTopicTab === 'all' || (activeTopicTab === 'action' ? ['overdue', 'today'].includes(dueKind(topic)) : topic.subject.trim().toLowerCase() === activeTopicTab.toLowerCase());
      const text = [topic.subject, topic.topic, topic.subtopic, topic.resource, topic.nextStep, topic.notes].join(' ').toLowerCase(); const stage = currentStage(topic);
      return matchesTab && (!search || text.includes(search)) && (dueFilter === 'all' || dueKind(topic) === dueFilter) && (stageFilter === 'all' || (stage && stage.key === stageFilter));
    });
    return results.sort((a, b) => {
      if (sort === 'newest') return b.createdAt - a.createdAt;
      if (sort === 'topic') return a.topic.localeCompare(b.topic);
      if (sort === 'stage') return stageIndex(a) - stageIndex(b);
      return (dueDate(a) || new Date('9999-01-01')) - (dueDate(b) || new Date('9999-01-01'));
    });
  }
  function logRecommendation() {
    const overdue = bucketTopics('overdue'); const today = bucketTopics('today');
    if (!state.topics.length) return 'Start with one topic you studied today. This tracker only needs the truth, not perfect data.';
    if (overdue.length) return `Pick ${topicTitle(overdue[0])}. A short, honest revision clears the oldest red card.`;
    if (today.length) return `${plural(today.length, 'revision')} is due today. Begin with whichever card feels easiest.`;
    return 'You are on track. Add your next topic after a real study session and let the cycle remember the dates.';
  }
  function renderLog() {
    populateSuggestions();
    const date = $('studyDate');
    if (date && !date.value) { const queryDate = new URLSearchParams(location.search).get('date'); date.value = validKey(queryDate) ? queryDate : todayKey(); }
    const topics = filteredTopics();
    $('topicList').innerHTML = topics.length ? topics.map(topicRowMarkup).join('') : `<div class="empty-state"><div class="empty-icon">📝</div><strong>${state.topics.length ? 'Nothing matches that view.' : 'Nothing here yet.'}</strong><p>${state.topics.length ? 'Try a gentler filter or clear the search.' : 'Add your first topic above. It takes less than a minute.'}</p></div>`;
    $('logRecommendation').innerHTML = `<span class="rec-icon">💡</span><span>${escapeHtml(logRecommendation())}</span>`;
  }
  function resetTopicForm() {
    const form = $('topicForm'); if (!form) return;
    form.reset(); $('editId').value = ''; $('studyDate').value = todayKey(); $('studyStyle').value = 'Revision'; $('saveTopic').textContent = '✨ Add to my cycle'; $('cancelEdit').classList.add('hide'); populateSuggestions();
  }
  function addOrUpdateTopic(event) {
    event.preventDefault(); const name = $('topic').value.trim(); if (!name) { $('topic').focus(); return; }
    const data = { subject: $('subject').value.trim(), topic: name, subtopic: $('subtopic').value.trim(), resource: $('resource').value.trim(), studyStyle: $('studyStyle').value, nextStep: $('nextStep').value.trim(), notes: $('notes').value.trim(), studyDate: validKey($('studyDate').value) ? $('studyDate').value : todayKey(), updatedAt: Date.now() };
    const existing = state.topics.find(topic => topic.id === $('editId').value);
    if (existing) { Object.assign(existing, data); saveState(); showToast('Your revision card has been updated.'); }
    else { state.topics.unshift({ id: makeId(), ...data, completedStages: ['study'], reviews: [{ stage: 'study', date: data.studyDate, completedAt: Date.now() }], createdAt: Date.now() }); saveState(); const topic = state.topics[0]; showToast(`Added. Your 24H revision is due ${formatDate(dueDate(topic))}.`); }
    resetTopicForm(); renderLog(); maybeNotifyDue();
  }
  function editTopic(id) {
    const topic = state.topics.find(item => item.id === id); if (!topic || page !== 'log') return;
    $('editId').value = topic.id; $('subject').value = topic.subject; $('topic').value = topic.topic; $('subtopic').value = topic.subtopic; $('resource').value = topic.resource; $('studyStyle').value = topic.studyStyle; $('nextStep').value = topic.nextStep; $('notes').value = topic.notes; $('studyDate').value = topic.studyDate; $('saveTopic').textContent = 'Save my changes'; $('cancelEdit').classList.remove('hide'); populateSuggestions(); document.querySelector('.form-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('topic').focus();
  }
  function deleteTopic(id) { const topic = state.topics.find(item => item.id === id); if (!topic) return; if (!window.confirm(`Delete “${topic.topic}”? Restore a backup if you change your mind.`)) return; state.topics = state.topics.filter(item => item.id !== id); saveState(); showToast('Revision card deleted.'); renderCurrentPage(); }

  function calendarEvents(key) {
    const due = state.topics.filter(topic => { const next = dueDate(topic); return next && toKey(next) === key; });
    const studied = state.topics.filter(topic => topic.studyDate === key); const notes = state.calendarNotes.filter(note => note.date === key);
    return { due, studied, notes, total: due.length + studied.length + notes.length };
  }
  function renderCalendarGrid() {
    const grid = $('mainCalendarDays'); if (!grid) return;
    $('calendarMonthTitle').textContent = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(calendarCursor);
    const first = calendarCursor.getDay(); const count = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 0).getDate(); let html = '';
    for (let blank = 0; blank < first; blank += 1) html += '<span class="calendar-day blank" aria-hidden="true"></span>';
    for (let number = 1; number <= count; number += 1) {
      const key = `${calendarCursor.getFullYear()}-${pad(calendarCursor.getMonth() + 1)}-${pad(number)}`; const data = calendarEvents(key); const classes = ['calendar-day'];
      if (key === calendarSelected) classes.push('selected'); if (key === todayKey()) classes.push('today'); if (data.total) classes.push('has-work');
      if (data.due.some(topic => dueKind(topic) === 'overdue')) classes.push('has-overdue'); else if (data.due.some(topic => dueKind(topic) === 'today')) classes.push('has-today'); else if (data.total) classes.push('has-upcoming');
      const label = data.due.length ? `${plural(data.due.length, 'revision')}` : data.notes.length ? `${plural(data.notes.length, 'note')}` : data.studied.length ? 'Study logged' : '';
      html += `<button class="${classes.join(' ')}" type="button" data-action="pick-day" data-date="${key}" aria-label="Choose ${formatLongDate(key)}"><span>${number}</span>${label ? `<small class="event-count">${label}</small>` : ''}</button>`;
    }
    grid.innerHTML = html;
  }
  function dayMissionMarkup(topic) { const stage = currentStage(topic); return `<article class="lane-card"><div><b>${escapeHtml(topicTitle(topic))}</b><small>${stage.label} revision</small></div><button class="button primary small" data-action="done-stage" data-id="${topic.id}">Done</button></article>`; }
  function renderDayDetail() {
    const title = $('selectedDayTitle'); if (!title) return;
    const data = calendarEvents(calendarSelected); title.textContent = 'Your day'; $('selectedDayDate').textContent = formatLongDate(calendarSelected); $('calendarNoteId').value = editingNoteId;
    const revisions = data.due.length ? data.due.map(dayMissionMarkup).join('') : '<p class="quiet-text">No revision is scheduled for this day.</p>';
    const studied = data.studied.length ? `<p class="quiet-text">Study started: ${data.studied.map(topic => escapeHtml(topic.topic)).join(', ')}</p>` : '';
    const notes = data.notes.length ? data.notes.map(note => `<article class="calendar-note"><span>📝</span><p>${escapeHtml(note.text)}</p><button class="icon-button" data-action="edit-note" data-id="${note.id}" aria-label="Edit note">✎</button><button class="icon-button" data-action="delete-note" data-id="${note.id}" aria-label="Delete note">×</button></article>`).join('') : '<p class="quiet-text">Write a tiny note, plan, or reminder for this day.</p>';
    $('dayMissions').innerHTML = revisions + studied; $('dayNotes').innerHTML = notes;
    const addLink = $('addTopicForDay'); if (addLink) addLink.href = `log.html?date=${calendarSelected}`;
    const editor = $('calendarNoteText'); if (editingNoteId) { const note = state.calendarNotes.find(item => item.id === editingNoteId); editor.value = note ? note.text : ''; $('saveDayNote').textContent = 'Save note'; $('cancelDayNote').classList.remove('hide'); } else { editor.value = ''; $('saveDayNote').textContent = 'Add note'; $('cancelDayNote').classList.add('hide'); }
  }
  function renderCalendarPage() { renderCalendarGrid(); renderDayDetail(); }
  function saveDayNote(event) {
    event.preventDefault(); const text = $('calendarNoteText').value.trim(); if (!text) return $('calendarNoteText').focus();
    if (editingNoteId) { const note = state.calendarNotes.find(item => item.id === editingNoteId); if (note) note.text = text; showToast('Calendar note updated.'); }
    else { state.calendarNotes.unshift({ id: makeId(), date: calendarSelected, text, createdAt: Date.now() }); showToast('Calendar note added.'); }
    editingNoteId = ''; saveState(); renderCalendarPage();
  }
  function editNote(id) { if (page !== 'calendar') return; editingNoteId = id; renderDayDetail(); $('calendarNoteText').focus(); }
  function deleteNote(id) { const note = state.calendarNotes.find(item => item.id === id); if (!note || !window.confirm('Delete this calendar note?')) return; state.calendarNotes = state.calendarNotes.filter(item => item.id !== id); saveState(); showToast('Note deleted.'); renderCalendarPage(); }

  function renderInsights() {
    const overdue = bucketTopics('overdue'); const nextWeek = [...bucketTopics('today'), ...bucketTopics('tomorrow'), ...bucketTopics('week')]; const completed = completeCycles(); const days = activeDaysThisWeek();
    $('metricOverdue').textContent = overdue.length; $('metricWeek').textContent = nextWeek.length; $('metricCycles').textContent = completed; $('metricDays').textContent = days;
    const entries = []; for (let offset = 0; offset < 7; offset += 1) { const date = new Date(); date.setDate(date.getDate() + offset); const key = toKey(date); entries.push({ date, count: state.topics.filter(topic => { const due = dueDate(topic); return due && toKey(due) === key; }).length }); }
    const max = Math.max(1, ...entries.map(entry => entry.count)); $('weeklyBars').innerHTML = entries.map(entry => `<div class="bar-col"><div class="bar-area" title="${entry.count} revisions"><i class="bar" style="height:${entry.count ? Math.max(11, Math.round(entry.count / max * 100)) : 4}%"></i></div><strong>${new Intl.DateTimeFormat(undefined, { weekday: 'narrow' }).format(entry.date)}</strong></div>`).join('');
    const waiting = STAGES.map(stage => ({ stage, count: state.topics.filter(topic => currentStage(topic)?.key === stage.key).length })); const waitingTotal = Math.max(1, state.topics.length);
    $('cycleProgress').innerHTML = waiting.map(item => `<div class="progress-row"><span>${item.stage.label}</span><div class="progress-track"><i style="width:${Math.round(item.count / waitingTotal * 100)}%"></i></div><b>${item.count}</b></div>`).join('') || '<p class="quiet-text">Add a topic to see the revision path.</p>';
    const groups = {}; state.topics.forEach(topic => { const key = topic.topic || 'Open'; if (!groups[key]) groups[key] = { total: 0, progress: 0 }; groups[key].total += 1; groups[key].progress += topic.completedStages.length; });
    const rows = Object.entries(groups).sort((a, b) => b[1].total - a[1].total); $('subjectProgress').innerHTML = rows.length ? rows.map(([name, value]) => { const percent = Math.round(value.progress / (value.total * STAGES.length) * 100); return `<div class="progress-row"><span>${escapeHtml(name)}</span><div class="progress-track"><i style="width:${percent}%"></i></div><b>${percent}%</b></div>`; }).join('') : '<p class="quiet-text">Your topic map will show up here.</p>';
    $('insightRecommendation').innerHTML = `<span class="rec-icon">💡</span><span>${escapeHtml(logRecommendation())}</span>`;
  }

  function renderQuotes() {
    rotateQuote(false);
    const list = $('quoteList'); if (!list) return;
    list.innerHTML = state.quotes.map(quote => `<article class="quote-item"><div><p>“${escapeHtml(quote.text)}”</p><small>— ${escapeHtml(quote.author)}</small></div><button class="icon-button" data-action="delete-quote" data-id="${quote.id}" aria-label="Remove quote">×</button></article>`).join('');
    $('quoteCount').textContent = plural(state.quotes.length, 'quote');
  }
  function addQuote(event) {
    event.preventDefault(); const text = $('newQuoteText').value.trim(); if (!text) return $('newQuoteText').focus();
    state.quotes.push({ id: makeId(), text, author: $('newQuoteAuthor').value.trim() || 'Your collection', createdAt: Date.now() }); saveState(); $('quoteForm').reset(); showToast('Added to your rotating quote chain. ✨'); renderQuotes();
  }
  function importQuotes(event) {
    const file = event.target.files?.[0]; if (!file) return;
    if (/\.pdf$/i.test(file.name)) { showToast('This offline importer reads text, CSV or JSON lists. For a PDF, paste selected quotes into the box above.', 'warn'); event.target.value = ''; return; }
    const reader = new FileReader(); reader.onload = () => {
      try {
        const text = String(reader.result || ''); let incoming = [];
        if (/\.json$/i.test(file.name)) { const parsed = JSON.parse(text); incoming = (Array.isArray(parsed) ? parsed : parsed.quotes || []).map(normaliseQuote).filter(Boolean); }
        else { incoming = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).filter(line => !/^quote\s*[,|]/i.test(line)).map(line => { const separator = line.match(/\s(?:—|–|\|)\s/); if (separator?.index != null) return normaliseQuote({ text: line.slice(0, separator.index), author: line.slice(separator.index + separator[0].length) }); const comma = line.lastIndexOf(','); return normaliseQuote(comma > 0 ? { text: line.slice(0, comma), author: line.slice(comma + 1) } : { text: line, author: 'Your collection' }); }).filter(Boolean); }
        if (!incoming.length) throw new Error('empty'); state.quotes.push(...incoming); saveState(); showToast(`${plural(incoming.length, 'quote')} added to your chain.`); renderQuotes();
      } catch (_) { showToast('I could not read that file. Try a .txt, .md, .csv or .json list.', 'error'); }
      event.target.value = '';
    }; reader.readAsText(file);
  }
  function deleteQuote(id) { if (state.quotes.length <= 1) return showToast('Keep at least one quote in the chain.', 'warn'); state.quotes = state.quotes.filter(quote => quote.id !== id); state.quoteCursor = Math.min(state.quoteCursor, state.quotes.length - 1); saveState(); showToast('Quote removed.'); renderQuotes(); }

  function completeStage(id) {
    const topic = state.topics.find(item => item.id === id); if (!topic) return;
    const stage = currentStage(topic); if (!stage) return showToast('This cycle is already complete. 🌿');
    topic.completedStages.push(stage.key); topic.reviews.push({ stage: stage.key, date: todayKey(), completedAt: Date.now() }); topic.updatedAt = Date.now(); saveState();
    const next = currentStage(topic); showToast(next ? `${stage.label} complete. Next: ${next.label} on ${formatDate(dueDate(topic))}.` : `${topic.topic} completed its full revision cycle. 🌳`); renderCurrentPage(); maybeNotifyDue();
  }
  function maybeNotifyDue() { if (!('Notification' in window) || Notification.permission !== 'granted') return; const count = bucketTopics('today').length + bucketTopics('overdue').length; if (!count || state.settings.lastAlert === todayKey()) return; new Notification('IPMAT revision', { body: `${plural(count, 'revision')} needs your attention today.` }); state.settings.lastAlert = todayKey(); saveState(); }

  function initLogEvents() {
    $('topicForm').addEventListener('submit', addOrUpdateTopic); $('cancelEdit').addEventListener('click', resetTopicForm); $('topic').addEventListener('input', populateSuggestions);
    $('topicTabs').addEventListener('click', event => { const button = event.target.closest('[data-filter-tab]'); if (!button) return; activeTopicTab = button.dataset.filterTab; document.querySelectorAll('[data-filter-tab]').forEach(tab => tab.classList.toggle('active', tab === button)); renderLog(); });
    $('toggleFilters').addEventListener('click', () => { const drawer = $('filterDrawer'); drawer.classList.toggle('hide'); $('toggleFilters').textContent = drawer.classList.contains('hide') ? 'More filters' : 'Hide filters'; });
    ['searchTopics', 'dueFilter', 'stageFilter', 'sortTopics'].forEach(id => $(id).addEventListener(id === 'searchTopics' ? 'input' : 'change', renderLog)); $('clearFilters').addEventListener('click', () => { $('searchTopics').value = ''; $('dueFilter').value = 'all'; $('stageFilter').value = 'all'; $('sortTopics').value = 'next'; activeTopicTab = 'all'; document.querySelectorAll('[data-filter-tab]').forEach(tab => tab.classList.toggle('active', tab.dataset.filterTab === 'all')); renderLog(); });
  }
  function initCalendarEvents() {
    $('prevMonth').addEventListener('click', () => { calendarCursor.setMonth(calendarCursor.getMonth() - 1); renderCalendarPage(); }); $('nextMonth').addEventListener('click', () => { calendarCursor.setMonth(calendarCursor.getMonth() + 1); renderCalendarPage(); });
    $('calendarNoteForm').addEventListener('submit', saveDayNote); $('cancelDayNote').addEventListener('click', () => { editingNoteId = ''; renderDayDetail(); });
  }
  function initQuoteEvents() { $('quoteForm').addEventListener('submit', addQuote); $('quoteImport').addEventListener('change', importQuotes); }

  function downloadBackup(tag = 'backup') {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `revision-cycle-${tag}-${todayKey()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1200); showToast('Your backup download has started. Keep it somewhere safe.');
  }
  function restoreBackup(event) {
    const file = event.target.files?.[0]; if (!file) return;
    const reader = new FileReader(); reader.onload = () => {
      try {
        const restored = JSON.parse(String(reader.result)); if (!Array.isArray(restored.topics)) throw new Error('not a revision backup');
        if (!window.confirm(`Restore ${restored.topics.length} revision cards from this backup? It replaces the current local data.`)) return;
        const initial = baseState(); const { security: _legacySecurity, ...restoredWithoutSecurity } = restored;
        state = { ...initial, ...restoredWithoutSecurity, topics: restored.topics.map(normaliseTopic), calendarNotes: Array.isArray(restored.calendarNotes) ? restored.calendarNotes.map(normaliseNote) : [], quotes: Array.isArray(restored.quotes) && restored.quotes.length ? restored.quotes.map(normaliseQuote).filter(Boolean) : initial.quotes, profile: { ...initial.profile, ...(restored.profile || state.profile) }, settings: { ...initial.settings, ...(restored.settings || {}) } };
        saveState(); showToast('Backup restored. Your cycle is back. ✨'); renderCurrentPage();
      } catch (_) { showToast('That file is not a valid Revision Cycle backup.', 'error'); }
      event.target.value = '';
    }; reader.readAsText(file);
  }
  function freshStart() {
    downloadBackup('before-fresh-start');
    if (!window.confirm('The backup has started downloading. Now clear every revision card, calendar note and imported quote?')) return;
    const keep = { profile: state.profile, settings: state.settings };
    state = { ...baseState(), ...keep }; saveState(); showToast('Fresh start complete. Your name stayed safe. 🌱'); renderCurrentPage();
  }
  function allowedSyncEmail() { return String(window.REVISION_CYCLE_SUPABASE?.allowedEmail || '').trim().toLowerCase(); }
  function isAllowedUser(user) { return Boolean(user && user.email && user.email.toLowerCase() === allowedSyncEmail()); }
  function cloudReady() { return Boolean(syncClient && isAllowedUser(syncUser)); }
  function syncRedirectUrl() {
    const pieces = location.pathname.split('/').filter(Boolean);
    const base = location.hostname.endsWith('.github.io') && pieces.length ? `/${pieces[0]}/` : '/';
    return `${location.origin}${base}`;
  }
  function hydrateCloudState(saved) {
    const initial = baseState(); const source = saved || {}; const { security: _legacySecurity, ...safe } = source;
    return { ...initial, ...safe, topics: Array.isArray(source.topics) ? source.topics.map(normaliseTopic) : [], calendarNotes: Array.isArray(source.calendarNotes) ? source.calendarNotes.map(normaliseNote) : [], quotes: Array.isArray(source.quotes) && source.quotes.length ? source.quotes.map(normaliseQuote).filter(Boolean) : initial.quotes, quoteCursor: Number.isInteger(source.quoteCursor) ? source.quoteCursor : -1, profile: { ...initial.profile, ...(source.profile || {}) }, settings: { ...initial.settings, ...(source.settings || {}) }, lastChangedAt: Number(source.lastChangedAt) || Date.now() };
  }
  function hasMeaningfulLocalData() { return Boolean(state.topics.length || state.calendarNotes.length || state.profile.asked || state.quotes.some(quote => !DEFAULT_QUOTES.some(defaultQuote => defaultQuote.id === quote.id))); }
  function scheduleCloudPush() { if (!cloudReady() || pullingCloud) return; clearTimeout(syncTimer); syncTimer = setTimeout(() => pushCloud(true), 850); }
  async function pushCloud(silent = false) {
    if (!cloudReady() || pullingCloud) return;
    const snapshot = JSON.parse(JSON.stringify(state));
    const { error } = await syncClient.from('user_dashboards').upsert({ user_id: syncUser.id, data: snapshot, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error && !silent) showToast(`Sync could not save: ${error.message}`, 'error');
    else if (!error && !silent) showToast('Saved safely to your account.');
    renderSetup();
  }
  async function syncFromCloud(silent = false) {
    if (!cloudReady() || pullingCloud) return;
    const { data, error } = await syncClient.from('user_dashboards').select('data, updated_at').eq('user_id', syncUser.id).maybeSingle();
    if (error) { if (!silent) showToast(`Sync could not open: ${error.message}`, 'error'); return; }
    if (!data) { await pushCloud(silent); return; }
    const remoteTime = Number(data.data?.lastChangedAt) || Date.parse(data.updated_at) || 0;
    const localTime = Number(state.lastChangedAt) || 0;
    if (!hasMeaningfulLocalData() || remoteTime > localTime) {
      pullingCloud = true; state = hydrateCloudState(data.data); localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); document.body.classList.toggle('moon-mode', Boolean(state.settings.moonMode)); pullingCloud = false;
      renderCurrentPage(); if (!silent) showToast('Your latest revision cycle is here.');
    } else if (localTime > remoteTime) await pushCloud(silent);
    renderSetup();
  }
  async function sendMagicLink() {
    if (!syncClient) return showToast('Sync is not ready yet. Refresh once, then try again.', 'warn');
    const email = $('syncEmail')?.value.trim().toLowerCase(); if (!email) return showToast('Add your email first.', 'warn');
    if (email !== allowedSyncEmail()) return showToast('Cloud sync is private to its owner. You can still use this shared site locally.', 'warn');
    const { error } = await syncClient.auth.signInWithOtp({ email, options: { emailRedirectTo: syncRedirectUrl(), shouldCreateUser: false } });
    if (error) return showToast(`Could not send the sign-in email: ${error.message}`, 'error');
    state.settings.email = email; saveState({ skipCloud: true }); showToast('Email sent. Open its sign-in link on this device.');
  }
  async function signOutSync() { if (!syncClient) return; await syncClient.auth.signOut(); syncUser = null; renderSetup(); showToast('This device is disconnected. Your local backup remains.'); }
  async function initCloudSync() {
    const config = window.REVISION_CYCLE_SUPABASE;
    if (!config?.url || !config?.publishableKey || !window.supabase?.createClient) { renderSetup(); return; }
    syncClient = window.supabase.createClient(config.url, config.publishableKey);
    const { data } = await syncClient.auth.getSession(); syncUser = isAllowedUser(data.session?.user) ? data.session.user : null;
    syncClient.auth.onAuthStateChange((_event, session) => { syncUser = isAllowedUser(session?.user) ? session.user : null; if (syncUser) syncFromCloud(true); renderSetup(); });
    if (syncUser) await syncFromCloud(true);
    setInterval(() => { if (syncUser) syncFromCloud(true); }, 10000);
    window.addEventListener('focus', () => { if (syncUser) syncFromCloud(true); });
    renderSetup();
  }
  function initSetup() {
    if (!$('enableNotifications')) return;
    $('enableNotifications').addEventListener('click', async () => { if (!('Notification' in window)) return showToast('This browser cannot show alerts.', 'warn'); const permission = await Notification.requestPermission(); state.settings.notifications = permission === 'granted'; saveState(); renderSetup(); showToast(permission === 'granted' ? 'Browser alerts are on.' : 'Browser alerts are still off.', permission === 'granted' ? '' : 'warn'); });
    $('emailForm').addEventListener('submit', event => { event.preventDefault(); state.settings.email = $('reminderEmail').value.trim(); saveState(); showToast(state.settings.email ? 'Email plan saved for later setup.' : 'Email plan cleared.'); });
    $('exportData').addEventListener('click', () => downloadBackup('backup'));
    $('importData').addEventListener('change', restoreBackup);
    $('freshStart').addEventListener('click', freshStart);
    $('sendMagicLink')?.addEventListener('click', sendMagicLink);
    $('syncNow')?.addEventListener('click', () => syncFromCloud(false));
    $('signOutSync')?.addEventListener('click', signOutSync);
    $('teaButton').addEventListener('click', () => { const lines = ['A chai break with you? I’d pretend this was accidental. ☕', 'You have the kind of focus that makes a garden want to bloom.', 'Stay a little longer—this tiny corner was hoping you would.']; $('eggMessage').textContent = lines[Math.floor(Math.random() * lines.length)]; });
  }
  function renderSetup() {
    if ($('storageMode')) $('storageMode').textContent = cloudReady() ? 'Sync is on' : 'Private local mode';
    if ($('reminderEmail')) $('reminderEmail').value = state.settings.email || '';
    if ($('syncEmail') && !document.activeElement?.matches('#syncEmail')) $('syncEmail').value = syncUser?.email || state.settings.email || '';
    const syncStatus = $('syncStatus'); if (syncStatus) { syncStatus.textContent = cloudReady() ? `Connected as ${syncUser.email}` : 'Not connected yet — use your email to link this device.'; syncStatus.style.background = cloudReady() ? 'var(--green)' : 'var(--lavender)'; syncStatus.style.color = cloudReady() ? 'var(--green-ink)' : 'var(--purple)'; }
    if ($('signOutSync')) $('signOutSync').hidden = !cloudReady();
    const status = $('notificationStatus'); if (!status) return;
    if (!('Notification' in window)) { status.textContent = 'This browser does not support browser alerts.'; status.style.background = 'var(--orange)'; status.style.color = 'var(--orange-ink)'; }
    else if (Notification.permission === 'granted') { status.textContent = 'Browser alerts are on. Nice.'; status.style.background = 'var(--green)'; status.style.color = 'var(--green-ink)'; }
    else { status.textContent = 'Alerts are currently off.'; status.style.background = 'var(--yellow)'; status.style.color = 'var(--yellow-ink)'; }
  }

  function maybeAskName() {
    if (state.profile.asked || $('nameOverlay')) return;
    const overlay = document.createElement('div'); overlay.id = 'nameOverlay'; overlay.className = 'name-overlay'; overlay.innerHTML = '<form class="name-card" id="nameForm"><div class="brand-mark">✦</div><h2>What should I call you?</h2><p>This is your personal revision space. I will ask only once.</p><input id="profileName" required maxlength="32" autocomplete="given-name" placeholder="Your name"><div class="form-actions"><button class="button primary" type="submit">Enter my space</button></div></form>';
    document.body.appendChild(overlay); $('profileName').focus(); $('nameForm').addEventListener('submit', event => { event.preventDefault(); state.profile.name = $('profileName').value.trim() || 'Friend'; state.profile.asked = true; saveState(); overlay.remove(); updateGreeting(); if ($('todayGreeting')) $('todayGreeting').textContent = greeting(); showToast(`Welcome, ${state.profile.name}. This space is yours. ✨`); });
  }

  function openCheckinPopup() { const popup = $('checkinPopup'); if (popup) popup.classList.remove('hide'); requestAnimationFrame(() => popup?.classList.add('show')); }
  function closeCheckinPopup() { const popup = $('checkinPopup'); if (!popup) return; popup.classList.remove('show'); setTimeout(() => popup.classList.add('hide'), 250); }

  function initGentleMotion() {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !window.matchMedia?.('(hover: hover)').matches) return;
    const floating = document.querySelectorAll('.hero, .quote-ribbon, .panel, .due-lane, .tree-card, .metric, .topic-row, .quote-stage, .easter-card');
    floating.forEach(element => {
      element.addEventListener('pointermove', event => { const rect = element.getBoundingClientRect(); const x = (event.clientX - rect.left) / rect.width - .5; const y = (event.clientY - rect.top) / rect.height - .5; element.style.setProperty('--float-x', `${(x * 2.6).toFixed(2)}px`); element.style.setProperty('--float-y', `${(y * 2.6).toFixed(2)}px`); });
      element.addEventListener('pointerleave', () => { element.style.setProperty('--float-x', '0px'); element.style.setProperty('--float-y', '0px'); });
    });
    document.querySelectorAll('.tree-card').forEach(card => {
      const tree = card.querySelector('.tree'); if (!tree) return;
      card.addEventListener('pointermove', event => { const rect = card.getBoundingClientRect(); const x = (event.clientX - rect.left) / rect.width - .5; const y = (event.clientY - rect.top) / rect.height - .5; tree.style.setProperty('--tree-x', `${(x * 10).toFixed(2)}px`); tree.style.setProperty('--tree-y', `${(y * 5).toFixed(2)}px`); tree.style.setProperty('--tree-rotate', `${(x * 1.8).toFixed(2)}deg`); });
      card.addEventListener('pointerleave', () => { tree.style.setProperty('--tree-x', '0px'); tree.style.setProperty('--tree-y', '0px'); tree.style.setProperty('--tree-rotate', '0deg'); });
    });
  }

  function initEasterEggs() {
    let timerTaps = 0; let lightTaps = 0;
    document.addEventListener('click', event => {
      if (event.target.closest('.quote-mark')) { quoteMarkTaps += 1; if (quoteMarkTaps >= 5) { quoteMarkTaps = 0; showToast('You tap that like you’re trying to get my attention. It worked.'); } }
      if (event.target.closest('[data-countdown]')) { timerTaps += 1; if (timerTaps >= 4) { timerTaps = 0; showToast('Even the clock gets shy when you keep looking at it.'); } }
      if (event.target.closest('.sync-dot')) { lightTaps += 1; if (lightTaps >= 3) { lightTaps = 0; showToast('That little green light is blushing. Apparently it likes you.'); } }
      const tree = event.target.closest('.tree-card');
      if (tree) { tree.classList.remove('tree-wiggle'); requestAnimationFrame(() => tree.classList.add('tree-wiggle')); setTimeout(() => tree.classList.remove('tree-wiggle'), 1700); showToast('Easy—keep looking at me and I’ll grow leaves just for you.'); }
    });
    document.addEventListener('keydown', event => { secretKeys = `${secretKeys}${event.key.toLowerCase()}`.slice(-10); if (secretKeys.endsWith('kabir')) { secretKeys = ''; showToast('You whispered Kabir and somehow this feels like a meet-cute.'); } if (secretKeys.endsWith('moon')) { secretKeys = ''; state.settings.moonMode = !state.settings.moonMode; document.body.classList.toggle('moon-mode', state.settings.moonMode); saveState(); showToast(state.settings.moonMode ? 'Moon mode stays with you now. Type moon again when you want daylight.' : 'Daylight is back. The moon will wait for you.'); } });
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-action]'); if (!button) return;
    const action = button.dataset.action;
    if (action === 'done-stage') completeStage(button.dataset.id);
    if (action === 'edit-topic') editTopic(button.dataset.id);
    if (action === 'delete-topic') deleteTopic(button.dataset.id);
    if (action === 'next-quote') rotateQuote(true);
    if (action === 'pick-day') { calendarSelected = button.dataset.date; calendarCursor = firstOfMonth(parseDate(calendarSelected)); editingNoteId = ''; renderCalendarPage(); }
    if (action === 'edit-note') editNote(button.dataset.id);
    if (action === 'delete-note') deleteNote(button.dataset.id);
    if (action === 'delete-quote') deleteQuote(button.dataset.id);
    if (action === 'checkin') { if (page === 'today') openCheckinPopup(); else location.href = 'index.html?checkin=1'; }
    if (action === 'close-checkin') closeCheckinPopup();
  });

  function renderCurrentPage() {
    if (page === 'today') renderToday(); if (page === 'log') renderLog(); if (page === 'calendar') renderCalendarPage(); if (page === 'insights') renderInsights(); if (page === 'quotes') renderQuotes(); if (page === 'setup') renderSetup();
    rotateQuote(false); updateTime();
  }
  function initServiceWorker() { if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {}); }

  if (page === 'log') initLogEvents(); if (page === 'calendar') initCalendarEvents(); if (page === 'quotes') initQuoteEvents(); if (page === 'setup') initSetup();
  document.body.classList.toggle('moon-mode', Boolean(state.settings.moonMode)); renderCurrentPage(); rotateQuote(true); updateTime(); setInterval(updateTime, 1000); setInterval(() => rotateQuote(true), 45000); maybeAskName(); maybeNotifyDue(); initEasterEggs(); initGentleMotion(); initServiceWorker(); initCloudSync();
})();
