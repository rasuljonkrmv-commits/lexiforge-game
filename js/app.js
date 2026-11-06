/* app.js
 * Screens, navigation and user interaction. Uses Vocab (vocabulary.js) and Progress (progress.js).
 * All text is inserted with textContent/append (never innerHTML), so typed words cannot inject HTML.
 */
const main = document.getElementById('main');
const toastBox = document.getElementById('toast');
let toastTimer = null;

/** Small helper: el('div', {class:'x', onclick: fn}, child, 'text') */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'class') node.className = value;
    else if (value === true) node.setAttribute(key, '');
    else if (value !== false && value != null) node.setAttribute(key, value);
  });
  children.flat().filter((child) => child != null && child !== false).forEach((child) => node.append(child));
  return node;
}

function toast(message, type = 'success') {
  toastBox.textContent = message;
  toastBox.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastBox.className = ''; }, 3500);
}

/* ---------- Router ---------- */
const routes = { dashboard: renderDashboard, vocabulary: renderVocabulary, practice: renderPractice, games: renderGames };
const routeTitles = { dashboard: 'Dashboard', vocabulary: 'My Words', practice: 'Practice Plan', games: 'Games Zone' };

function currentRoute() {
  const name = location.hash.replace('#/', '');
  return routes[name] ? name : 'dashboard';
}

