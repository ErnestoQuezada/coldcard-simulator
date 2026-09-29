/**
 * core/device-state.js
 * ------------------------------------------------------------
 * The simulated Coldcard "operating system": boot -> wallet
 * creation -> welcome -> main menu, the "New Seed Words" flow
 * (display 12 words, then a multiple-choice quiz), and the
 * "Passphrase" flow (build a BIP39 passphrase from words/numbers,
 * preview its fingerprint, then apply or cancel).
 *
 * KEY DESIGN FACT: a real Coldcard, once set up, ALWAYS has a
 * wallet loaded — that's why "Ready To Sign" is the first menu
 * item, it presumes something exists to sign with. We mirror that:
 * every device instance restores the most recently saved wallet when
 * browser-local storage has one, otherwise it generates a random wallet
 * before the menu is ever reachable. "New Seed Words",
 * "Passphrase", and (later) "Import Seed" don't create the FIRST
 * wallet — they REPLACE whichever one is currently active.
 *
 * PASSPHRASE DESIGN NOTE: applying a passphrase never changes the
 * seed words — it derives a completely different (but fully
 * deterministic) wallet from the SAME words plus whatever text was
 * entered. See wallet-engine.js's Wallet class for why an empty and
 * a non-empty passphrase are two totally unrelated wallets, not a
 * "modifier" on one wallet. Every time the Passphrase menu is
 * entered, the draft starts empty — the previously active
 * passphrase (if any) is never redisplayed, matching how a real
 * Coldcard never re-shows sensitive text it already accepted.
 *
 * This module imports core/wallet-engine.js, core/seed-quiz.js, and
 * core/word-picker.js (all equally DOM-free) to do the actual
 * crypto/quiz/list-navigation work. This file only decides WHEN
 * those happen and what's on screen.
 */

import {
  generateNewMnemonic,
  isValidMnemonic,
  Wallet,
} from "./wallet-engine.js";
import { buildSeedQuiz } from "./seed-quiz.js";
import { WordPicker } from "./word-picker.js";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { deriveAddress, SCRIPT_TYPES } from "./address-explorer.js";
import {
  parsePsbt,
  buildReviewSummary,
  signRecognizedInputs,
  finalizeOrExportPartial,
  signedFilename,
} from "./psbt-signer.js";
import {
  MultisigWallet,
  buildCosignerExport,
  cosignerExportFilename,
  cosignerFromExportJson,
  buildMultisigConfigText,
  parseMultisigConfigText,
} from "./multisig-wallet.js";

/** Every screen the simulator can currently show. */
export const AppState = Object.freeze({
  BOOT: "boot",
  CREATING_WALLET: "creating_wallet",
  WELCOME: "welcome",
  MENU: "menu",
  SEED_DISPLAY: "seed_display", // showing newly generated words, not yet committed
  SEED_QUIZ: "seed_quiz", // multiple-choice verification of those words
  PASSPHRASE_MENU: "passphrase_menu", // Add Word / Add Numbers / Clear All / Apply / Cancel
  PASSPHRASE_ADD_WORD: "passphrase_add_word", // navigating the BIP39 wordlist
  PASSPHRASE_ADD_NUMBERS: "passphrase_add_numbers", // typing digits directly
  PASSPHRASE_APPLY_PREVIEW: "passphrase_apply_preview", // shows resulting XFP before committing
  IMPORT_SEED_LENGTH: "import_seed_length", // choose 12, 18, or 24 words before entry
  IMPORT_SEED_WORD: "import_seed_word", // entering seed words via the same WordPicker as Add Word
  IMPORT_SEED_REVIEW: "import_seed_review", // all words entered + checksum valid — shows resulting XFP before committing
  ADVANCED_MENU: "advanced_menu", // Export Wallet / Back
  WALLET_STORAGE_MENU: "wallet_storage_menu", // Save / Load / Delete / Back
  WALLET_STORAGE_LOAD: "wallet_storage_load", // choose a saved wallet
  ADDRESS_TYPE_MENU: "address_type_menu", // choose Legacy / Nested Segwit / Native Segwit
  ADDRESS_VIEW: "address_view", // paginate index, toggle receive/change, within the chosen type
  PSBT_LOADING: "psbt_loading", // brief "Reading... / Validating..." — genuine parsing happens here
  PSBT_REVIEW: "psbt_review", // inputs/outputs/fee, change highlighted, before signing
  PSBT_SIGNED: "psbt_signed", // confirmation + the signed file has been offered for download
  PSBT_ERROR: "psbt_error", // couldn't parse, or nothing recognized to sign, or finalize failed
  SETTINGS_MENU: "settings_menu", // Multisig Wallets / Back
  MULTISIG_MENU: "multisig_menu", // Export XPUB / Create Multisig Wallet / Import from SD / View Registered Wallet / Back
  MULTISIG_CREATE_REVIEW: "multisig_create_review", // about-to-create summary, before confirming
  MULTISIG_INFO: "multisig_info", // registered wallet's name/policy/first address
  MULTISIG_ERROR: "multisig_error", // malformed file, or the "your own key isn't in this file" security refusal
});

/** How long the "creating wallet" curtain animation plays, in ~60fps frames. */
const WALLET_CREATION_FRAMES = 60; // ~1 second

/** How long the "Reading... / Validating..." curtain plays before showing the review screen. */
const PSBT_LOADING_FRAMES = 40; // ~0.66 second — first half "Reading...", second half "Validating..."

/** Passphrase submenu items, in the order the real Coldcard shows them. */
const PASSPHRASE_MENU_ITEMS = [
  "Add Word",
  "Add Numbers",
  "Clear All",
  "Apply",
  "Cancel",
];

/** Real Coldcard caps "Add Numbers" entry at 32 digits per use. */
const MAX_NUMBER_DIGITS = 32;

/**
 * This simulator's own limit (the real Coldcard allows much longer
 * passphrases assembled from many parts) — capped at 2 so the
 * Apply-preview screen can always show every part in full, on its
 * own line, for backup. See device-state.js file header.
 */
const MAX_PASSPHRASE_CHUNKS = 2;

/** BIP39 mnemonic lengths supported by the real Coldcard import flow. */
const IMPORT_WORD_COUNTS = [12, 18, 24];

/**
 * Advanced/Tools submenu — real Coldcard has many more entries here;
 * this simulator only implements the one this project needs right
 * now. Add more items to this list as more Advanced/Tools features
 * get built, the same way this list itself started as just this one.
 */
