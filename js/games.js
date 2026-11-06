/* games.js – the Games Zone: 8 playable games built from the user's own words.
 * Each game has make(words) -> list of "questions". One shared runner (play) handles
 * score, feedback, Next button, results and saving answers through Progress.
 * Uses globals from other files: el, main, render (app.js), Engine, Progress, Vocab.
 */
const Games = (() => {
  const ROUND_SIZE = 10;
  const meaningOf = (word) => word.uzbek || word.definition;
  const splitAnswers = (text) => text.split(/[,;/]/).concat(text).map((part) => part.trim()).filter(Boolean);

  /* ----- Question builders. build(ctx) returns an element; ctx.answer(wordId, isCorrect, message) ends the round ----- */

  function choiceQuestion(word, prompt, correct, pool) {
    const options = Engine.choiceOptions(correct, pool);
    if (!options) return null;
    return { build(ctx) {
      const box = el('div', { class: 'options' }, options.map((option) =>
        el('button', { class: 'btn option', type: 'button', onclick: (event) => {
          const isCorrect = option === correct;
          box.querySelectorAll('button').forEach((button) => {
            button.disabled = true;
            if (button.textContent === correct) button.classList.add('is-right');
          });
          if (!isCorrect) event.currentTarget.classList.add('is-wrong');
          ctx.answer(word.id, isCorrect, isCorrect ? 'Correct!' : `Not quite. The answer is: ${correct}`);
        } }, option)));
      return el('div', {}, el('p', { class: 'question' }, prompt), box);
    } };
  }

  function typingQuestion(word, prompt, hint, accepted, shownAnswer) {
    return { build(ctx) {
      const input = el('input', { id: 'answer-input', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
      const submit = el('button', { class: 'btn primary', type: 'submit' }, 'Check');
      const form = el('form', { class: 'row inline-form', onsubmit: (event) => {
        event.preventDefault();
        if (input.disabled) return;
        if (!input.value.trim()) { input.focus(); return; }
        const isCorrect = Engine.check({ kind: 'typing', accepted }, input.value);
        input.disabled = true; submit.disabled = true;
        ctx.answer(word.id, isCorrect, isCorrect ? 'Correct!' : `Not quite. The answer is: ${shownAnswer}`);
      } }, el('label', { class: 'sr-only', for: 'answer-input' }, 'Your answer'), input, submit);
      return el('div', {}, el('p', { class: 'question' }, prompt),
        hint && el('p', { class: 'muted' }, `Hint: ${hint}`), form);
    } };
  }

  function flashcardQuestion(word) {
    return { build(ctx) {
      const back = [word.uzbek, word.definition].filter(Boolean).join(' · ');
      let flipped = false;
      const ratings = el('div', { class: 'row', hidden: true },
        el('button', { class: 'btn primary', type: 'button', onclick: () => { ratings.querySelectorAll('button').forEach((b) => { b.disabled = true; }); ctx.answer(word.id, true, 'Great, keep it up!'); } }, 'I knew it'),
        el('button', { class: 'btn', type: 'button', onclick: () => { ratings.querySelectorAll('button').forEach((b) => { b.disabled = true; }); ctx.answer(word.id, false, 'No problem, it will come back for practice.'); } }, 'Still learning'));
      const card = el('button', { class: 'flashcard', type: 'button', onclick: () => {
        flipped = !flipped;
        card.textContent = flipped ? back : word.term;
        ratings.hidden = !flipped;
      } }, word.term);
      return el('div', {}, el('p', { class: 'muted' }, 'Try to recall the meaning, then flip the card.'), card, ratings);
    } };
  }

  function sentenceQuestion(word) {
    const tokens = word.example.split(' ');
    return { build(ctx) {
      let shuffled; let tries = 0;
      do { shuffled = Engine.shuffle(tokens); } while (shuffled.join(' ') === tokens.join(' ') && tries++ < 10);
      let pool = shuffled.map((text) => ({ text }));
      let chosen = [];
      let locked = false;
      const answerLine = el('div', { class: 'tiles', 'aria-label': 'Your sentence' });
      const poolLine = el('div', { class: 'tiles', 'aria-label': 'Available words' });
      const tile = (item, onclick) => el('button', { class: 'btn tile', type: 'button', disabled: locked, onclick }, item.text);
      function draw() {
        answerLine.replaceChildren(...chosen.map((item) => tile(item, () => { chosen = chosen.filter((x) => x !== item); pool.push(item); draw(); })));
        poolLine.replaceChildren(...pool.map((item) => tile(item, () => { pool = pool.filter((x) => x !== item); chosen.push(item); draw(); })));
      }
      draw();
      const check = el('button', { class: 'btn primary', type: 'button', onclick: () => {
        if (chosen.length < tokens.length) { toast('Place all the words first.', 'error'); return; }
        locked = true; check.disabled = true; draw();
        const isCorrect = Engine.normalize(chosen.map((item) => item.text).join(' ')) === Engine.normalize(word.example);
        ctx.answer(word.id, isCorrect, isCorrect ? 'Correct!' : `Not quite. The sentence is: ${word.example}`);
      } }, 'Check');
      return el('div', {}, el('p', { class: 'question' }, `Build the sentence (it contains “${word.term}”).`), answerLine,
        el('p', { class: 'muted small' }, 'Tap words below, in order. Tap a placed word to remove it.'), poolLine, check);
    } };
  }

  function matchBoard(group) {
    return { build(ctx) {
      let left = null; let right = null; let matched = 0;
      const choose = (side, button, id) => {
        const current = side === 'L' ? left : right;
        if (current) current.button.classList.remove('selected');
        button.classList.add('selected');
        if (side === 'L') left = { button, id }; else right = { button, id };
        if (!left || !right) return;
        const pair = [left, right];
        const isCorrect = left.id === right.id;
        left = null; right = null;
        pair.forEach((p) => p.button.classList.remove('selected'));
        if (isCorrect) {
          pair.forEach((p) => { p.button.classList.add('matched'); p.button.disabled = true; });
          ctx.record(pair[0].id, true);
          matched += 1;
          if (matched === group.length) ctx.finish('All pairs matched.');
        } else {
          ctx.record(pair[0].id, false);
          pair.forEach((p) => { p.button.classList.add('is-wrong'); setTimeout(() => p.button.classList.remove('is-wrong'), 600); });
        }
      };
      const makeButton = (text, side, id) =>
        el('button', { class: 'btn match-btn', type: 'button', onclick: (event) => choose(side, event.currentTarget, id) }, text);
      return el('div', {}, el('p', { class: 'question' }, 'Match each word with its meaning. Pick one from each column.'),
        el('div', { class: 'match-grid' },
          el('div', { class: 'stack' }, Engine.shuffle(group).map((w) => makeButton(w.term, 'L', w.id))),
          el('div', { class: 'stack' }, Engine.shuffle(group).map((w) => makeButton(meaningOf(w), 'R', w.id)))));
    } };
  }

  /* ----- The 8 games ----- */
  const scramble = (text) => {
    const letters = text.replace(/\s+/g, '').split('');
    let result; let tries = 0;
    do { result = Engine.shuffle(letters); } while (letters.length > 1 && result.join('') === letters.join('') && tries++ < 10);
    return result.join(' ').toUpperCase();
  };

  const GAMES = [
    { key: 'flashcards', name: 'Flashcard Challenge', desc: 'Flip cards and rate how well you remembered each word.',
      needs: 'a word with an Uzbek meaning or definition',
      make: (words) => Engine.sample(words.filter(meaningOf), ROUND_SIZE).map(flashcardQuestion) },
    { key: 'matching', name: 'Word-Meaning Matching', desc: 'Pair each word with its meaning.',
      needs: 'at least 3 words with meanings',
      make: (words) => {
        const pool = Engine.shuffle(words.filter(meaningOf));
        if (pool.length < 3) return [];
        const groups = [];
        for (let i = 0; i < pool.length; i += 4) groups.push(pool.slice(i, i + 4));
        if (groups.length > 1 && groups[groups.length - 1].length === 1) groups[groups.length - 2].push(...groups.pop());
        return groups.slice(0, 3).map(matchBoard);
      } },
    { key: 'cloze', name: 'Fill in the Blank', desc: 'Type the missing word in your own example sentence.',
      needs: 'example sentences that contain the exact word',
      make: (words) => Engine.sample(words.filter((w) => w.example && Engine.blankOut(w.example, w.term)), ROUND_SIZE)
        .map((w) => typingQuestion(w, Engine.blankOut(w.example, w.term), meaningOf(w), [w.term], w.term)) },
    { key: 'choice', name: 'Multiple Choice', desc: 'Pick the correct meaning from several options.',
      needs: 'at least 3 words with Uzbek meanings (or 3 with definitions)',
      make: (words) => {
        const field = ['uzbek', 'definition'].find((name) => words.filter((w) => w[name]).length >= 3);
        if (!field) return [];
        const pool = words.filter((w) => w[field]);
        return Engine.sample(pool, ROUND_SIZE).map((w) =>
          choiceQuestion(w, `What does “${w.term}” mean?`, w[field], pool.filter((o) => o !== w).map((o) => o[field]))).filter(Boolean);
      } },
    { key: 'builder', name: 'Sentence Builder', desc: 'Put the words in order to rebuild your example sentence.',
      needs: 'example sentences of 3 to 14 words',
      make: (words) => Engine.sample(words.filter((w) => w.example && w.example.split(' ').length >= 3 && w.example.split(' ').length <= 14), ROUND_SIZE).map(sentenceQuestion) },
    { key: 'scramble', name: 'Word Scramble', desc: 'Unscramble the letters to spell the word.',
      needs: 'at least 1 word',
      make: (words) => Engine.sample(words, ROUND_SIZE).map((w) =>
        typingQuestion(w, `Unscramble: ${scramble(w.term)}`, meaningOf(w), [w.term, w.term.replace(/[\s-]/g, '')], w.term)) },
    { key: 'translate', name: 'Translation Challenge', desc: 'Translate between English and Uzbek.',
      needs: 'words with Uzbek meanings',
      make: (words) => Engine.sample(words.filter((w) => w.uzbek), ROUND_SIZE).map((w) => (Math.random() < 0.5
        ? typingQuestion(w, `Translate into Uzbek: ${w.term}`, '', splitAnswers(w.uzbek), w.uzbek)
        : typingQuestion(w, `Translate into English: ${w.uzbek}`, '', [w.term], w.term))) },
    { key: 'definition', name: 'Definition Guessing', desc: 'Read a definition and type the word.',
      needs: 'words with English definitions',
      make: (words) => Engine.sample(words.filter((w) => w.definition), ROUND_SIZE)
        .map((w) => typingQuestion(w, `Which word means: “${w.definition}”?`, `starts with “${w.term[0]}”`, [w.term], w.term)) },
  ];

  /* ----- Shared game runner ----- */
  function play(game, words, exit) {
    const questions = game.make(words);
    const wordById = Object.fromEntries(words.map((w) => [w.id, w]));
    const root = el('div', { class: 'page' });
    main.replaceChildren(root);
    let index = 0; let score = 0;
    const missed = new Set();

    function showRound() {
      if (index >= questions.length) { showResults(); return; }
      let roundCorrect = true; let finished = false;
      const feedback = el('p', { class: 'feedback-line', role: 'status' });
      const next = el('button', { class: 'btn primary', type: 'button', hidden: true,
        onclick: () => { index += 1; showRound(); } }, index === questions.length - 1 ? 'See results' : 'Next');
      const ctx = {
        record(wordId, isCorrect) {
          Progress.recordAnswer(wordId, isCorrect);
          if (!isCorrect) { roundCorrect = false; missed.add(wordId); }
        },
        finish(message) {
          if (finished) return;
          finished = true;
          if (roundCorrect) score += 1;
          feedback.textContent = message;
          feedback.className = `feedback-line ${roundCorrect ? 'ok-text' : 'bad-text'}`;
          next.hidden = false;
          next.focus();
        },
        answer(wordId, isCorrect, message) { ctx.record(wordId, isCorrect); ctx.finish(message); },
      };
      root.replaceChildren(
        el('div', { class: 'row between' },
          el('button', { class: 'btn small-btn', type: 'button', onclick: exit }, '← Games Zone'),
          el('span', { class: 'muted' }, `Round ${index + 1} of ${questions.length} · Score ${score}`)),
        el('h1', {}, game.name),
        el('div', { class: 'card' }, questions[index].build(ctx), feedback, next));
      const firstInput = root.querySelector('input');
      if (firstInput) firstInput.focus();
    }

    function showResults() {
      Progress.completeExercise();
      const percent = Math.round((score / questions.length) * 100);
      const missedTerms = [...missed].map((id) => wordById[id] && wordById[id].term).filter(Boolean);
      root.replaceChildren(
        el('h1', {}, 'Game complete'),
        el('div', { class: 'card' },
          el('p', { class: 'stat-value' }, `${score} / ${questions.length}`),
          el('p', { class: 'muted' }, `${percent}% of rounds fully correct`),
          missedTerms.length
            ? el('p', {}, 'Words to review: ', el('strong', {}, missedTerms.join(', ')))
            : el('p', { class: 'ok-text' }, 'No mistakes. Excellent!'),
          el('div', { class: 'row' },
            el('button', { class: 'btn primary', type: 'button', onclick: () => play(game, words, exit) }, 'Play again'),
            el('button', { class: 'btn', type: 'button', onclick: exit }, 'Back to Games Zone'))));
      root.querySelector('h1').setAttribute('tabindex', '-1');
      root.querySelector('h1').focus();
    }

    showRound();
  }

  /* ----- Games Zone screen ----- */
  function renderZone() {
    const active = Vocab.getActive();
    if (!active || !active.words.length) {
      return el('div', { class: 'page' }, el('h1', {}, 'Games Zone'),
        el('div', { class: 'card empty' },
          el('p', { class: 'muted' }, 'Add some words first. Every game uses your own vocabulary.'),
          el('a', { class: 'btn primary', href: '#/vocabulary' }, 'Add words')));
    }
    const words = active.words;
    return el('div', { class: 'page' },
      el('h1', {}, 'Games Zone'),
      el('p', { class: 'lead' }, `Practising “${active.name}” (${words.length} ${words.length === 1 ? 'word' : 'words'}). Switch sets in My Words.`),
      el('div', { class: 'grid games' }, GAMES.map((game) => {
        const ready = game.make(words).length > 0;
        return el('div', { class: 'card game' },
          el('h3', {}, game.name),
          el('p', { class: 'muted' }, game.desc),
          ready ? null : el('p', { class: 'muted small' }, `Needs: ${game.needs}.`),
          el('button', { class: 'btn primary', type: 'button', disabled: !ready, onclick: () => play(game, words, render) }, ready ? 'Play' : 'Not available yet'));
      })));
  }

  return { renderZone };
})();