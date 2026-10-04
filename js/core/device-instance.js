/**
 * core/device-instance.js
 * ------------------------------------------------------------
 * One fully-independent simulated Coldcard: its own cloned DOM,
 * its own DeviceStateMachine, its own ScreenRenderer, its own
 * KeypadController, and its own color theme.
 *
 * "Fully independent" is not a nice-to-have here — it's the whole
 * point. Two Coldcards on screen are meant to model two genuinely
 * separate air-gapped signers (for testing multisig later), so
 * nothing about one instance may leak into or depend on another.
 *
 * Ownership / lifecycle notes:
 *   - This class does NOT run its own requestAnimationFrame loop.
 *     Workspace runs a single shared loop and calls `tick()`
 *     + `render()` on every live instance each frame. Giving each
 *     instance its own rAF loop would mean a removed instance's
 *     loop keeps running forever unless carefully cancelled — easy
 *     to get wrong. A single shared loop makes teardown trivial:
 *     removing an instance from Workspace's array is enough.
 *   - This class does NOT listen to window keydown events either.
 *     See keypad-controller.js for why physical keyboard input is
 *     owned by Workspace instead of by each instance.
 *   - Call `destroy()` when removing an instance, so its DOM node
 *     is detached. (There's no manual event-listener cleanup
 *     needed for the on-screen key buttons — they're removed with
 *     the DOM node itself, so the browser garbage-collects their
 *     listeners naturally.)
 */

import { DeviceStateMachine } from "./device-state.js";
import { ScreenRenderer } from "../ui/screen-renderer.js";
import { KeypadController } from "../ui/keypad-controller.js";
import { initThemePicker } from "../ui/theme-picker.js";
import { MENU_ITEMS } from "../config/menu-items.js";
import { THEMES } from "../config/themes.js";
import { buildGenericJsonExport, EXPORT_FILENAME } from "./wallet-export.js";
import {
  buildCosignerExport,
  cosignerExportFilename,
} from "./multisig-wallet.js";
import {
  downloadJSON,
  downloadBinaryFile,
  downloadTextFile,
  openBinaryFile,
} from "../io/file-io.js";
import {
  saveWallet,
  listWallets,
  loadWallet,
  deleteWallet,
  saveMultisigWallet,
  listMultisigWallets,
  loadMultisigWallet,
} from "../io/wallet-storage.js";

let instanceCounter = 0;

export class DeviceInstance {
  /**
   * @param {HTMLTemplateElement} template - the <template id="device-template">
   */
  constructor(template, themeSlot = 0) {
    /** @type {string} stable unique id, independent of on-screen position */
    this.id = `device-${++instanceCounter}`;

    /** @type {HTMLElement} the cloned `.device-slot` root for this instance */
    this.rootEl = template.content.firstElementChild.cloneNode(true);

    // Scope every lookup to this instance's own root — never use a
    // global id/query, since a sibling instance has the same classes.
    this.deviceEl = this.rootEl.querySelector(".device");
    this.canvasEl = this.rootEl.querySelector(".screen-canvas");
    this.keypadEl = this.rootEl.querySelector(".keypad");
    this.swatchesEl = this.rootEl.querySelector(".swatches");
    this.labelEl = this.rootEl.querySelector(".device-label");
    this.removeBtnEl = this.rootEl.querySelector(".device-remove-btn");

    this.state = new DeviceStateMachine(MENU_ITEMS, {
      // These are the ONLY places a real file dialog/download happens
      // for this device. device-state.js never imports wallet-export.js,
      // psbt-signer.js, or io/file-io.js itself — it only calls these
      // callbacks, keeping the state machine DOM-free. See
      // device-state.js's constructor doc for the full reasoning.
      onExportRequested: (wallet) =>
        downloadJSON(EXPORT_FILENAME, buildGenericJsonExport(wallet)),
      onSignRequested: async () => {
        const file = await openBinaryFile({ accept: ".psbt" });
        if (!file) {
          this.state.handlePsbtLoadCancelled();
          return;
        }
        this.state.handlePsbtFileLoaded(file.name, file.bytes);
      },
      onPsbtSigned: (filename, bytes) => downloadBinaryFile(filename, bytes),
      onExportCosignerRequested: (wallet) =>
        downloadJSON(
          cosignerExportFilename(wallet),
          buildCosignerExport(wallet),
        ),
      onCombineRequested: async () => {
        const file = await openBinaryFile({ accept: ".json" });
        if (!file) {
          this.state.handleCosignerFileLoadCancelled();
          return;
        }
        this.state.handleCosignerFileLoaded(
          new TextDecoder().decode(file.bytes),
        );
      },
      onRegisterRequested: async () => {
        const file = await openBinaryFile({ accept: ".txt" });
        if (!file) {
          this.state.handleRegisterFileLoadCancelled();
          return;
        }
        this.state.handleRegisterFileLoaded(
          new TextDecoder().decode(file.bytes),
        );
      },
      onMultisigConfigReady: (filename, text) =>
        downloadTextFile(filename, text),
      onWalletSaveRequested: saveWallet,
      onWalletListRequested: listWallets,
      onWalletLoadRequested: loadWallet,
      onWalletDeleteRequested: deleteWallet,
      onMultisigSaveRequested: saveMultisigWallet,
      onMultisigListRequested: listMultisigWallets,
      onMultisigLoadRequested: loadMultisigWallet,
    });
    this.renderer = new ScreenRenderer(this.canvasEl);
    this.keypad = new KeypadController(this.keypadEl, (key) =>
      this.state.handleKey(key),
    );
    this.setThemeSlot = initThemePicker(
      this.swatchesEl,
      this.deviceEl,
      THEMES,
      themeSlot,
    );

    // Clicking anywhere on the device makes it the "active" one, so
    // physical keyboard input follows the user's attention. Workspace
    // listens for this custom event rather than reaching back into
    // each instance's internals.
    this.rootEl.addEventListener("pointerdown", () => {
      this.rootEl.dispatchEvent(
        new CustomEvent("device-focus-request", { bubbles: true }),
      );
    });

    if (window.__TAURI__) {
      const topPanel = this.rootEl.querySelector(".top-panel");
      if (topPanel) {
        topPanel.setAttribute("data-tauri-drag-region", "");
        topPanel.querySelectorAll(".top-row, .brand-left, .brand-right, .logo, .frame-dots, .frame-dots span").forEach(el => el.setAttribute("data-tauri-drag-region", ""));
      }

      this.deviceEl.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        this.swatchesEl.classList.toggle("show");
      });
    }
  }

  /** @param {string} label - e.g. "Device 1" */
  setLabel(label) {
    this.labelEl.textContent = label;
  }

  /** @param {boolean} isActive - toggles the visual focus ring */
  setActive(isActive) {
    this.rootEl.classList.toggle("active", isActive);
  }

  /** @param {boolean} canRemove - false disables the remove button (last device left) */
  setRemovable(canRemove) {
    this.removeBtnEl.disabled = !canRemove;
  }

  /** Advances this instance's own transitional animations (boot bar, wallet-creation curtain); independent of any other instance. */
  tick() {
    this.state.tick();
  }

  /** Draws this instance's own screen from its own state. */
  render() {
    this.renderer.draw(this.state);
  }

  /**
   * Routes a physical-keyboard key press to this instance specifically.
   * Only called by Workspace, and only for whichever instance is active.
   */
  pressKey(key) {
    this.keypad.pressKey(key);
  }

  /** Detaches this instance's DOM node. Call when removing it from the workspace. */
  destroy() {
    this.rootEl.remove();
  }
}