const ADVANCED_MENU_ITEMS = ["Export Wallet", "Back"];

/** Wallet persistence actions backed by this browser's local storage. */
const WALLET_STORAGE_ITEMS = [
  "Save Current Wallet",
  "Load Saved Wallet",
  "Delete Saved Wallet",
  "Back",
];

/** Settings — real Coldcard has many more entries here too; same scope note as above. */
const SETTINGS_MENU_ITEMS = ["Multisig Wallets", "Back"];

/** Multisig Wallets submenu, under Settings. */
const MULTISIG_MENU_ITEMS = [
  "Export XPUB",
  "Create Multisig Wallet",
  "Import from SD",
  "View Registered Wallet",
  "Back",
];

/** This simulator's fixed multisig policy — see project scope notes (native segwit, 2-of-2 only). */
const MULTISIG_M = 2;
const MULTISIG_NAME = "Coldcard-Web-Sim";

export class DeviceStateMachine {
  /**
   * @param {string[]} menuItems - labels for the main menu, in order.
   * @param {object} [callbacks]
   * @param {(wallet: import('./wallet-engine.js').Wallet) => void} [callbacks.onExportRequested] -
   *   called with the current wallet when the user selects "Export Wallet".
   *   This is the ONLY way this class ever reaches outside itself — it
   *   never imports io/file-io.js or touches the DOM directly. See
   *   device-instance.js for where this callback is provided and what
   *   it actually does (download a file).
   * @param {() => void} [callbacks.onSignRequested] - called when the
   *   user selects "Ready To Sign". device-instance.js opens the file
   *   picker (async, hence a callback rather than a return value) and
   *   reports back via handlePsbtFileLoaded()/handlePsbtLoadCancelled().
   * @param {(filename: string, bytes: Uint8Array) => void} [callbacks.onPsbtSigned] -
   *   called with the final signed transaction bytes once signing
   *   succeeds, so device-instance.js can download it.
   * @param {(wallet: import('./wallet-engine.js').Wallet) => void} [callbacks.onExportCosignerRequested] -
   *   called when the user selects "Export XPUB" under Multisig Wallets.
   * @param {() => void} [callbacks.onCombineRequested] - called when
   *   the user selects "Create Multisig Wallet"; device-instance.js
   *   opens a file picker for the OTHER cosigner's ccxp export and
   *   reports back via handleCosignerFileLoaded().
   * @param {() => void} [callbacks.onRegisterRequested] - called when
   *   the user selects "Import from SD"; device-instance.js opens a
   *   file picker for a combined multisig config file and reports
   *   back via handleRegisterFileLoaded().
   * @param {(filename: string, text: string) => void} [callbacks.onMultisigConfigReady] -
   *   called with the combined config text once "Create Multisig
   *   Wallet" is confirmed, so device-instance.js can download it.
   * @param {(wallet: import('./wallet-engine.js').Wallet) => Promise<object>|void} [callbacks.onWalletSaveRequested]
   * @param {() => Promise<object[]>|void} [callbacks.onWalletListRequested]
   * @param {(record: object) => Promise<import('./wallet-engine.js').Wallet>|void} [callbacks.onWalletLoadRequested]
   * @param {(id: string|number) => Promise<void>|void} [callbacks.onWalletDeleteRequested]
   * @param {(wallet: import('./multisig-wallet.js').MultisigWallet) => Promise<object>|void} [callbacks.onMultisigSaveRequested]
   * @param {() => Promise<object[]>|void} [callbacks.onMultisigListRequested]
   * @param {(record: object) => Promise<import('./multisig-wallet.js').MultisigWallet>|void} [callbacks.onMultisigLoadRequested]
   */
  constructor(
    menuItems,
    {
      onExportRequested,
      onSignRequested,
      onPsbtSigned,
      onExportCosignerRequested,
      onCombineRequested,
      onRegisterRequested,
      onMultisigConfigReady,
      onWalletSaveRequested,
      onWalletListRequested,
      onWalletLoadRequested,
      onWalletDeleteRequested,
      onMultisigSaveRequested,
      onMultisigListRequested,
      onMultisigLoadRequested,
    } = {},
  ) {
    this.menuItems = menuItems;
    this._onExportRequested = onExportRequested || (() => {});
    this._onSignRequested = onSignRequested || (() => {});
    this._onPsbtSigned = onPsbtSigned || (() => {});
    this._onExportCosignerRequested = onExportCosignerRequested || (() => {});
    this._onCombineRequested = onCombineRequested || (() => {});
    this._onRegisterRequested = onRegisterRequested || (() => {});
    this._onMultisigConfigReady = onMultisigConfigReady || (() => {});
    this._onWalletSaveRequested =
      onWalletSaveRequested || (() => Promise.resolve());
    this._onWalletListRequested =
      onWalletListRequested || (() => Promise.resolve([]));
    this._onWalletLoadRequested =
      onWalletLoadRequested || (() => Promise.resolve(null));
    this._onWalletDeleteRequested =
      onWalletDeleteRequested || (() => Promise.resolve());
    this._onMultisigSaveRequested =
      onMultisigSaveRequested || (() => Promise.resolve());
    this._onMultisigListRequested =
      onMultisigListRequested || (() => Promise.resolve([]));
    this._onMultisigLoadRequested =
      onMultisigLoadRequested || (() => Promise.resolve(null));

    // Refreshing the page starts a new device instance. Resolve both the
    // seed wallet and registered multisig policy before the boot curtain
    // hands control to the UI.
    this.initialWallet = null;
    this.initialMultisigWallet = null;
    this.initialStorageReady = false;
    Promise.allSettled([
      Promise.resolve(this._onWalletListRequested()).then((wallets) =>
        wallets.length ? this._onWalletLoadRequested(wallets[0]) : null,
      ),
      Promise.resolve(this._onMultisigListRequested()).then(
        (multisigWallets) =>
          multisigWallets.length
            ? this._onMultisigLoadRequested(multisigWallets[0])
            : null,
      ),
    ]).then(([walletResult, multisigResult]) => {
      // One storage record must not prevent the other kind of wallet from
      // being restored. A failed single-sig load still permits multisig use,
      // and vice versa.
      if (walletResult.status === "fulfilled") {
        this.initialWallet = walletResult.value;
      }
      if (multisigResult.status === "fulfilled") {
        this.initialMultisigWallet = multisigResult.value;
        this.multisigWallet = multisigResult.value;
      }
      this.initialStorageReady = true;
    });

    this.state = AppState.BOOT;
    this.bootProgress = 0; // 0..1, drives the boot progress bar
    this.walletCreationProgress = 0; // 0..1, drives the "creating wallet" curtain

    /** @type {import('./wallet-engine.js').Wallet|null} the device's current wallet; null only during BOOT */
    this.wallet = null;

    // --- New Seed Words flow state (all cleared once committed or cancelled) ---
    this.pendingMnemonic = null; // string, not yet a committed Wallet
    this.seedScrollIndex = 0; // which word is at the top of the visible window
    this.quiz = null; // built by buildSeedQuiz() once the user finishes reviewing
    this.quizIndex = 0; // which quiz question we're on
    this.quizNotice = null; // e.g. 'incorrect' — shown briefly, cleared on next attempt

    // --- Passphrase flow state (all cleared once applied or cancelled) ---
    this.passphraseMenuIndex = 0;
    // Capped at MAX_PASSPHRASE_CHUNKS (see below) so every part entered
    // can always be shown IN FULL on one line for backup purposes —
    // no truncation, ever, for text this sensitive.
    this.passphraseChunks = []; // e.g. ['addict', '481920'] — always starts empty (see file header)
    this.passphraseNotice = null; // e.g. the "max parts reached" hint — cleared on next input
    this.wordPicker = null; // active only during PASSPHRASE_ADD_WORD
    this.numberDraft = ""; // digits typed so far, active only during PASSPHRASE_ADD_NUMBERS
    this.pendingPassphraseWallet = null; // preview Wallet built by "Apply", not yet committed

    // --- Import Seed flow state (all cleared once committed or cancelled) ---
    this.importWords = []; // confirmed words so far, in order
    this.importWordCount = null;
    this.importLengthIndex = 0;
    this.importWordPicker = null; // WordPicker for whichever position is currently being entered
    this.importNotice = null; // e.g. 'invalid checksum' — cleared on next attempt
    this.pendingImportWallet = null; // preview Wallet built once all selected words check out

    // --- Advanced/Tools submenu state ---
    this.advancedMenuIndex = 0;
    this.advancedNotice = null; // e.g. 'wallet exported' — cleared on next input

    // --- Wallet storage state ---
    this.walletStorageIndex = 0;
    this.walletStorageNotice = null;
    this.savedWallets = [];
    this.savedWalletIndex = 0;

    // --- Address Explorer state ---
    this.addressTypeIndex = 0; // which of SCRIPT_TYPES is highlighted in the type menu
    this.firstAddresses = []; // one first-receive-address per script type, for the safety-comparison screen
    this.addressScriptType = null; // the chosen SCRIPT_TYPES[].id, once past the type menu
    this.addressChain = 0; // 0 = receive, 1 = change
    this.addressIndex = 0; // address index within that chain
    this.currentAddress = null; // cached — computed by _refreshAddressView(), never in the render loop
    this.currentAddressPath = null;

    // --- PSBT signing state (all cleared once returning to MENU) ---
    this.psbtLoadingProgress = 0; // 0..1, drives the Reading.../Validating... curtain
    this.psbtFilename = null; // the uploaded file's original name
    this.psbtTransaction = null; // the parsed @scure/btc-signer Transaction, held across states
    this.psbtSummary = null; // built by buildReviewSummary() once parsed
    this.psbtError = null; // human-readable message shown on PSBT_ERROR
    this.psbtIsFinal = true; // false means the last sign only added a partial (multisig) signature

    // --- Settings / Multisig Wallets state ---
    this.settingsMenuIndex = 0;
    this.multisigMenuIndex = 0;
    this.multisigWallet = null; // registered MultisigWallet, or null if none yet
    this.multisigNotice = null; // e.g. 'exported ccxp-....json' — cleared on next input
    this.multisigError = null; // shown on MULTISIG_ERROR — includes the security-refusal message
    this.pendingMultisigConfig = null; // { configText, name, m, cosigners } — built, not yet confirmed
    this.multisigFirstAddress = null; // cached — computed when entering MULTISIG_INFO, never in the render loop
  }

