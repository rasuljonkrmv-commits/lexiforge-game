/* vocabulary.js
 * Data model + localStorage persistence for vocabulary sets.
 * Exposes one global object: Vocab.
 *
 * Shape saved in localStorage:
 * { activeSetId, sets: [ { id, name, createdAt, updatedAt,
 *     words: [ { id, term, uzbek, definition, synonyms[], example, createdAt } ] } ] }
 */
const Vocab = (() => {
  const STORAGE_KEY = 'lexiforge.vocab.v1';
  // Letters, spaces, apostrophes and hyphens: allows words and short phrases ("give up", "well-known").
  const TERM_PATTERN = /^[A-Za-z][A-Za-z' -]{0,59}$/;

  let state = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.sets)) return parsed;
      }
    } catch (error) {
      console.warn('Could not read saved vocabulary:', error);
    }
    return { activeSetId: null, sets: [] };
  }

  /** Saves to localStorage. Returns false if the browser blocked it (private mode, full storage). */
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      console.warn('Could not save vocabulary:', error);
      return false;
    }
  }

  const makeId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const clean = (text) => (text || '').replace(/\s+/g, ' ').trim();
  const parseList = (text) => clean(text).split(/[,;]/).map(clean).filter(Boolean);

  /**
   * Turns pasted text into entries. Words can be separated by commas, semicolons or new lines.
   * Optional Uzbek meaning: "apple = olma".
   */
  function parseInput(text) {
    const valid = [];
    const invalid = [];
    (text || '').split(/[,;\n]+/).map(clean).filter(Boolean).forEach((chunk) => {
      // Separator: "=" or a dash with spaces around it ("ramp up - kuchaytirmoq").
      // A hyphen inside a word ("well-known") has no spaces, so it is not treated as a separator.
      const [rawTerm, ...rest] = chunk.split(/\s+[-–—]\s+|=/);
      const term = clean(rawTerm);
      const uzbek = clean(rest.join(' - '));
      if (TERM_PATTERN.test(term)) valid.push({ term, uzbek });
      else invalid.push(chunk);
    });
    return { valid, invalid };
  }

  const getSets = () => state.sets;
  const getSet = (id) => state.sets.find((set) => set.id === id) || null;
  const getActive = () => getSet(state.activeSetId) || state.sets[0] || null;
  const totalWords = () => state.sets.reduce((sum, set) => sum + set.words.length, 0);
  const recentSets = (count) =>
    [...state.sets].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, count);

  function setActive(id) {
    if (getSet(id)) { state.activeSetId = id; saveState(); }
  }

  function createSet(name) {
    const setName = clean(name);
    if (!setName) return { error: 'Enter a name for the set.' };
    if (setName.length > 40) return { error: 'Set names can be up to 40 characters.' };
    if (state.sets.some((set) => set.name.toLowerCase() === setName.toLowerCase())) {
      return { error: `A set called “${setName}” already exists.` };
    }
    const set = { id: makeId(), name: setName, createdAt: Date.now(), updatedAt: Date.now(), words: [] };
    state.sets.push(set);
    state.activeSetId = set.id;
    saveState();
    return { set };
  }

  function deleteSet(id) {
    state.sets = state.sets.filter((set) => set.id !== id);
    if (state.activeSetId === id) state.activeSetId = state.sets[0] ? state.sets[0].id : null;
    saveState();
  }

  /**
   * Adds entries to a set and skips duplicates (case-insensitive).
   * `extra` (definition, synonyms, example) is only used when exactly one word is added.
   */
  function addWords(setId, entries, extra = {}) {
    const set = getSet(setId);
    const added = [];
    const duplicates = [];
    if (!set) return { added, duplicates, saved: false };
    entries.forEach((entry) => {
      const exists = set.words.some((word) => word.term.toLowerCase() === entry.term.toLowerCase());
      if (exists) { duplicates.push(entry.term); return; }
      const single = entries.length === 1;
      const word = {
        id: makeId(),
        term: entry.term,
        uzbek: clean(single && extra.uzbek ? extra.uzbek : entry.uzbek),
        definition: single ? clean(extra.definition) : '',
        synonyms: single ? parseList(extra.synonyms) : [],
        example: single ? clean(extra.example) : '',
        createdAt: Date.now(),
      };
      set.words.push(word);
      added.push(word);
    });
    if (added.length) set.updatedAt = Date.now();
    return { added, duplicates, saved: saveState() };
  }

  function updateWord(setId, wordId, fields) {
    const set = getSet(setId);
    const word = set && set.words.find((item) => item.id === wordId);
    if (!word) return { error: 'That word no longer exists.' };
    const term = clean(fields.term);
    if (!TERM_PATTERN.test(term)) return { error: 'Use letters, spaces, apostrophes or hyphens only (max 60 characters).' };
    const clash = set.words.some((item) => item.id !== wordId && item.term.toLowerCase() === term.toLowerCase());
    if (clash) return { error: `“${term}” is already in this set.` };
    Object.assign(word, {
      term,
      uzbek: clean(fields.uzbek),
      definition: clean(fields.definition),
      synonyms: parseList(fields.synonyms),
      example: clean(fields.example),
    });
    set.updatedAt = Date.now();
    saveState();
    return { word };
  }

  function deleteWord(setId, wordId) {
    const set = getSet(setId);
    if (!set) return;
    set.words = set.words.filter((word) => word.id !== wordId);
    set.updatedAt = Date.now();
    saveState();
  }

  return { parseInput, getSets, getSet, getActive, setActive, createSet, deleteSet,
           addWords, updateWord, deleteWord, totalWords, recentSets };
})();