/* engine.js – the Vocabulary Engine (rule-based, NOT generative AI).
 * It only rearranges what the user typed: words, Uzbek meanings, definitions, synonyms, examples.
 * It never invents meanings. If information is missing, that exercise type is skipped
 * and the word is reported in `missing` so the user can add it.
 * Exposes one global: Engine.
 */
const Engine = (() => {
  // key, label, what the user must provide for this exercise type to be available
  const TYPES = [
    { key: 'meaning',  label: 'Meaning recognition',        needs: 'English definitions on 3+ words' },
    { key: 'enToUz',   label: 'English → Uzbek recall',     needs: 'An Uzbek meaning' },
    { key: 'uzToEn',   label: 'Uzbek → English recall',     needs: 'An Uzbek meaning' },
    { key: 'synonym',  label: 'Synonym recognition',        needs: 'Synonyms, and 3+ words in the set' },
    { key: 'cloze',    label: 'Fill in the blank',          needs: 'An example sentence containing the exact word' },
    { key: 'context',  label: 'Contextual usage',           needs: 'An example sentence containing the exact word, and 3+ words' },
    { key: 'sentence', label: 'Sentence creation',          needs: '' },
    { key: 'matching', label: 'Word–definition matching',   needs: 'English definitions on 3+ words' },
    { key: 'spelling', label: 'Spelling practice',          needs: 'An Uzbek meaning or definition' },
    { key: 'recall',   label: 'Active recall',              needs: 'An Uzbek meaning or definition' },
  ];
  const labelOf = Object.fromEntries(TYPES.map((type) => [type.key, type.label]));

  /** Fisher-Yates shuffle; returns a new array. */
  function shuffle(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
  const sample = (list, count) => shuffle(list).slice(0, count);

  /** Makes answers comparable: lower case, unified apostrophes (o‘, g‘), no end punctuation, single spaces. */
  const normalize = (text) => (text || '').toLowerCase()
    .replace(/[’‘ʻʼ`´]/g, "'").replace(/[.!?]+$/, '').replace(/\s+/g, ' ').trim();

  const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /** Replaces the exact word in a sentence with a blank. Returns null if the word is not in the sentence. */
  function blankOut(sentence, term) {
    const pattern = new RegExp(`\\b${escapeRegex(term)}\\b`, 'i');
    return pattern.test(sentence) ? sentence.replace(pattern, '_____') : null;
  }

  /** Correct answer + up to 3 different wrong answers from the user's own data. Null if fewer than 2 wrong answers exist. */
  function choiceOptions(correct, pool) {
    const seen = new Set([normalize(correct)]);
    const wrong = [];
    shuffle(pool).forEach((value) => {
      const key = normalize(value);
      if (key && !seen.has(key)) { seen.add(key); wrong.push(value); }
    });
    return wrong.length < 2 ? null : shuffle([correct, ...wrong.slice(0, 3)]);
  }

  /** Builds every exercise that the supplied information allows. */
  function build(words) {
    const exercises = [];
    const missing = [];
    const add = (type, word, data) =>
      exercises.push({ id: `${type}-${word ? word.id : 'set'}`, type, wordId: word ? word.id : null, ...data });

    words.forEach((word) => {
      const others = words.filter((other) => other.id !== word.id);
      const meaning = word.uzbek || word.definition;

      if (word.definition) {
        const options = choiceOptions(word.definition, others.map((o) => o.definition).filter(Boolean));
        if (options) add('meaning', word, { kind: 'choice', prompt: `What does “${word.term}” mean?`, options, answer: word.definition });
      }

      if (word.uzbek) {
        const uzbekAnswers = word.uzbek.split(/[,;/]/).concat(word.uzbek).map((s) => s.trim()).filter(Boolean);
        add('enToUz', word, { kind: 'typing', prompt: `Translate into Uzbek: ${word.term}`, answer: word.uzbek, accepted: uzbekAnswers });
        add('uzToEn', word, { kind: 'typing', prompt: `Translate into English: ${word.uzbek}`, answer: word.term, accepted: [word.term] });
      }

      if (word.synonyms.length) {
        const synonymKeys = word.synonyms.map(normalize);
        const pool = others.map((o) => o.term).filter((term) => !synonymKeys.includes(normalize(term)));
        const correct = shuffle(word.synonyms)[0];
        const options = choiceOptions(correct, pool);
        if (options) add('synonym', word, { kind: 'choice', prompt: `Which word is closest in meaning to “${word.term}”?`, options, answer: correct });
      }

      const blanked = word.example ? blankOut(word.example, word.term) : null;
      if (blanked) {
        add('cloze', word, { kind: 'typing', prompt: blanked, hint: meaning || '', answer: word.term, accepted: [word.term] });
        const options = choiceOptions(word.term, others.map((o) => o.term));
        if (options) add('context', word, { kind: 'choice', prompt: blanked, options, answer: word.term });
      }

      if (meaning) {
        add('spelling', word, { kind: 'typing', prompt: `Spell the English word for: ${meaning}`,
          hint: `Starts with “${word.term[0]}”, ${word.term.length} characters`, answer: word.term, accepted: [word.term] });
        add('recall', word, { kind: 'typing', prompt: `Recall the English word for: ${word.definition || word.uzbek}`,
          answer: word.term, accepted: [word.term] });
      }

      // Writing exercise: the app cannot grade free writing, so it is self-checked.
      add('sentence', word, { kind: 'writing', prompt: `Write your own sentence using “${word.term}”.`, answer: null });

      const needed = [];
      if (!word.uzbek) needed.push('Uzbek meaning');
      if (!word.definition) needed.push('English definition');
      if (!word.synonyms.length) needed.push('synonyms');
      if (!word.example) needed.push('an example sentence');
      else if (!blanked) needed.push(`an example sentence that contains “${word.term}” exactly`);
      if (needed.length) missing.push({ term: word.term, add: needed });
    });

    const defined = words.filter((word) => word.definition);
    if (defined.length >= 3) {
      const pairs = sample(defined, 6).map((word) => ({ term: word.term, definition: word.definition }));
      add('matching', null, { kind: 'matching', prompt: 'Match each word with its definition.', pairs });
    }

    const summary = TYPES.map((type) => ({ ...type, count: exercises.filter((e) => e.type === type.key).length }));
    return { exercises, missing, summary };
  }

  /** Checks an answer. Returns true/false, or null for exercises that cannot be auto-graded. */
  function check(exercise, input) {
    if (!normalize(input)) return false;
    if (exercise.kind === 'choice') return normalize(input) === normalize(exercise.answer);
    if (exercise.kind === 'typing') return exercise.accepted.map(normalize).includes(normalize(input));
    return null;
  }

  return { TYPES, labelOf, build, check, shuffle, sample, normalize, blankOut, choiceOptions };
})();