  /** The full passphrase text used for derivation — chunks joined the same way the real device does. */
  get passphraseDraft() {
    return this.passphraseChunks.join(" ");
  }

  /**
   * Advances whichever transitional animation is currently playing
   * (boot progress bar, or the wallet-creation curtain). Call once
   * per rendered frame; no-ops for any other state.
   */
  tick() {
    if (this.state === AppState.BOOT) {
      this.bootProgress = Math.min(1, this.bootProgress + 0.018);
      if (this.bootProgress >= 1 && this.initialStorageReady) {
        this._enterCreatingWallet();
      }
      return;
    }

    if (this.state === AppState.CREATING_WALLET) {
      this.walletCreationProgress = Math.min(
        1,
        this.walletCreationProgress + 1 / WALLET_CREATION_FRAMES,
      );
      if (this.walletCreationProgress >= 1) {
        this.state = AppState.WELCOME;
      }
      return;
    }

    if (this.state === AppState.PSBT_LOADING) {
      this.psbtLoadingProgress = Math.min(
        1,
        this.psbtLoadingProgress + 1 / PSBT_LOADING_FRAMES,
      );
      if (this.psbtLoadingProgress >= 1) {
        this.state = this.psbtError
          ? AppState.PSBT_ERROR
          : AppState.PSBT_REVIEW;
      }
    }
  }

  /** Generates this device's first wallet and starts the curtain animation. */
  _enterCreatingWallet() {
    this.state = AppState.CREATING_WALLET;
    this.walletCreationProgress = 0;
    // The derivation itself is instant (see wallet-engine.js) — the
    // curtain that follows is a deliberately honest presentation
    // delay, not a simulation of "gathering enough randomness".
    this.wallet = this.initialWallet || new Wallet(generateNewMnemonic());
    this.initialWallet = null;
  }

