/**
 * ui/screen-renderer.js
 * ------------------------------------------------------------
 * Draws the simulated OLED screen onto a <canvas>, scaled for
 * HiDPI/retina displays.
 *
 * This module is a pure function of DeviceStateMachine's current
 * state — it never reads input and never mutates state. Keeping
 * "what to draw" (here) separate from "what happened" (device-state.js)
 * and "how input arrives" (keypad-controller.js) is what makes each
 * piece easy to reason about on its own.
 */

const FONT = "'JetBrains Mono', monospace";

export class ScreenRenderer {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this._setupHiDPI();
  }

  /**
   * Scales the canvas's backing buffer by devicePixelRatio so text
   * and lines stay crisp on retina screens, while the CSS-controlled
   * display size (see css/screen.css) is left untouched.
   */
  _setupHiDPI() {
    const dpr = window.devicePixelRatio || 1;
    // Capture the *logical* drawing resolution from the HTML attributes
    // (width="560" height="250") before we overwrite them below.
    this.width = this.canvas.width;
    this.height = this.canvas.height;

    if (dpr > 1) {
      this.canvas.width = this.width * dpr;
      this.canvas.height = this.height * dpr;
      this.ctx.scale(dpr, dpr);
    }
  }

  /** @param {import('../core/device-state.js').DeviceStateMachine} deviceState */
  draw(deviceState) {
    const { ctx, width: W, height: H } = this;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0a0e0b';
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'top';

    // Fingerprint header: drawn on top of every screen once a wallet
    // exists (it doesn't during BOOT), so the user always sees which
    // wallet's identity this device currently holds — no state has to
    // remember to include it individually.
    this._drawHeader(deviceState);

    switch (deviceState.state) {
      case 'boot':
        this._drawBoot(deviceState);
        break;
      case 'creating_wallet':
        this._drawCreatingWallet();
        break;
      case 'welcome':
        this._drawWelcome();
        break;
      case 'menu':
        this._drawMenu(deviceState);
        break;
      case 'seed_display':
        this._drawSeedDisplay(deviceState);
        break;
      case 'seed_quiz':
        this._drawSeedQuiz(deviceState);
        break;
      case 'passphrase_menu':
        this._drawPassphraseMenu(deviceState);
        break;
      case 'passphrase_add_word':
        this._drawPassphraseAddWord(deviceState);
        break;
      case 'passphrase_add_numbers':
        this._drawPassphraseAddNumbers(deviceState);
        break;
      case 'passphrase_apply_preview':
        this._drawPassphraseApplyPreview(deviceState);
        break;
      case 'import_seed_word':
        this._drawImportSeedWord(deviceState);
        break;
      case 'import_seed_review':
        this._drawImportSeedReview(deviceState);
        break;
      case 'advanced_menu':
        this._drawAdvancedMenu(deviceState);
        break;
      case 'address_type_menu':
        this._drawAddressTypeMenu(deviceState);
        break;
      case 'address_view':
        this._drawAddressView(deviceState);
        break;
      case 'psbt_loading':
        this._drawPsbtLoading(deviceState);
        break;
      case 'psbt_review':
        this._drawPsbtReview(deviceState);
        break;
      case 'psbt_signed':
        this._drawPsbtSigned(deviceState);
        break;
      case 'psbt_error':
        this._drawPsbtError(deviceState);
        break;
      case 'settings_menu':
        this._drawSettingsMenu(deviceState);
        break;
      case 'multisig_menu':
        this._drawMultisigMenu(deviceState);
        break;
      case 'multisig_create_review':
        this._drawMultisigCreateReview(deviceState);
        break;
      case 'multisig_info':
        this._drawMultisigInfo(deviceState);
        break;
      case 'multisig_error':
        this._drawMultisigError(deviceState);
        break;
    }
  }

  /** Top-right fingerprint, same size/row as the "MAIN MENU" label. */
  _drawHeader(deviceState) {
    if (!deviceState.wallet) return; // no wallet yet during BOOT

    const { ctx, width: W } = this;
    ctx.textAlign = 'right';
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = '#6d8570';
    ctx.fillText(deviceState.wallet.fingerprint, W - 16, 10);
    ctx.textAlign = 'left';
  }

  _drawBoot(deviceState) {
    const { ctx, width: W, height: H } = this;

    ctx.fillStyle = '#cfe0cf';
    ctx.font = `bold 26px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('COLDCARD', W / 2, H / 2 - 44);

    ctx.font = `14px ${FONT}`;
    ctx.fillStyle = '#6d8570';
    ctx.fillText('MK5 · initializing', W / 2, H / 2 - 8);

    const barW = 240;
    const barH = 8;
    const x = W / 2 - barW / 2;
    const y = H / 2 + 26;
    ctx.strokeStyle = '#3a4a3c';
    ctx.strokeRect(x, y, barW, barH);
    ctx.fillStyle = '#3ddc74';
    ctx.fillRect(x, y, barW * deviceState.bootProgress, barH);

    ctx.textAlign = 'left';
  }

  /**
   * Purely decorative "Matrix"-style curtain shown for ~1s while the
   * wallet (already generated instantly, see device-state.js) is
   * revealed. Uses Math.random() for the falling-character noise —
   * that's fine, this is cosmetic only and touches no key material.
   */
  _drawCreatingWallet() {
    const { ctx, width: W, height: H } = this;
    const glyphs = '01ABCDEF';
    const cellW = 14;
    const cellH = 16;
    const cols = Math.ceil(W / cellW);
    const rows = Math.ceil(H / cellH);

    ctx.font = `12px ${FONT}`;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (Math.random() > 0.45) continue; // sparse flicker, not a solid grid
        const glyph = glyphs[Math.floor(Math.random() * glyphs.length)];
        const brightness = Math.random();
        ctx.fillStyle = brightness > 0.85 ? '#baffc9' : brightness > 0.5 ? '#3ddc74' : '#1c5c34';
        ctx.fillText(glyph, c * cellW, r * cellH);
      }
    }

    // Readable label on top of the noise, on its own translucent backing.
    const labelW = 210;
    const labelH = 30;
    ctx.fillStyle = 'rgba(10,14,11,0.78)';
    ctx.fillRect(W / 2 - labelW / 2, H / 2 - labelH / 2, labelW, labelH);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#baffc9';
    ctx.font = `bold 16px ${FONT}`;
    ctx.fillText('creating wallet...', W / 2, H / 2 - 8);
    ctx.textAlign = 'left';
  }

  _drawWelcome() {
    const { ctx, width: W, height: H } = this;

    ctx.textAlign = 'center';
    ctx.fillStyle = '#cfe0cf';
    ctx.font = `bold 28px ${FONT}`;
    ctx.fillText('Coldcard', W / 2, H / 2 - 48);
    ctx.fillText('Wallet', W / 2, H / 2 - 18);

    ctx.font = `11px ${FONT}`;
    ctx.fillStyle = '#4a5f4c';
    ctx.fillText('by Coinkite', W / 2, H / 2 + 6);

    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = '#6d8570';
    ctx.fillText('press ✓ to continue', W / 2, H / 2 + 34);

    ctx.textAlign = 'left';
  }

  _drawMenu(deviceState) {
    const { ctx, width: W } = this;
    const { menuItems, menuIndex } = deviceState;

    ctx.fillStyle = '#6d8570';
    ctx.font = `12px ${FONT}`;
    ctx.fillText('MAIN MENU', 16, 10);

    ctx.strokeStyle = '#233022';
    ctx.beginPath();
    ctx.moveTo(16, 26);
    ctx.lineTo(W - 16, 26);
    ctx.stroke();

    // The real Coldcard's screen is short, so only a window of rows
    // is visible at once; the selection stays centered as you scroll.
    const visibleRows = 4;
    const startY = 36;
    const rowH = 34;
    const maxStart = Math.max(0, menuItems.length - visibleRows);
    const start = Math.min(Math.max(menuIndex - 1, 0), maxStart);
    const end = Math.min(start + visibleRows, menuItems.length);

    for (let i = start; i < end; i++) {
      const row = i - start;
      const y = startY + row * rowH;

      if (i === menuIndex) {
        ctx.fillStyle = 'rgba(61,220,116,0.15)';
        ctx.fillRect(8, y - 4, W - 16, rowH - 6);
        ctx.fillStyle = '#3ddc74';
        ctx.fillText('▶', 14, y + 3);
      } else {
        ctx.fillStyle = '#9fb3a0';
      }

      ctx.font = `16px ${FONT}`;
      ctx.fillText(menuItems[i], 34, y + 3);
    }

    // Scroll indicators
    ctx.fillStyle = '#4a5f4c';
    ctx.font = `12px ${FONT}`;
    if (start > 0) ctx.fillText('▲', W - 24, startY - 14);
    if (end < menuItems.length) ctx.fillText('▼', W - 24, startY + visibleRows * rowH - 18);
  }

  /** Numbered, scrollable list of the 12 newly generated (not-yet-committed) words. */
  _drawSeedDisplay(deviceState) {
    const { ctx, width: W } = this;
    const words = deviceState.pendingMnemonic.split(' ');
    const focus = deviceState.seedScrollIndex;

    ctx.fillStyle = '#6d8570';
    ctx.font = `11px ${FONT}`;
    ctx.fillText('WRITE DOWN YOUR WORDS', 16, 10);

    ctx.strokeStyle = '#233022';
    ctx.beginPath();
    ctx.moveTo(16, 26);
    ctx.lineTo(W - 16, 26);
    ctx.stroke();

    let startY = 36;
    if (deviceState.quizNotice) {
      ctx.fillStyle = '#e8503a';
      ctx.font = `11px ${FONT}`;
      ctx.fillText(deviceState.quizNotice, 16, 32);
      startY = 50;
    }

    const visibleRows = 4;
    const rowH = 34;
    const maxStart = Math.max(0, words.length - visibleRows);
    const start = Math.min(Math.max(focus - 1, 0), maxStart);
    const end = Math.min(start + visibleRows, words.length);

    for (let i = start; i < end; i++) {
      const row = i - start;
      const y = startY + row * rowH;

      if (i === focus) {
        ctx.fillStyle = 'rgba(61,220,116,0.15)';
        ctx.fillRect(8, y - 4, W - 16, rowH - 6);
      }
      ctx.fillStyle = i === focus ? '#3ddc74' : '#9fb3a0';
      ctx.font = `16px ${FONT}`;
      ctx.fillText(`${i + 1}. ${words[i]}`, 24, y + 3);
    }

    ctx.fillStyle = '#4a5f4c';
    ctx.font = `11px ${FONT}`;
    if (start > 0) ctx.fillText('▲', W - 24, startY - 14);
    if (end < words.length) ctx.fillText('▼', W - 24, startY + visibleRows * rowH - 18);
  }

  /** One multiple-choice question: "Word #N is?" with 3 numbered options. */
  _drawSeedQuiz(deviceState) {
    const { ctx, width: W } = this;
    const question = deviceState.quiz[deviceState.quizIndex];

    ctx.fillStyle = '#6d8570';
    ctx.font = `11px ${FONT}`;
    ctx.fillText(`CONFIRM WORD ${deviceState.quizIndex + 1} / ${deviceState.quiz.length}`, 16, 10);

    ctx.strokeStyle = '#233022';
    ctx.beginPath();
    ctx.moveTo(16, 26);
    ctx.lineTo(W - 16, 26);
    ctx.stroke();

    ctx.fillStyle = '#cfe0cf';
    ctx.font = `16px ${FONT}`;
    ctx.fillText(`Word #${question.position + 1} is?`, 24, 42);

    const optionStartY = 78;
    const rowH = 40;
    question.choices.forEach((word, i) => {
      const y = optionStartY + i * rowH;
      ctx.fillStyle = '#3ddc74';
      ctx.font = `16px ${FONT}`;
      ctx.fillText(`${i + 1}.`, 24, y);
      ctx.fillStyle = '#9fb3a0';
      ctx.fillText(word, 52, y);
    });
  }

  /** The "Add Word / Add Numbers / Clear All / Apply / Cancel" submenu, with every draft part shown in full above it. */
  _drawPassphraseMenu(deviceState) {
    const { ctx, width: W } = this;
    const items = ['Add Word', 'Add Numbers', 'Clear All', 'Apply', 'Cancel'];
    const { passphraseMenuIndex: selectedIndex, passphraseChunks, passphraseNotice } = deviceState;

    ctx.fillStyle = '#6d8570';
    ctx.font = `11px ${FONT}`;
    ctx.fillText('PASSPHRASE', 16, 10);
    ctx.strokeStyle = '#233022';
    ctx.beginPath();
    ctx.moveTo(16, 26);
    ctx.lineTo(W - 16, 26);
    ctx.stroke();

    // Every part entered so far, shown IN FULL (never truncated) so
    // the user can back it up — this is exactly the text that will
    // change the derived wallet, so partial/ellipsized text here
    // would be actively misleading.
    let y = 34;
    ctx.font = `11px ${FONT}`;
    if (passphraseChunks.length === 0) {
      ctx.fillStyle = '#4a5f4c';
      ctx.fillText('(empty)', 16, y);
      y += 14;
    } else {
      passphraseChunks.forEach((chunk, i) => {
        ctx.fillStyle = '#3ddc74';
        ctx.fillText(`${i + 1}. ${chunk}`, 16, y);
        y += 14;
      });
    }

    if (passphraseNotice) {
      ctx.font = `10px ${FONT}`;
      ctx.fillStyle = '#e8503a';
      ctx.fillText(passphraseNotice, 16, y);
      y += 14;
    }

    const dividerY = y + 6;
    ctx.strokeStyle = '#233022';
    ctx.beginPath();
    ctx.moveTo(16, dividerY);
    ctx.lineTo(W - 16, dividerY);
    ctx.stroke();

    const visibleRows = 3;
    const startY = dividerY + 12;
    const rowH = 32;
    const maxStart = Math.max(0, items.length - visibleRows);
    const start = Math.min(Math.max(selectedIndex - 1, 0), maxStart);
    const end = Math.min(start + visibleRows, items.length);

    for (let i = start; i < end; i++) {
      const row = i - start;
      const rowY = startY + row * rowH;

      if (i === selectedIndex) {
        ctx.fillStyle = 'rgba(61,220,116,0.15)';
        ctx.fillRect(8, rowY - 4, W - 16, rowH - 6);
        ctx.fillStyle = '#3ddc74';
        ctx.fillText('▶', 14, rowY + 3);
      } else {
        ctx.fillStyle = '#9fb3a0';
      }
      ctx.font = `16px ${FONT}`;
      ctx.fillText(items[i], 34, rowY + 3);
    }

    ctx.fillStyle = '#4a5f4c';
    ctx.font = `11px ${FONT}`;
    if (start > 0) ctx.fillText('▲', W - 24, startY - 14);
    if (end < items.length) ctx.fillText('▼', W - 24, startY + visibleRows * rowH - 18);
  }

  /** Big centered word from the BIP39 list, with its alphabetical position. */
  _drawPassphraseAddWord(deviceState) {
    const { ctx, width: W, height: H } = this;
    const { wordPicker } = deviceState;

    ctx.fillStyle = '#6d8570';
    ctx.font = `11px ${FONT}`;
    ctx.fillText('ADD WORD', 16, 10);
    ctx.strokeStyle = '#233022';
    ctx.beginPath();
    ctx.moveTo(16, 26);
    ctx.lineTo(W - 16, 26);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#cfe0cf';
    ctx.font = `bold 22px ${FONT}`;
    ctx.fillText(wordPicker.currentWord, W / 2, H / 2 - 10);

    ctx.font = `11px ${FONT}`;
    ctx.fillStyle = '#4a5f4c';
    ctx.fillText(`${wordPicker.index + 1} / ${wordPicker.totalWords}`, W / 2, H / 2 + 20);
    ctx.fillText('▲▼ step · ◀▶ page · ✓ select', W / 2, H / 2 + 40);
    ctx.textAlign = 'left';
  }

  /** Digits typed so far for one "Add Numbers" chunk. */
  _drawPassphraseAddNumbers(deviceState) {
    const { ctx, width: W, height: H } = this;
    const { numberDraft } = deviceState;

    ctx.fillStyle = '#6d8570';
    ctx.font = `11px ${FONT}`;
    ctx.fillText('ADD NUMBERS', 16, 10);
    ctx.strokeStyle = '#233022';
    ctx.beginPath();
    ctx.moveTo(16, 26);
    ctx.lineTo(W - 16, 26);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = numberDraft ? '#cfe0cf' : '#4a5f4c';
    ctx.font = `bold 22px ${FONT}`;
    ctx.fillText(numberDraft || 'type digits…', W / 2, H / 2 - 10);

    ctx.font = `11px ${FONT}`;
    ctx.fillStyle = '#4a5f4c';
    ctx.fillText('0-9 type · ✕ backspace · ✓ confirm', W / 2, H / 2 + 20);
    ctx.textAlign = 'left';
  }

  /** Resulting fingerprint + every passphrase part in full, before committing. */
  _drawPassphraseApplyPreview(deviceState) {
    const { ctx, width: W } = this;
    const { pendingPassphraseWallet, passphraseChunks } = deviceState;

    ctx.fillStyle = '#6d8570';
    ctx.font = `11px ${FONT}`;
    ctx.fillText('NEW WALLET FINGERPRINT', 16, 10);
    ctx.strokeStyle = '#233022';
    ctx.beginPath();
    ctx.moveTo(16, 26);
    ctx.lineTo(W - 16, 26);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#3ddc74';
    ctx.font = `bold 22px ${FONT}`;
    ctx.fillText(pendingPassphraseWallet.fingerprint, W / 2, 40);

    ctx.font = `11px ${FONT}`;
    ctx.fillStyle = '#6d8570';
    ctx.fillText('passphrase — write this down too:', W / 2, 80);

    ctx.font = `16px ${FONT}`;
    ctx.fillStyle = '#cfe0cf';
    if (passphraseChunks.length === 0) {
      ctx.fillText('(empty)', W / 2, 100);
    } else {
      passphraseChunks.forEach((chunk, i) => {
        ctx.fillText(`${i + 1}. ${chunk}`, W / 2, 100 + i * 24);
      });
    }

    ctx.font = `11px ${FONT}`;
    ctx.fillStyle = '#4a5f4c';
    const linesUsed = Math.max(1, passphraseChunks.length);
    ctx.fillText('✓ apply · ✕ back to edit', W / 2, 100 + linesUsed * 24 + 14);
    ctx.textAlign = 'left';
  }

  /** Shortens long strings so they don't overflow the narrow screen (used for non-sensitive labels only). */
  _truncate(text, maxChars) {
    return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
  }

  /** Word N of 12, using the same wordlist-picker UI as the passphrase's "Add Word" mode. */
  _drawImportSeedWord(deviceState) {
    const { ctx, width: W, height: H } = this;
    const { importWords, importWordPicker, importNotice } = deviceState;
    const position = importWords.length + 1;

    ctx.fillStyle = '#6d8570';
    ctx.font = `11px ${FONT}`;
    ctx.fillText(`IMPORT SEED — WORD ${position} / 12`, 16, 10);
    ctx.strokeStyle = '#233022';
    ctx.beginPath();
    ctx.moveTo(16, 26);
    ctx.lineTo(W - 16, 26);
    ctx.stroke();

    if (importNotice) {
      ctx.font = `10px ${FONT}`;
      ctx.fillStyle = '#e8503a';
      ctx.textAlign = 'left';
      ctx.fillText(importNotice, 16, 32);
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#cfe0cf';
    ctx.font = `bold 22px ${FONT}`;
    ctx.fillText(importWordPicker.currentWord, W / 2, H / 2 - 10);

    ctx.font = `11px ${FONT}`;
    ctx.fillStyle = '#4a5f4c';
    ctx.fillText(`${importWordPicker.index + 1} / ${importWordPicker.totalWords}`, W / 2, H / 2 + 20);
    ctx.fillText('▲▼ step · ◀▶ page · ✓ confirm · ✕ back a word', W / 2, H / 2 + 40);
    ctx.textAlign = 'left';
  }

  /** All 12 words checked out — resulting fingerprint, before committing. */
  _drawImportSeedReview(deviceState) {
    const { ctx, width: W, height: H } = this;
    const { pendingImportWallet } = deviceState;

    ctx.fillStyle = '#6d8570';
    ctx.font = `11px ${FONT}`;
    ctx.fillText('IMPORT SEED — REVIEW', 16, 10);
    ctx.strokeStyle = '#233022';
    ctx.beginPath();
    ctx.moveTo(16, 26);
    ctx.lineTo(W - 16, 26);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#6d8570';
    ctx.font = `11px ${FONT}`;
    ctx.fillText('checksum valid — resulting fingerprint:', W / 2, H / 2 - 30);

    ctx.fillStyle = '#3ddc74';
    ctx.font = `bold 24px ${FONT}`;
    ctx.fillText(pendingImportWallet.fingerprint, W / 2, H / 2 - 4);

    ctx.font = `11px ${FONT}`;
    ctx.fillStyle = '#4a5f4c';
    ctx.fillText('✓ import this wallet · ✕ edit last word', W / 2, H / 2 + 30);
    ctx.textAlign = 'left';
  }

  /** The Advanced/Tools submenu — currently just "Export Wallet" and "Back". */
  _drawAdvancedMenu(deviceState) {
    const { ctx, width: W } = this;
    const items = ['Export Wallet', 'Back'];
    const { advancedMenuIndex: selectedIndex, advancedNotice } = deviceState;

    ctx.fillStyle = '#6d8570';
    ctx.font = `11px ${FONT}`;
    ctx.fillText('ADVANCED / TOOLS', 16, 10);
    ctx.strokeStyle = '#233022';
    ctx.beginPath();
    ctx.moveTo(16, 26);
    ctx.lineTo(W - 16, 26);
    ctx.stroke();

    const startY = 42;
    const rowH = 34;
    items.forEach((item, i) => {
      const y = startY + i * rowH;
      if (i === selectedIndex) {
        ctx.fillStyle = 'rgba(61,220,116,0.15)';
        ctx.fillRect(8, y - 4, W - 16, rowH - 6);
        ctx.fillStyle = '#3ddc74';
        ctx.fillText('▶', 14, y + 3);
      } else {
        ctx.fillStyle = '#9fb3a0';
      }
      ctx.font = `16px ${FONT}`;
      ctx.fillText(item, 34, y + 3);
    });

    if (advancedNotice) {
      ctx.font = `11px ${FONT}`;
      ctx.fillStyle = '#3ddc74';
      ctx.fillText(advancedNotice, 16, startY + items.length * rowH + 10);
    }
  }

  /** Shows each script type's first receive address side by side, for cross-wallet comparison — the real safety feature. */
  _drawAddressTypeMenu(deviceState) {
    const { ctx, width: W } = this;
    const { addressTypeIndex: selectedIndex, firstAddresses } = deviceState;
    const labels = ['Legacy', 'Nested Segwit', 'Native Segwit'];

    ctx.fillStyle = '#6d8570';
    ctx.font = `11px ${FONT}`;
    ctx.fillText('ADDRESS EXPLORER', 16, 10);
    ctx.strokeStyle = '#233022';
    ctx.beginPath();
    ctx.moveTo(16, 26);
    ctx.lineTo(W - 16, 26);
    ctx.stroke();

    const rowH = 62;
    labels.forEach((label, i) => {
      const y = 34 + i * rowH;
      if (i === selectedIndex) {
        ctx.fillStyle = 'rgba(61,220,116,0.15)';
        ctx.fillRect(8, y - 4, W - 16, rowH - 6);
      }
      ctx.fillStyle = i === selectedIndex ? '#3ddc74' : '#9fb3a0';
      ctx.font = `15px ${FONT}`;
      ctx.fillText((i === selectedIndex ? '▶ ' : '') + label, 16, y);

      ctx.font = `11px ${FONT}`;
      ctx.fillStyle = '#6d8570';
      ctx.fillText(this._groupAddress(firstAddresses[i]), 24, y + 20);
    });

    ctx.font = `10px ${FONT}`;
    ctx.fillStyle = '#4a5f4c';
    ctx.textAlign = 'center';
    ctx.fillText('pick the one your other wallet already showed you', W / 2, 34 + labels.length * rowH + 6);
    ctx.textAlign = 'left';
  }

  /** One address at a time: index, receive/change chain, and the full path — grouped in 4-char blocks like the real device. */
  _drawAddressView(deviceState) {
    const { ctx, width: W, height: H } = this;
    const { addressChain, addressIndex, currentAddress, currentAddressPath } = deviceState;

    ctx.fillStyle = '#6d8570';
    ctx.font = `11px ${FONT}`;
    ctx.fillText(addressChain === 0 ? 'RECEIVE ADDRESS' : 'CHANGE ADDRESS', 16, 10);
    ctx.fillStyle = '#4a5f4c';
    ctx.textAlign = 'right';
    ctx.fillText(`#${addressIndex}`, W - 16, 10);
    ctx.textAlign = 'left';
    ctx.strokeStyle = '#233022';
    ctx.beginPath();
    ctx.moveTo(16, 26);
    ctx.lineTo(W - 16, 26);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#cfe0cf';
    ctx.font = `15px ${FONT}`;
    // Long addresses wrap across two lines so nothing runs off-screen.
    const grouped = this._groupAddress(currentAddress);
    const midpoint = Math.ceil(grouped.length / 2);
    const splitAt = grouped.indexOf(' ', midpoint) === -1 ? grouped.length : grouped.indexOf(' ', midpoint);
    ctx.fillText(grouped.slice(0, splitAt), W / 2, H / 2 - 30);
    ctx.fillText(grouped.slice(splitAt + 1), W / 2, H / 2 - 10);

    ctx.font = `10px ${FONT}`;
    ctx.fillStyle = '#4a5f4c';
    ctx.fillText(currentAddressPath, W / 2, H / 2 + 16);
    ctx.fillText('▲▼ index · 0 toggle receive/change · ✕ back', W / 2, H / 2 + 36);
    ctx.textAlign = 'left';
  }

  /** Inserts a space every 4 characters, matching the real device's on-screen address grouping. */
  _groupAddress(address) {
    return address.match(/.{1,4}/g).join(' ');
  }

  /** "Reading..." for the first half of the curtain, "Validating..." for the second — genuine, brief parsing work. */
  _drawPsbtLoading(deviceState) {
    const { ctx, width: W, height: H } = this;
    const label = deviceState.psbtLoadingProgress < 0.5 ? 'Reading...' : 'Validating...';

    ctx.textAlign = 'center';
    ctx.fillStyle = '#cfe0cf';
    ctx.font = `16px ${FONT}`;
    ctx.fillText(label, W / 2, H / 2 - 8);
    ctx.textAlign = 'left';
  }

  /** Inputs total, each output (change ones marked), and the fee — before the user decides to sign. */
  _drawPsbtReview(deviceState) {
    const { ctx, width: W, height: H } = this;
    const { psbtSummary } = deviceState;

    ctx.fillStyle = '#6d8570';
    ctx.font = `11px ${FONT}`;
    ctx.fillText('REVIEW TRANSACTION', 16, 10);
    ctx.strokeStyle = '#233022';
    ctx.beginPath();
    ctx.moveTo(16, 26);
    ctx.lineTo(W - 16, 26);
    ctx.stroke();

    let y = 36;
    ctx.fillStyle = '#9fb3a0';
    ctx.font = `11px ${FONT}`;
    ctx.fillText(`Spending ${psbtSummary.inputs.length} input(s): ${formatSats(psbtSummary.totalInSats)} sats`, 16, y);
    y += 18;

    for (const out of psbtSummary.outputs) {
      ctx.fillStyle = out.isChange ? '#4a5f4c' : '#cfe0cf';
      ctx.font = `11px ${FONT}`;
      ctx.fillText(shortenAddress(out.address) + (out.isChange ? ' (change)' : ''), 16, y);

      ctx.fillStyle = '#3ddc74';
      ctx.textAlign = 'right';
      ctx.fillText(formatSats(out.amountSats), W - 16, y);
      ctx.textAlign = 'left';
      y += 16;
    }

    y += 6;
    ctx.strokeStyle = '#233022';
    ctx.beginPath();
    ctx.moveTo(16, y);
    ctx.lineTo(W - 16, y);
    ctx.stroke();
    y += 16;

    ctx.fillStyle = '#e8503a';
    ctx.font = `12px ${FONT}`;
    ctx.fillText(`Fee: ${formatSats(psbtSummary.feeSats)} sats`, 16, y);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#4a5f4c';
    ctx.font = `11px ${FONT}`;
    ctx.fillText('✓ sign · ✕ cancel', W / 2, H - 20);
    ctx.textAlign = 'left';
  }

  /** Brief confirmation that the signed (or partially-signed) file was offered for download. */
  _drawPsbtSigned(deviceState) {
    const { ctx, width: W, height: H } = this;

    ctx.textAlign = 'center';
    ctx.fillStyle = '#3ddc74';
    ctx.font = `bold 18px ${FONT}`;
    ctx.fillText(deviceState.psbtIsFinal ? 'Signed ✓' : 'Partially signed ✓', W / 2, H / 2 - 20);

    ctx.font = `11px ${FONT}`;
    ctx.fillStyle = '#9fb3a0';
    ctx.fillText(deviceState.psbtFilename, W / 2, H / 2 + 8);

    ctx.fillStyle = '#4a5f4c';
    ctx.fillText(
      deviceState.psbtIsFinal ? '✓/✕ continue' : 'needs another signer · ✓/✕ continue',
      W / 2,
      H / 2 + 30
    );
    ctx.textAlign = 'left';
  }

  /** Couldn't parse, nothing to sign, or couldn't finalize — shown until the user acknowledges. */
  _drawPsbtError(deviceState) {
    const { ctx, width: W, height: H } = this;

    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8503a';
    ctx.font = `bold 16px ${FONT}`;
    ctx.fillText('Could not sign', W / 2, H / 2 - 20);

    ctx.font = `11px ${FONT}`;
    ctx.fillStyle = '#9fb3a0';
    wrapText(ctx, deviceState.psbtError, W / 2, H / 2 + 4, W - 60, 16);

    ctx.fillStyle = '#4a5f4c';
    ctx.font = `11px ${FONT}`;
    ctx.fillText('✓/✕ continue', W / 2, H / 2 + 46);
    ctx.textAlign = 'left';
  }

  /** Just "Multisig Wallets" and "Back" for now — see project scope notes. */
  _drawSettingsMenu(deviceState) {
    this._drawSimpleList(deviceState, {
      header: 'SETTINGS',
      items: ['Multisig Wallets', 'Back'],
      selectedIndex: deviceState.settingsMenuIndex,
    });
  }

  /** Export XPUB / Create Multisig Wallet / Import from SD / View Registered Wallet / Back. */
  _drawMultisigMenu(deviceState) {
    this._drawSimpleList(deviceState, {
      header: 'MULTISIG WALLETS',
      items: ['Export XPUB', 'Create Multisig Wallet', 'Import from SD', 'View Registered Wallet', 'Back'],
      selectedIndex: deviceState.multisigMenuIndex,
      notice: deviceState.multisigNotice,
    });
  }

  /** The about-to-create summary: name, policy, and every cosigner's fingerprint — before confirming. */
  _drawMultisigCreateReview(deviceState) {
    const { ctx, width: W, height: H } = this;
    const { name, m, cosigners } = deviceState.pendingMultisigConfig;

    ctx.fillStyle = '#6d8570';
    ctx.font = `11px ${FONT}`;
    ctx.fillText('CREATE MULTISIG WALLET', 16, 10);
    ctx.strokeStyle = '#233022';
    ctx.beginPath();
    ctx.moveTo(16, 26);
    ctx.lineTo(W - 16, 26);
    ctx.stroke();

    let y = 40;
    ctx.fillStyle = '#cfe0cf';
    ctx.font = `14px ${FONT}`;
    ctx.fillText(`${name} — ${m} of ${cosigners.length}`, 16, y);
    y += 24;

    ctx.font = `11px ${FONT}`;
    ctx.fillStyle = '#6d8570';
    ctx.fillText('Cosigners:', 16, y);
    y += 16;
    for (const cosigner of cosigners) {
      ctx.fillStyle = '#9fb3a0';
      ctx.fillText(cosigner.fingerprint.toUpperCase(), 24, y);
      y += 16;
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#4a5f4c';
    ctx.font = `11px ${FONT}`;
    ctx.fillText('✓ create & register · ✕ cancel', W / 2, H - 20);
    ctx.textAlign = 'left';
  }

  /** The registered wallet's name, policy, and first receive address. */
  _drawMultisigInfo(deviceState) {
    const { ctx, width: W, height: H } = this;
    const { multisigWallet, multisigFirstAddress } = deviceState;

    ctx.fillStyle = '#6d8570';
    ctx.font = `11px ${FONT}`;
    ctx.fillText('REGISTERED MULTISIG WALLET', 16, 10);
    ctx.strokeStyle = '#233022';
    ctx.beginPath();
    ctx.moveTo(16, 26);
    ctx.lineTo(W - 16, 26);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#cfe0cf';
    ctx.font = `14px ${FONT}`;
    ctx.fillText(`${multisigWallet.name} — ${multisigWallet.m} of ${multisigWallet.n}`, W / 2, 44);

    ctx.font = `11px ${FONT}`;
    ctx.fillStyle = '#6d8570';
    ctx.fillText('first receive address:', W / 2, 76);
    ctx.fillStyle = '#9fb3a0';
    ctx.font = `13px ${FONT}`;
    ctx.fillText(this._groupAddress(multisigFirstAddress), W / 2, 94);

    ctx.fillStyle = '#4a5f4c';
    ctx.font = `11px ${FONT}`;
    ctx.fillText('✓/✕ back', W / 2, H - 20);
    ctx.textAlign = 'left';
  }

  /** Malformed file, or the "your own key isn't in this file" security refusal. */
  _drawMultisigError(deviceState) {
    const { ctx, width: W, height: H } = this;

    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8503a';
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillText('Could not register', W / 2, H / 2 - 30);

    ctx.font = `11px ${FONT}`;
    ctx.fillStyle = '#9fb3a0';
    wrapText(ctx, deviceState.multisigError, W / 2, H / 2 - 6, W - 60, 15);

    ctx.fillStyle = '#4a5f4c';
    ctx.font = `11px ${FONT}`;
    ctx.fillText('✓/✕ continue', W / 2, H - 20);
    ctx.textAlign = 'left';
  }

  /** Shared windowed list-menu renderer, used by Settings and Multisig Wallets. */
  _drawSimpleList(deviceState, { header, items, selectedIndex, notice }) {
    const { ctx, width: W } = this;

    ctx.fillStyle = '#6d8570';
    ctx.font = `11px ${FONT}`;
    ctx.fillText(header, 16, 10);
    ctx.strokeStyle = '#233022';
    ctx.beginPath();
    ctx.moveTo(16, 26);
    ctx.lineTo(W - 16, 26);
    ctx.stroke();

    const visibleRows = 4;
    const startY = 40;
    const rowH = 32;
    const maxStart = Math.max(0, items.length - visibleRows);
    const start = Math.min(Math.max(selectedIndex - 1, 0), maxStart);
    const end = Math.min(start + visibleRows, items.length);

    for (let i = start; i < end; i++) {
      const row = i - start;
      const y = startY + row * rowH;
      if (i === selectedIndex) {
        ctx.fillStyle = 'rgba(61,220,116,0.15)';
        ctx.fillRect(8, y - 4, W - 16, rowH - 6);
        ctx.fillStyle = '#3ddc74';
        ctx.fillText('▶', 14, y + 3);
      } else {
        ctx.fillStyle = '#9fb3a0';
      }
      ctx.font = `15px ${FONT}`;
      ctx.fillText(items[i], 34, y + 3);
    }

    ctx.fillStyle = '#4a5f4c';
    ctx.font = `11px ${FONT}`;
    if (start > 0) ctx.fillText('▲', W - 24, startY - 14);
    if (end < items.length) ctx.fillText('▼', W - 24, startY + visibleRows * rowH - 18);

    if (notice) {
      ctx.fillStyle = '#3ddc74';
      ctx.font = `11px ${FONT}`;
      ctx.fillText(notice, 16, startY + visibleRows * rowH + 10);
    }
  }
}

/** Formats a BigInt satoshi amount with thousands separators, e.g. 90000n -> "90,000". */
function formatSats(sats) {
  return sats.toLocaleString('en-US');
}

/** First 6 + "…" + last 6 characters — enough to eyeball-match, short enough to fit on screen. */
function shortenAddress(address) {
  return address.length <= 16 ? address : `${address.slice(0, 6)}…${address.slice(-6)}`;
}

/** Simple word-wrap for the (rare) error message screen; ctx.textAlign is assumed 'center'. */
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let lineY = y;
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, lineY);
      line = word;
      lineY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, lineY);
}
