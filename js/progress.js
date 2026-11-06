/* progress.js
 * Stores answers, accuracy and practice days in localStorage. Exposes one global: Progress.
 * Phase 1 shows these numbers on the dashboard; the games (Phase 3) will call recordAnswer().
 */
const Progress = (() => {
  const STORAGE_KEY = 'lexiforge.progress.v1';
  const emptyData = () => ({ attempts: 0, correct: 0, exercises: 0, days: [], words: {} });

  let data = loadData();

  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return Object.assign(emptyData(), JSON.parse(raw));
    } catch (error) {
      console.warn('Could not read saved progress:', error);
    }
    return emptyData();
  }

  function saveData() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch (error) { console.warn('Could not save progress:', error); }
  }

  // Local calendar date as YYYY-MM-DD ("en-CA" formats dates this way).
  const dayString = (date) => date.toLocaleDateString('en-CA');

  function markToday() {
    const today = dayString(new Date());
    if (!data.days.includes(today)) data.days.push(today);
  }

  /** Records one answer for a word. */
  function recordAnswer(wordId, isCorrect) {
    data.attempts += 1;
    if (isCorrect) data.correct += 1;
    const stats = data.words[wordId] || { correct: 0, wrong: 0 };
    if (isCorrect) stats.correct += 1; else stats.wrong += 1;
    data.words[wordId] = stats;
    markToday();
    saveData();
  }

  /** Records a finished game or exercise session. */
  function completeExercise() {
    data.exercises += 1;
    markToday();
    saveData();
  }

  /** Consecutive practice days, ending today (or yesterday, so the streak is not lost before you practise today). */
  function streak() {
    const cursor = new Date();
    if (!data.days.includes(dayString(cursor))) cursor.setDate(cursor.getDate() - 1);
    let count = 0;
    while (data.days.includes(dayString(cursor))) {
      count += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }

  function summary() {
    return {
      attempts: data.attempts,
      correct: data.correct,
      exercises: data.exercises,
      accuracy: data.attempts ? Math.round((data.correct / data.attempts) * 100) : 0,
      streak: streak(),
    };
  }

  const forgetWord = (wordId) => { delete data.words[wordId]; saveData(); };
  const reset = () => { data = emptyData(); saveData(); };

  return { recordAnswer, completeExercise, summary, forgetWord, reset };
})();