  /**
   * Single entry point for ALL input — whether it came from a mouse
   * click on the on-screen keypad or a physical keyboard press.
   * @param {string} key - one of '0'-'9', 'ok', or 'x'
   */
  handleKey(key) {
    switch (this.state) {
      case AppState.WELCOME:
        return this._handleWelcomeKey(key);
      case AppState.MENU:
        return this._handleMenuKey(key);
      case AppState.SEED_DISPLAY:
        return this._handleSeedDisplayKey(key);
      case AppState.SEED_QUIZ:
        return this._handleSeedQuizKey(key);
      case AppState.PASSPHRASE_MENU:
        return this._handlePassphraseMenuKey(key);
      case AppState.PASSPHRASE_ADD_WORD:
        return this._handlePassphraseAddWordKey(key);
      case AppState.PASSPHRASE_ADD_NUMBERS:
        return this._handlePassphraseAddNumbersKey(key);
      case AppState.PASSPHRASE_APPLY_PREVIEW:
        return this._handlePassphraseApplyPreviewKey(key);
      case AppState.IMPORT_SEED_LENGTH:
        return this._handleImportSeedLengthKey(key);
      case AppState.IMPORT_SEED_WORD:
        return this._handleImportSeedWordKey(key);
      case AppState.IMPORT_SEED_REVIEW:
        return this._handleImportSeedReviewKey(key);
      case AppState.ADVANCED_MENU:
        return this._handleAdvancedMenuKey(key);
      case AppState.WALLET_STORAGE_MENU:
        return this._handleWalletStorageMenuKey(key);
      case AppState.WALLET_STORAGE_LOAD:
        return this._handleWalletStorageLoadKey(key);
      case AppState.ADDRESS_TYPE_MENU:
        return this._handleAddressTypeMenuKey(key);
      case AppState.ADDRESS_VIEW:
        return this._handleAddressViewKey(key);
      case AppState.PSBT_REVIEW:
        return this._handlePsbtReviewKey(key);
      case AppState.PSBT_SIGNED:
        return this._handlePsbtSignedKey(key);
      case AppState.PSBT_ERROR:
        return this._handlePsbtErrorKey(key);
      case AppState.SETTINGS_MENU:
        return this._handleSettingsMenuKey(key);
      case AppState.MULTISIG_MENU:
        return this._handleMultisigMenuKey(key);
      case AppState.MULTISIG_CREATE_REVIEW:
        return this._handleMultisigCreateReviewKey(key);
      case AppState.MULTISIG_INFO:
        return this._handleMultisigInfoKey(key);
      case AppState.MULTISIG_ERROR:
        return this._handleMultisigErrorKey(key);
      default:
        return; // BOOT / CREATING_WALLET ignore input
    }
  }

  _handleWelcomeKey(key) {
    if (key === "ok") {
      this.state = AppState.MENU;
      this.menuIndex = 0;
    }
  }

  _handleMenuKey(key) {
    const count = this.menuItems.length;
    if (key === "8") this.menuIndex = (this.menuIndex + 1) % count; // down
    if (key === "5") this.menuIndex = (this.menuIndex - 1 + count) % count; // up
    if (key === "x") this.state = AppState.WELCOME; // back

    if (key === "ok") {
      const selected = this.menuItems[this.menuIndex];

      if (selected === "New Seed Words") {
        this._startNewSeedFlow();
        return;
      }

      if (selected === "Passphrase") {
        this._startPassphraseFlow();
        return;
      }

      if (selected === "Import Seed") {
        this._startImportSeedFlow();
        return;
      }

      if (selected === "Advanced/Tools") {
        this.advancedMenuIndex = 0;
        this.advancedNotice = null;
        this.state = AppState.ADVANCED_MENU;
        return;
      }

      if (selected === "Wallet Storage") {
        this.walletStorageIndex = 0;
        this.walletStorageNotice = null;
        this.state = AppState.WALLET_STORAGE_MENU;
        return;
      }

      if (selected === "Address Explorer") {
        this._startAddressExplorer();
        return;
      }

      if (selected === "Ready To Sign") {
        // The actual file picking is async and DOM-touching — see the
        // constructor's callbacks doc. This class stays in MENU until
        // handlePsbtFileLoaded() or handlePsbtLoadCancelled() is called.
        this._onSignRequested();
        return;
      }

      if (selected === "Settings") {
        this.settingsMenuIndex = 0;
        this.state = AppState.SETTINGS_MENU;
        return;
      }

      // --------------------------------------------------------
      // PHASE 2 WIRING POINT (remaining items)
      // Any further menu items still need their own flows. Add a
      // branch here the same way the ones above were.
      // --------------------------------------------------------
    }
  }

  // ============================================================
  // New Seed Words flow
  // ============================================================

  /** Generates a NEW candidate mnemonic (not yet committed) and shows it for review. */
  _startNewSeedFlow() {
    this.pendingMnemonic = generateNewMnemonic();
    this.seedScrollIndex = 0;
    this.quizNotice = null;
    this.state = AppState.SEED_DISPLAY;
  }

  _handleSeedDisplayKey(key) {
    const words = this.pendingMnemonic.split(" ");

    if (key === "8")
      this.seedScrollIndex = Math.min(
        this.seedScrollIndex + 1,
        words.length - 1,
      );
    if (key === "5")
      this.seedScrollIndex = Math.max(this.seedScrollIndex - 1, 0);

    if (key === "x") {
      // Cancel — the CURRENT wallet is untouched, nothing was ever committed.
      this.pendingMnemonic = null;
      this.state = AppState.MENU;
      return;
    }

    if (key === "ok") {
      this.quiz = buildSeedQuiz(words);
      this.quizIndex = 0;
      this.quizNotice = null;
      this.state = AppState.SEED_QUIZ;
    }
  }

  _handleSeedQuizKey(key) {
    if (key === "x") {
      // Cancel the whole flow, back to the menu, current wallet untouched.
      this.pendingMnemonic = null;
      this.quiz = null;
      this.state = AppState.MENU;
      return;
    }

    const choiceIndex = { 1: 0, 2: 1, 3: 2 }[key];
    if (choiceIndex === undefined) return;

    const question = this.quiz[this.quizIndex];
    const answeredCorrectly =
      question.choices[choiceIndex] === question.correctWord;

    if (!answeredCorrectly) {
      // Wrong answer: don't reveal which one was right — send them back
      // to re-read all words from the start, same as a real backup check.
      this.quizNotice = "incorrect — review your words again";
      this.seedScrollIndex = 0;
      this.state = AppState.SEED_DISPLAY;
      return;
    }

    this.quizIndex += 1;
    if (this.quizIndex >= this.quiz.length) {
      // All questions answered correctly — COMMIT: this replaces the
      // device's current wallet with the newly confirmed one.
      this.wallet = new Wallet(this.pendingMnemonic);
      this.pendingMnemonic = null;
      this.quiz = null;
      this.state = AppState.MENU;
    }
  }

