/**
 * core/seed-quiz.js
 * ------------------------------------------------------------
 * Builds the multiple-choice quiz used to confirm a user actually
 * wrote down their newly generated seed words — mirroring the real
 * Coldcard's verification flow: ask about a handful of word
 * positions, in random order, each with the correct word mixed in
 * among 2 decoys.
 *
 * Pure logic, no DOM — device-state.js owns the actual quiz-taking
 * state (current question, right/wrong handling); this module just
 * builds the questions.
 *
 * NOTE ON RANDOMNESS: this file uses Math.random(), not
 * crypto.getRandomValues(). That's deliberate and safe here — this
 * only decides which word POSITIONS to quiz and which DECOY words
 * to show alongside the real one. None of it feeds into any key,
 * seed, or address. Contrast with wallet-engine.js, where randomness
 * quality is genuinely security-critical.
 */

import { wordlist } from '@scure/bip39/wordlists/english.js';

const DEFAULT_QUESTION_COUNT = 3;
const CHOICES_PER_QUESTION = 3;

/**
 * @param {string[]} words - the 12 mnemonic words, in order
 * @param {number} [questionCount]
 * @returns {{ position: number, choices: string[], correctWord: string }[]}
 *          `position` is 0-indexed; questions are in random order.
 */
export function buildSeedQuiz(words, questionCount = DEFAULT_QUESTION_COUNT) {
  const positions = pickRandomPositions(words.length, questionCount);
  return positions.map((position) => ({
    position,
    correctWord: words[position],
    choices: buildChoices(words[position]),
  }));
}

function pickRandomPositions(total, count) {
  const all = Array.from({ length: total }, (_, i) => i);
  shuffle(all);
  return all.slice(0, count);
}

/** The correct word plus 2 decoys from the full BIP39 wordlist, shuffled. */
function buildChoices(correctWord) {
  const decoys = new Set();
  while (decoys.size < CHOICES_PER_QUESTION - 1) {
    const candidate = wordlist[Math.floor(Math.random() * wordlist.length)];
    if (candidate !== correctWord) decoys.add(candidate);
  }
  const choices = [correctWord, ...decoys];
  shuffle(choices);
  return choices;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}