function render() {
  const route = currentRoute();
  document.querySelectorAll('[data-route]').forEach((link) => {
    if (link.dataset.route === route) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.title = `${routeTitles[route]} – LexiForge AI`;
  main.replaceChildren(routes[route]());
}

window.addEventListener('hashchange', () => { render(); main.focus(); window.scrollTo(0, 0); });

/* ---------- Dashboard ---------- */
function statCard(label, value, hint) {
  return el('div', { class: 'card stat' },
    el('span', { class: 'muted' }, label),
    el('strong', { class: 'stat-value' }, String(value)),
    el('span', { class: 'muted small' }, hint));
}

function renderDashboard() {
  const summary = Progress.summary();
  const totalWords = Vocab.totalWords();
  const recent = Vocab.recentSets(4);

  const recentContent = recent.length
    ? el('div', { class: 'grid sets' }, recent.map((set) =>
        el('div', { class: 'card' },
          el('h3', {}, set.name),
          el('p', { class: 'muted' }, `${set.words.length} ${set.words.length === 1 ? 'word' : 'words'}`),
          el('button', { class: 'btn', type: 'button', onclick: () => { Vocab.setActive(set.id); location.hash = '#/vocabulary'; } }, 'Open set'))))
    : el('div', { class: 'card empty' },
        el('h3', {}, 'No vocabulary sets yet'),
        el('p', { class: 'muted' }, 'Add a few words you want to learn and your first set will appear here.'),
        el('a', { class: 'btn primary', href: '#/vocabulary' }, 'Add your first words'));

  const resetButton = el('button', { class: 'btn danger', type: 'button', onclick: () => {
    if (confirm('Reset all progress (answers, accuracy, streak)? Your words and sets will be kept.')) {
      Progress.reset();
      toast('Progress reset.');
      render();
    }
  } }, 'Reset progress');

  return el('div', { class: 'page' },
    el('section', { class: 'hero' },
      el('h1', {}, 'Turn words you know into words you use'),
      el('p', { class: 'lead' }, 'Add the English words you are learning. LexiForge AI builds practice from your own vocabulary and tracks what you find difficult. It is free, and your data stays in this browser.'),
      el('div', { class: 'row' },
        el('a', { class: 'btn primary', href: '#/vocabulary' }, totalWords ? 'Add more words' : 'Add your first words'),
        el('a', { class: 'btn', href: '#/games' }, 'Open Games Zone'))),
    el('section', { 'aria-labelledby': 'stats-title' },
      el('h2', { id: 'stats-title', class: 'sr-only' }, 'Your progress'),
      el('div', { class: 'grid stats' },
        statCard('Total words', totalWords, 'across all sets'),
        statCard('Exercises completed', summary.exercises, 'finished game sessions'),
        statCard('Accuracy', summary.attempts ? `${summary.accuracy}%` : '–', summary.attempts ? `${summary.correct} of ${summary.attempts} correct` : 'No answers yet'),
        statCard('Learning streak', `${summary.streak} ${summary.streak === 1 ? 'day' : 'days'}`, 'consecutive days of practice'))),
    el('section', { 'aria-labelledby': 'recent-title' },
      el('h2', { id: 'recent-title' }, 'Recent vocabulary sets'),
      recentContent),
    el('section', { class: 'row between footer-row' },
      el('p', { class: 'muted small' }, 'Resetting progress keeps your vocabulary.'),
      resetButton));
}

/* ---------- Vocabulary input + word list ---------- */
function renderVocabulary() {
  const sets = Vocab.getSets();
  const active = Vocab.getActive();
  const feedback = el('div', { class: 'feedback', role: 'alert' });

  // --- Set picker / creator ---
  const setPicker = sets.length
    ? el('div', { class: 'field' },
        el('label', { for: 'set-select' }, 'Active set'),
        el('select', { id: 'set-select', onchange: (event) => { Vocab.setActive(event.target.value); render(); } },
          sets.map((set) => el('option', { value: set.id, selected: active && set.id === active.id }, `${set.name} (${set.words.length})`))))
    : el('p', { class: 'muted' }, 'No set yet. Adding words below will create “My First Set”, or name your own set here.');

  const newSetForm = el('form', { class: 'row inline-form', onsubmit: (event) => {
    event.preventDefault();
    const result = Vocab.createSet(event.target.elements.name.value);
    if (result.error) { toast(result.error, 'error'); return; }
    toast(`Set “${result.set.name}” created.`);
    render();
  } },
    el('label', { class: 'sr-only', for: 'new-set-name' }, 'New set name'),
    el('input', { id: 'new-set-name', name: 'name', placeholder: 'New set name', maxlength: '40', autocomplete: 'off' }),
    el('button', { class: 'btn', type: 'submit' }, 'Create set'));

  // --- Add words form ---
  const addForm = el('form', { novalidate: true, onsubmit: (event) => {
    event.preventDefault();
    const form = event.target;
    feedback.textContent = '';
    const { valid, invalid } = Vocab.parseInput(form.elements.words.value);

    if (!valid.length && !invalid.length) { feedback.textContent = 'Enter at least one English word.'; form.elements.words.focus(); return; }
    if (!valid.length) { feedback.textContent = `Nothing added. Use letters, spaces, apostrophes or hyphens only: ${invalid.join(', ')}`; return; }

    let target = Vocab.getActive();
    if (!target) target = Vocab.createSet('My First Set').set;
    const result = Vocab.addWords(target.id, valid, {
      uzbek: form.elements.uzbek.value, definition: form.elements.definition.value,
      synonyms: form.elements.synonyms.value, example: form.elements.example.value });

    const parts = [];
    if (result.added.length) parts.push(`${result.added.length} added`);
    if (result.duplicates.length) parts.push(`skipped duplicates: ${result.duplicates.join(', ')}`);
    if (invalid.length) parts.push(`invalid: ${invalid.join(', ')}`);
    if (!result.saved) parts.push('could not save to this browser (storage may be blocked or full)');
    toast(parts.join('. ') + '.', result.added.length && result.saved ? 'success' : 'error');
    render();
  } },
    el('div', { class: 'field' },
      el('label', { for: 'words-input' }, 'English words'),
      el('textarea', { id: 'words-input', name: 'words', rows: '4', placeholder: 'resilient, ambiguous\nthrive = gullab-yashnamoq' }),
      el('p', { class: 'hint' }, 'Separate words with commas or new lines. To add an Uzbek meaning quickly, write word = meaning or word - meaning.')),
    el('details', {},
      el('summary', {}, 'Optional details (when adding one word)'),
      el('div', { class: 'field' }, el('label', { for: 'f-uzbek' }, 'Uzbek meaning'), el('input', { id: 'f-uzbek', name: 'uzbek' })),
      el('div', { class: 'field' }, el('label', { for: 'f-def' }, 'English definition'), el('input', { id: 'f-def', name: 'definition' })),
      el('div', { class: 'field' }, el('label', { for: 'f-syn' }, 'Synonyms (comma separated)'), el('input', { id: 'f-syn', name: 'synonyms' })),
      el('div', { class: 'field' }, el('label', { for: 'f-ex' }, 'Example sentence'), el('input', { id: 'f-ex', name: 'example' })),
      el('p', { class: 'hint' }, 'You provide the meanings, so you stay in control of what is correct. LexiForge never invents definitions.')),
    feedback,
    el('button', { class: 'btn primary', type: 'submit' }, 'Add words'));

  // --- Word list ---
  let listContent;
  if (!active || !active.words.length) {
    listContent = el('div', { class: 'card empty' },
      el('h3', {}, 'This set is empty'),
      el('p', { class: 'muted' }, 'Add words using the form and they will appear here.'));
  } else {
    listContent = el('ul', { class: 'word-list' }, active.words.map((word) =>
      el('li', { class: 'card word' },
        el('div', { class: 'word-main' },
          el('strong', {}, word.term),
          word.uzbek && el('span', { class: 'tag' }, word.uzbek),
          word.definition && el('p', { class: 'muted' }, word.definition),
          word.synonyms.length > 0 && el('p', { class: 'muted small' }, `Synonyms: ${word.synonyms.join(', ')}`),
          word.example && el('p', { class: 'muted small' }, `“${word.example}”`)),
        el('div', { class: 'row' },
          el('button', { class: 'btn small-btn', type: 'button', 'aria-label': `Edit ${word.term}`, onclick: () => openEditDialog(active.id, word) }, 'Edit'),
          el('button', { class: 'btn small-btn danger', type: 'button', 'aria-label': `Delete ${word.term}`, onclick: () => {
            if (confirm(`Delete “${word.term}”?`)) { Vocab.deleteWord(active.id, word.id); Progress.forgetWord(word.id); toast('Word deleted.'); render(); }
          } }, 'Delete')))));
  }

  const deleteSetButton = active && el('button', { class: 'btn small-btn danger', type: 'button', onclick: () => {
    if (confirm(`Delete the set “${active.name}” and all ${active.words.length} words in it?`)) {
      active.words.forEach((word) => Progress.forgetWord(word.id));
      Vocab.deleteSet(active.id);
      toast('Set deleted.');
      render();
    }
  } }, 'Delete set');

  return el('div', { class: 'page' },
    el('h1', {}, 'My words'),
    el('p', { class: 'lead' }, 'Build your vocabulary sets. Everything is saved automatically in this browser.'),
    el('div', { class: 'two-col' },
      el('section', { class: 'card', 'aria-labelledby': 'add-title' },
        el('h2', { id: 'add-title' }, 'Add words'), setPicker, newSetForm, addForm),
      el('section', { 'aria-labelledby': 'list-title' },
        el('div', { class: 'row between' },
          el('h2', { id: 'list-title' }, active ? `${active.name} (${active.words.length})` : 'Words'),
          deleteSetButton),
        listContent)));
}

/* ---------- Edit dialog ---------- */
function openEditDialog(setId, word) {
  const dialog = document.getElementById('edit-dialog');
  const error = el('p', { class: 'feedback', role: 'alert' });
  const field = (id, label, value) => el('div', { class: 'field' },
    el('label', { for: id }, label), el('input', { id, name: id.replace('e-', ''), value }));

  const form = el('form', { onsubmit: (event) => {
    event.preventDefault();
    const f = event.target.elements;
    const result = Vocab.updateWord(setId, word.id, {
      term: f.term.value, uzbek: f.uzbek.value, definition: f.definition.value,
      synonyms: f.synonyms.value, example: f.example.value });
    if (result.error) { error.textContent = result.error; return; }
    dialog.close();
    toast('Word updated.');
    render();
  } },
    el('h2', { id: 'edit-title' }, 'Edit word'),
    field('e-term', 'English word', word.term),
    field('e-uzbek', 'Uzbek meaning', word.uzbek),
    field('e-definition', 'English definition', word.definition),
    field('e-synonyms', 'Synonyms (comma separated)', word.synonyms.join(', ')),
    field('e-example', 'Example sentence', word.example),
    error,
    el('div', { class: 'row' },
      el('button', { class: 'btn primary', type: 'submit' }, 'Save changes'),
      el('button', { class: 'btn', type: 'button', onclick: () => dialog.close() }, 'Cancel')));

  dialog.replaceChildren(form);
  dialog.showModal();
}

/* ---------- Practice Plan (shows what the Vocabulary Engine can build) ---------- */
function previewCard(exercise) {
  let answerText;
  if (exercise.kind === 'matching') answerText = exercise.pairs.map((pair) => `${pair.term} = ${pair.definition}`).join('; ');
  else if (exercise.kind === 'writing') answerText = 'Your own sentence. The app cannot grade it, so compare it with your example sentence if you added one.';
  else answerText = exercise.answer;

  return el('div', { class: 'card' },
    el('span', { class: 'tag' }, Engine.labelOf[exercise.type]),
    el('p', { class: 'preview-prompt' }, exercise.prompt),
    exercise.options && el('ul', {}, exercise.options.map((option) => el('li', {}, option))),
    exercise.kind === 'matching' && el('div', {},
      el('ul', {}, exercise.pairs.map((pair) => el('li', {}, pair.term))),
      el('p', { class: 'muted small' }, 'Definitions (shuffled):'),
      el('ul', {}, Engine.shuffle(exercise.pairs).map((pair) => el('li', {}, pair.definition)))),
    exercise.hint && el('p', { class: 'muted small' }, `Hint: ${exercise.hint}`),
    el('details', {}, el('summary', {}, 'Show answer'), el('p', {}, answerText)));
}

function renderPractice() {
  const active = Vocab.getActive();
  if (!active || !active.words.length) {
    return el('div', { class: 'page' },
      el('h1', {}, 'Practice plan'),
      el('div', { class: 'card empty' },
        el('p', { class: 'muted' }, 'Add some words first. The engine builds exercises from the words you enter.'),
        el('a', { class: 'btn primary', href: '#/vocabulary' }, 'Add words')));
  }

  const plan = Engine.build(active.words);
  const previewBox = el('div', { class: 'grid sets' });
  const showSamples = () => {
    const cards = plan.exercises.length
      ? Engine.sample(plan.exercises, 6).map(previewCard)
      : [el('div', { class: 'card empty' }, el('p', { class: 'muted' }, 'No exercises yet. Add meanings or example sentences to your words.'))];
    previewBox.replaceChildren(...cards); // spread: replaceChildren needs separate nodes, not one array
  };
  showSamples();

  const missingContent = plan.missing.length
    ? el('ul', { class: 'missing-list' }, plan.missing.map((item) => el('li', {}, el('strong', {}, item.term), ` – add ${item.add.join(', ')}`)))
    : el('p', { class: 'muted' }, 'Every word has full details. Nothing is missing.');

  return el('div', { class: 'page' },
    el('h1', {}, `Practice plan: ${active.name}`),
    el('p', { class: 'lead' }, 'The Vocabulary Engine is rule-based, not generative AI. It builds exercises only from what you entered, and it never invents meanings.'),
    el('section', { 'aria-labelledby': 'types-title' },
      el('h2', { id: 'types-title' }, `${plan.exercises.length} exercises ready`),
      el('div', { class: 'grid games' }, plan.summary.map((type) =>
        el('div', { class: 'card' },
          el('h3', {}, type.label),
          type.count
            ? el('p', { class: 'ok-text' }, `${type.count} ready`)
            : el('p', { class: 'muted small' }, `Not available yet. Needs: ${type.needs}.`))))),
    el('section', { 'aria-labelledby': 'sample-title' },
      el('div', { class: 'row between' },
        el('h2', { id: 'sample-title' }, 'Sample exercises'),
        el('button', { class: 'btn small-btn', type: 'button', onclick: showSamples }, 'Show different samples')),
      previewBox),
    el('section', { class: 'card', 'aria-labelledby': 'missing-title' },
      el('h2', { id: 'missing-title' }, 'Add details to unlock more exercises'),
      missingContent,
      el('a', { class: 'btn', href: '#/vocabulary' }, 'Edit words')));
}

/* ---------- Games Zone (see games.js) ---------- */
function renderGames() { return Games.renderZone(); }

render();