  // ============================================================
  // Passphrase flow
  // ============================================================

  /** Enters the Passphrase submenu with an always-empty draft (see file header). */
  _startPassphraseFlow() {
    this.passphraseMenuIndex = 0;
    this.passphraseChunks = [];
    this.passphraseNotice = null;
    this.state = AppState.PASSPHRASE_MENU;
  }

  _handlePassphraseMenuKey(key) {
    const count = PASSPHRASE_MENU_ITEMS.length;
    if (key === "8")
      this.passphraseMenuIndex = (this.passphraseMenuIndex + 1) % count;
    if (key === "5")
      this.passphraseMenuIndex = (this.passphraseMenuIndex - 1 + count) % count;

    if (key === "x") {
      // Cancel the whole passphrase flow — current wallet untouched.
      this._resetPassphraseDraftState();
      this.state = AppState.MENU;
      return;
    }

    if (key !== "ok") return;

    this.passphraseNotice = null; // clear any previous notice before acting on this press

    switch (PASSPHRASE_MENU_ITEMS[this.passphraseMenuIndex]) {
      case "Add Word":
        if (this.passphraseChunks.length >= MAX_PASSPHRASE_CHUNKS) {
          this.passphraseNotice = `max ${MAX_PASSPHRASE_CHUNKS} parts — Clear All to redo`;
          break;
        }
        this.wordPicker = new WordPicker(wordlist);
        this.state = AppState.PASSPHRASE_ADD_WORD;
        break;
      case "Add Numbers":
        if (this.passphraseChunks.length >= MAX_PASSPHRASE_CHUNKS) {
          this.passphraseNotice = `max ${MAX_PASSPHRASE_CHUNKS} parts — Clear All to redo`;
          break;
        }
        this.numberDraft = "";
        this.state = AppState.PASSPHRASE_ADD_NUMBERS;
        break;
      case "Clear All":
        this.passphraseChunks = [];
        break;
      case "Apply":
        // Preview only — nothing is committed until the user
        // confirms on the preview screen.
        this.pendingPassphraseWallet = new Wallet(
          this.wallet.mnemonic,
          this.passphraseDraft,
        );
        this.state = AppState.PASSPHRASE_APPLY_PREVIEW;
        break;
      case "Cancel":
        this._resetPassphraseDraftState();
        this.state = AppState.MENU;
        break;
    }
  }

  _handlePassphraseAddWordKey(key) {
    if (key === "8") this.wordPicker.stepNext();
    if (key === "5") this.wordPicker.stepPrev();
    if (key === "9") this.wordPicker.pageNext();
    if (key === "7") this.wordPicker.pagePrev();

    if (key === "x") {
      this.wordPicker = null;
      this.state = AppState.PASSPHRASE_MENU;
      return;
    }

    if (key === "ok") {
      this._addPassphraseChunk(this.wordPicker.currentWord);
      this.wordPicker = null;
      this.state = AppState.PASSPHRASE_MENU;
    }
  }

  _handlePassphraseAddNumbersKey(key) {
    if (/^[0-9]$/.test(key) && this.numberDraft.length < MAX_NUMBER_DIGITS) {
      this.numberDraft += key;
      return;
    }

    if (key === "x") {
      if (this.numberDraft.length > 0) {
        this.numberDraft = this.numberDraft.slice(0, -1); // backspace
      } else {
        this.state = AppState.PASSPHRASE_MENU; // nothing left to erase — cancel this step
      }
      return;
    }

    if (key === "ok" && this.numberDraft.length > 0) {
      this._addPassphraseChunk(this.numberDraft);
      this.numberDraft = "";
      this.state = AppState.PASSPHRASE_MENU;
    }
  }

  _handlePassphraseApplyPreviewKey(key) {
    if (key === "ok") {
      // COMMIT: this replaces the device's current wallet. Same 12
      // words as before, completely different fingerprint/keys.
      this.wallet = this.pendingPassphraseWallet;
      this._resetPassphraseDraftState();
      this.state = AppState.MENU;
      return;
    }

    if (key === "x") {
      // Back to editing — the draft text is kept, only the preview is discarded.
      this.pendingPassphraseWallet = null;
      this.state = AppState.PASSPHRASE_MENU;
    }
  }

  /** Appends a word or number chunk to the draft (capped, see MAX_PASSPHRASE_CHUNKS). */
  _addPassphraseChunk(chunk) {
    if (this.passphraseChunks.length >= MAX_PASSPHRASE_CHUNKS) return; // shouldn't happen — caller already checked
    this.passphraseChunks.push(chunk);
  }

  _resetPassphraseDraftState() {
    this.passphraseChunks = [];
    this.passphraseNotice = null;
    this.wordPicker = null;
    this.numberDraft = "";
    this.pendingPassphraseWallet = null;
  }

  // ============================================================
  // Import Seed flow
  // ============================================================
  // Reuses WordPicker (core/word-picker.js) — the exact same
  // wordlist-navigation mechanic as the passphrase's "Add Word"
  // mode, just run once per selected word count to rebuild an existing
  // mnemonic instead of building one passphrase chunk.

  /** Opens the real device's 12/18/24-word length selection. */
  _startImportSeedFlow() {
    this.importLengthIndex = 0;
    this.importNotice = null;
    this.state = AppState.IMPORT_SEED_LENGTH;
  }

  _handleImportSeedLengthKey(key) {
    if (key === "8") {
      this.importLengthIndex =
        (this.importLengthIndex + 1) % IMPORT_WORD_COUNTS.length;
    }
    if (key === "5") {
      this.importLengthIndex =
        (this.importLengthIndex - 1 + IMPORT_WORD_COUNTS.length) %
        IMPORT_WORD_COUNTS.length;
    }
    if (key === "x") {
      this.state = AppState.MENU;
      return;
    }
    if (key === "ok") {
      this.importWordCount = IMPORT_WORD_COUNTS[this.importLengthIndex];
      this.importWords = [];
      this.importNotice = null;
      this.importWordPicker = new WordPicker(wordlist);
      this.state = AppState.IMPORT_SEED_WORD;
    }
  }

