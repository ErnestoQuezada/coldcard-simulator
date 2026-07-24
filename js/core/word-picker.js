/**
 * core/word-picker.js
 * ------------------------------------------------------------
 * Navigates the full 2048-word BIP39 list one word at a time, or
 * one "page" at a time for faster movement — the mechanic behind
 * the passphrase "Add Word" mode, and later reused for importing
 * an existing seed phrase word-by-word.
 *
 * DELIBERATE SIMPLIFICATION vs. the real Coldcard: the real device
 * narrows the list in tiers (pick a first-letter group, then narrow
 * further within it) rather than paging through one flat list. We
 * use a single flat, alphabetically-sorted, pageable list instead —
 * same physical interaction (step/page/confirm), less UI surface to
 * build. This is the trade-off noted when this module was planned;
 * revisit if it ever feels too slow to reach words late in the
 * alphabet.
 *
 * Pure logic, no DOM — device-state.js owns *when* a WordPicker
 * exists and what happens with the word once picked.
 */

const PAGE_SIZE = 25;

export class WordPicker {
  /** @param {string[]} wordlist - assumed already alphabetically sorted (BIP39 wordlists are) */
  constructor(wordlist) {
    this.wordlist = wordlist;
    this.index = 0;
  }

  /** @returns {string} the word currently highlighted */
  get currentWord() {
    return this.wordlist[this.index];
  }

  /** @returns {number} total words available, for a "1042 / 2048" style position readout */
  get totalWords() {
    return this.wordlist.length;
  }

  stepNext() {
    this.index = Math.min(this.index + 1, this.wordlist.length - 1);
  }

  stepPrev() {
    this.index = Math.max(this.index - 1, 0);
  }

  pageNext() {
    this.index = Math.min(this.index + PAGE_SIZE, this.wordlist.length - 1);
  }

  pagePrev() {
    this.index = Math.max(this.index - PAGE_SIZE, 0);
  }
}