  _handleImportSeedWordKey(key) {
    if (key === "8") this.importWordPicker.stepNext();
    if (key === "5") this.importWordPicker.stepPrev();
    if (key === "9") this.importWordPicker.pageNext();
    if (key === "7") this.importWordPicker.pagePrev();

    if (key === "x") {
      if (this.importWords.length === 0) {
        // Nothing confirmed yet — cancel the whole flow, current wallet untouched.
        this._resetImportSeedState();
        this.state = AppState.MENU;
        return;
      }
      // Otherwise, step back to re-enter the previous word. The picker
      // reopens at that word's position rather than the start of the
      // list, so correcting a typo doesn't cost you your place.
      const previousWord = this.importWords.pop();
      this.importWordPicker = this._wordPickerAt(previousWord);
      return;
    }

    if (key !== "ok") return;

    this.importWords.push(this.importWordPicker.currentWord);

    if (this.importWords.length < this.importWordCount) {
      this.importWordPicker = new WordPicker(wordlist);
      return;
    }

    // All selected words entered — validate the checksum before showing any preview.
    const candidate = this.importWords.join(" ");
    if (isValidMnemonic(candidate)) {
      this.pendingImportWallet = new Wallet(candidate);
      this.importNotice = null;
      this.state = AppState.IMPORT_SEED_REVIEW;
    } else {
      // Don't guess which word is wrong — just reopen the last slot
      // for correction, same "back up one step" motion as pressing X.
      this.importNotice = "invalid checksum — check your last word";
      this.importWords.pop();
      this.importWordPicker = new WordPicker(wordlist);
    }
  }

  _handleImportSeedReviewKey(key) {
    if (key === "ok") {
      // COMMIT: this replaces the device's current wallet.
      this.wallet = this.pendingImportWallet;
      // An imported seed is already confirmed at this point, so persist it
      // immediately instead of requiring a second save action.
      Promise.resolve(this._onWalletSaveRequested(this.wallet)).catch(() => {
        this.walletStorageNotice = "wallet imported, but could not be saved";
      });
      this._resetImportSeedState();
      this.state = AppState.MENU;
      return;
    }

    if (key === "x") {
      // Back to re-editing word 12 — words 1-11 are kept as entered.
      const previousWord = this.importWords.pop();
      this.importWordPicker = this._wordPickerAt(previousWord);
      this.pendingImportWallet = null;
      this.importNotice = null;
      this.state = AppState.IMPORT_SEED_WORD;
    }
  }

  /** A WordPicker already positioned at a known word, so re-editing a slot doesn't lose your place in the list. */
  _wordPickerAt(word) {
    const picker = new WordPicker(wordlist);
    const index = wordlist.indexOf(word);
    if (index !== -1) picker.index = index;
    return picker;
  }

  _resetImportSeedState() {
    this.importWords = [];
    this.importWordCount = null;
    this.importLengthIndex = 0;
    this.importWordPicker = null;
    this.importNotice = null;
    this.pendingImportWallet = null;
  }

  // ============================================================
  // Advanced/Tools submenu
  // ============================================================

  _handleAdvancedMenuKey(key) {
    const count = ADVANCED_MENU_ITEMS.length;
    if (key === "8")
      this.advancedMenuIndex = (this.advancedMenuIndex + 1) % count;
    if (key === "5")
      this.advancedMenuIndex = (this.advancedMenuIndex - 1 + count) % count;
    if (key === "x") {
      this.advancedNotice = null;
      this.state = AppState.MENU;
      return;
    }

    if (key !== "ok") return;

    this.advancedNotice = null; // clear any previous notice before acting on this press

    switch (ADVANCED_MENU_ITEMS[this.advancedMenuIndex]) {
      case "Export Wallet":
        // The actual file download happens outside this class — see
        // the constructor's callbacks doc. This class only decides
        // WHEN to ask for it and shows a brief on-screen confirmation.
        this._onExportRequested(this.wallet);
        this.advancedNotice = "exported coldcard-export.json";
        break;
      case "Back":
        this.state = AppState.MENU;
        break;
    }
  }

  // ============================================================
  // Wallet storage
  // ============================================================

  _handleWalletStorageMenuKey(key) {
    const count = WALLET_STORAGE_ITEMS.length;
    if (key === "8")
      this.walletStorageIndex = (this.walletStorageIndex + 1) % count;
    if (key === "5")
      this.walletStorageIndex = (this.walletStorageIndex - 1 + count) % count;
    if (key === "x") {
      this.walletStorageNotice = null;
      this.state = AppState.MENU;
      return;
    }
    if (key !== "ok") return;

    this.walletStorageNotice = null;
    switch (WALLET_STORAGE_ITEMS[this.walletStorageIndex]) {
      case "Save Current Wallet":
        this._onWalletSaveRequested(this.wallet)
          .then(() => {
            this.walletStorageNotice = `saved wallet ${this.wallet.fingerprint}`;
          })
          .catch(() => {
            this.walletStorageNotice = "could not save wallet";
          });
        break;
      case "Load Saved Wallet":
        this.walletStorageNotice = "loading saved wallets...";
        this._onWalletListRequested()
          .then((wallets) => {
            this.savedWallets = wallets;
            this.savedWalletIndex = 0;
            this.walletStorageNotice = wallets.length
              ? null
              : "no saved wallets";
            if (wallets.length) this.state = AppState.WALLET_STORAGE_LOAD;
          })
          .catch(() => {
            this.walletStorageNotice = "could not read wallet database";
          });
        break;
      case "Delete Saved Wallet":
        this.walletStorageNotice = "choose a wallet to delete";
        this._onWalletListRequested()
          .then((wallets) => {
            this.savedWallets = wallets;
            this.savedWalletIndex = 0;
            if (wallets.length) this.state = AppState.WALLET_STORAGE_LOAD;
            else this.walletStorageNotice = "no saved wallets";
          })
          .catch(() => {
            this.walletStorageNotice = "could not read wallet database";
          });
        break;
      case "Back":
        this.state = AppState.MENU;
        break;
    }
  }

  _handleWalletStorageLoadKey(key) {
    const count = this.savedWallets.length;
    if (!count) {
      this.state = AppState.WALLET_STORAGE_MENU;
      return;
    }
    if (key === "8")
      this.savedWalletIndex = (this.savedWalletIndex + 1) % count;
    if (key === "5")
      this.savedWalletIndex = (this.savedWalletIndex - 1 + count) % count;
    if (key === "x") {
      this.state = AppState.WALLET_STORAGE_MENU;
      return;
    }
    if (key !== "ok") return;

    const record = this.savedWallets[this.savedWalletIndex];
    const action = WALLET_STORAGE_ITEMS[this.walletStorageIndex];
    if (action === "Delete Saved Wallet") {
      this.walletStorageNotice = "deleting...";
      this._onWalletDeleteRequested(record.id)
        .then(() => {
          this.savedWallets.splice(this.savedWalletIndex, 1);
          this.savedWalletIndex = Math.min(
            this.savedWalletIndex,
            this.savedWallets.length - 1,
          );
          this.walletStorageNotice = "wallet deleted";
          this.state = AppState.WALLET_STORAGE_MENU;
        })
        .catch(() => {
          this.walletStorageNotice = "could not delete wallet";
        });
      return;
    }

    this.walletStorageNotice = "loading wallet...";
    this._onWalletLoadRequested(record)
      .then((wallet) => {
        this.wallet = wallet;
        this.walletStorageNotice = `loaded wallet ${wallet.fingerprint}`;
        this.state = AppState.WALLET_STORAGE_MENU;
      })
      .catch(() => {
        this.walletStorageNotice = "could not load wallet";
      });
  }

  // ============================================================
  // Address Explorer
  // ============================================================

  /** Precomputes each type's first receive address, for the safety-comparison screen. */
  _startAddressExplorer() {
    this.addressTypeIndex = 0;
    this.firstAddresses = SCRIPT_TYPES.map(
      (scriptType) => deriveAddress(this.wallet, scriptType.id, 0, 0).address,
    );
    this.state = AppState.ADDRESS_TYPE_MENU;
  }

  _handleAddressTypeMenuKey(key) {
    const count = SCRIPT_TYPES.length;
    if (key === "8")
      this.addressTypeIndex = (this.addressTypeIndex + 1) % count;
    if (key === "5")
      this.addressTypeIndex = (this.addressTypeIndex - 1 + count) % count;
    if (key === "x") {
      this.state = AppState.MENU;
      return;
    }

    if (key !== "ok") return;

    this.addressScriptType = SCRIPT_TYPES[this.addressTypeIndex].id;
    this.addressChain = 0;
    this.addressIndex = 0;
    this._refreshAddressView();
    this.state = AppState.ADDRESS_VIEW;
  }

  _handleAddressViewKey(key) {
    if (key === "8") {
      this.addressIndex += 1;
      this._refreshAddressView();
      return;
    }
    if (key === "5") {
      this.addressIndex = Math.max(0, this.addressIndex - 1);
      this._refreshAddressView();
      return;
    }
    if (key === "0") {
      // Matches the real device's own convention: press 0 to toggle
      // between the receive (external) and change (internal) chain.
      this.addressChain = this.addressChain === 0 ? 1 : 0;
      this.addressIndex = 0; // back to the start of whichever chain we just switched to
      this._refreshAddressView();
      return;
    }
    if (key === "x") {
      this.state = AppState.ADDRESS_TYPE_MENU;
    }
  }

  /** Recomputes currentAddress/currentAddressPath — called on any navigation, never from the render loop. */
  _refreshAddressView() {
    const { address, path } = deriveAddress(
      this.wallet,
      this.addressScriptType,
      this.addressChain,
      this.addressIndex,
    );
    this.currentAddress = address;
    this.currentAddressPath = path;
  }

  // ============================================================
  // PSBT signing ("Ready To Sign")
  // ============================================================

  /**
   * Called by device-instance.js once the user has picked a file (or
   * confirms one wasn't picked). Parsing is genuinely synchronous
   * work — the PSBT_LOADING curtain that follows is a real (if brief)
   * validation step, not a fake delay like the wallet-creation one.
   * @param {string} filename
   * @param {Uint8Array} bytes
   */
  handlePsbtFileLoaded(filename, bytes) {
    this.psbtFilename = filename;
    this.psbtLoadingProgress = 0;
    this.psbtError = null;

    try {
      this.psbtTransaction = parsePsbt(bytes);
      // If this device has a registered multisig wallet, review THAT
      // PSBT as multisig (change detection needs every cosigner's
      // agreement, not just this device's own key) — see
      // psbt-signer.js's buildReviewSummary for the distinction.
      this.psbtSummary = buildReviewSummary(
        this.wallet,
        this.psbtTransaction,
        this.multisigWallet,
      );
    } catch (err) {
      this.psbtTransaction = null;
      this.psbtSummary = null;
      this.psbtError = "Could not read this file as a valid PSBT.";
    }

    this.state = AppState.PSBT_LOADING;
  }

  /** Called by device-instance.js if the file picker was cancelled — nothing to do, we never left MENU. */
  handlePsbtLoadCancelled() {
    // Intentionally a no-op: selecting "Ready To Sign" doesn't change
    // `state` until a file actually comes back, so there's nothing to
    // unwind here.
  }

  _handlePsbtReviewKey(key) {
    if (key === "x") {
      this._resetPsbtState();
      this.state = AppState.MENU;
      return;
    }

    if (key !== "ok") return;

    const signedCount = signRecognizedInputs(this.wallet, this.psbtTransaction);
    if (signedCount === 0) {
      this.psbtError =
        "None of these inputs belong to this wallet — nothing to sign.";
      this.state = AppState.PSBT_ERROR;
      return;
    }

    const result = finalizeOrExportPartial(this.psbtTransaction);
    this.psbtIsFinal = result.isFinal;

    if (result.isFinal) {
      this._onPsbtSigned(signedFilename(this.psbtFilename), result.bytes);
    } else {
      // Expected for multisig before every cosigner has signed — NOT
      // an error. Re-export the PSBT (now containing our signature)
      // for the next signer, via the same "Ready To Sign" screen.
      this._onPsbtSigned(signedFilename(this.psbtFilename), result.psbtBytes);
    }
    this.state = AppState.PSBT_SIGNED;
  }

  _handlePsbtSignedKey(key) {
    if (key === "ok" || key === "x") {
      this._resetPsbtState();
      this.state = AppState.MENU;
    }
  }

  _handlePsbtErrorKey(key) {
    if (key === "ok" || key === "x") {
      this._resetPsbtState();
      this.state = AppState.MENU;
    }
  }

  _resetPsbtState() {
    this.psbtLoadingProgress = 0;
    this.psbtFilename = null;
    this.psbtTransaction = null;
    this.psbtSummary = null;
    this.psbtError = null;
    this.psbtIsFinal = true;
  }

  // ============================================================
  // Settings > Multisig Wallets
  // ============================================================

  _handleSettingsMenuKey(key) {
    const count = SETTINGS_MENU_ITEMS.length;
    if (key === "8")
      this.settingsMenuIndex = (this.settingsMenuIndex + 1) % count;
    if (key === "5")
      this.settingsMenuIndex = (this.settingsMenuIndex - 1 + count) % count;
    if (key === "x") {
      this.state = AppState.MENU;
      return;
    }
    if (key !== "ok") return;

    switch (SETTINGS_MENU_ITEMS[this.settingsMenuIndex]) {
      case "Multisig Wallets":
        this.multisigMenuIndex = 0;
        this.multisigNotice = null;
        this.state = AppState.MULTISIG_MENU;
        break;
      case "Back":
        this.state = AppState.MENU;
        break;
    }
  }

  _handleMultisigMenuKey(key) {
    const count = MULTISIG_MENU_ITEMS.length;
    if (key === "8")
      this.multisigMenuIndex = (this.multisigMenuIndex + 1) % count;
    if (key === "5")
      this.multisigMenuIndex = (this.multisigMenuIndex - 1 + count) % count;
    if (key === "x") {
      this.state = AppState.SETTINGS_MENU;
      return;
    }
    if (key !== "ok") return;

    this.multisigNotice = null;

    switch (MULTISIG_MENU_ITEMS[this.multisigMenuIndex]) {
      case "Export XPUB":
        this._onExportCosignerRequested(this.wallet);
        this.multisigNotice = `exported ${cosignerExportFilename(this.wallet)}`;
        break;
      case "Create Multisig Wallet":
        // Async, DOM-touching — see constructor callbacks doc. Stays
        // in MULTISIG_MENU until handleCosignerFileLoaded() is called.
        this._onCombineRequested();
        break;
      case "Import from SD":
        // Same pattern — see handleRegisterFileLoaded().
        this._onRegisterRequested();
        break;
      case "View Registered Wallet":
        if (this.multisigWallet) {
          this.multisigFirstAddress = this.multisigWallet.deriveAddress(
            0,
            0,
          ).address;
          this.state = AppState.MULTISIG_INFO;
        } else {
          this.multisigNotice = "no multisig wallet registered yet";
        }
        break;
      case "Back":
        this.state = AppState.SETTINGS_MENU;
        break;
    }
  }

  /**
   * Called by device-instance.js once the OTHER cosigner's ccxp file
   * has been picked, for "Create Multisig Wallet". Combines it with
   * THIS device's own (already-known) cosigner info — no need to
   * re-upload our own export back into ourselves.
   * @param {string} otherCosignerJsonText
   */
  handleCosignerFileLoaded(otherCosignerJsonText) {
    try {
      const otherCosigner = cosignerFromExportJson(
        JSON.parse(otherCosignerJsonText),
      );
      const ownCosigner = cosignerFromExportJson(
        buildCosignerExport(this.wallet),
      );

      if (otherCosigner.fingerprint === ownCosigner.fingerprint) {
        throw new Error(
          "That file has the same fingerprint as this device — a multisig wallet needs 2 distinct cosigners.",
        );
      }

      const cosigners = [ownCosigner, otherCosigner];
      const configText = buildMultisigConfigText(
        MULTISIG_NAME,
        MULTISIG_M,
        cosigners,
      );
      this.pendingMultisigConfig = {
        configText,
        name: MULTISIG_NAME,
        m: MULTISIG_M,
        cosigners,
      };
      this.multisigError = null;
      this.state = AppState.MULTISIG_CREATE_REVIEW;
    } catch (err) {
      this.multisigError = err.message;
      this.state = AppState.MULTISIG_ERROR;
    }
  }

  /** Called by device-instance.js if picking the other cosigner's file was cancelled. */
  handleCosignerFileLoadCancelled() {
    // No-op — selecting "Create Multisig Wallet" never left MULTISIG_MENU.
  }

  _handleMultisigCreateReviewKey(key) {
    if (key === "x") {
      this.pendingMultisigConfig = null;
      this.state = AppState.MULTISIG_MENU;
      return;
    }
    if (key !== "ok") return;

    const { configText, name, m, cosigners } = this.pendingMultisigConfig;
    this.multisigWallet = new MultisigWallet({ name, m, cosigners });
    this._onMultisigConfigReady(`${name}.txt`, configText);
    Promise.resolve(this._onMultisigSaveRequested(this.multisigWallet)).catch(
      () => {
        this.multisigNotice = "multisig wallet created, but could not be saved";
      },
    );
    this.multisigNotice = "multisig wallet created and registered";
    this.pendingMultisigConfig = null;
    this.state = AppState.MULTISIG_MENU;
  }

  /**
   * Called by device-instance.js once a combined multisig config file
   * has been picked, for "Import from SD". Refuses to register unless
   * this device's own key is genuinely present — see the security
   * note in core/multisig-wallet.js.
   * @param {string} configText
   */
  handleRegisterFileLoaded(configText) {
    try {
      const ownCosigner = cosignerFromExportJson(
        buildCosignerExport(this.wallet),
      );
      this.multisigWallet = parseMultisigConfigText(configText, ownCosigner);
      Promise.resolve(this._onMultisigSaveRequested(this.multisigWallet)).catch(
        () => {
          this.multisigNotice =
            "multisig wallet registered, but could not be saved";
        },
      );
      this.multisigError = null;
      this.multisigNotice = "multisig wallet registered";
      this.state = AppState.MULTISIG_MENU;
    } catch (err) {
      this.multisigError = err.message;
      this.state = AppState.MULTISIG_ERROR;
    }
  }

  /** Called by device-instance.js if picking the config file to register was cancelled. */
  handleRegisterFileLoadCancelled() {
    // No-op — selecting "Import from SD" never left MULTISIG_MENU.
  }

  _handleMultisigInfoKey(key) {
    if (key === "ok" || key === "x") {
      this.state = AppState.MULTISIG_MENU;
    }
  }

  _handleMultisigErrorKey(key) {
    if (key === "ok" || key === "x") {
      this.multisigError = null;
      this.state = AppState.MULTISIG_MENU;
    }
  }
}
