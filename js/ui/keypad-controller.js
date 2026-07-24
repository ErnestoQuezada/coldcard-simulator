/**
 * ui/keypad-controller.js
 * ------------------------------------------------------------
 * Handles on-screen keypad clicks for ONE device instance, and
 * exposes `pressKey()` so an external source (the physical
 * keyboard, routed through Workspace) can trigger the exact same
 * flash animation + callback as a real click would.
 *
 * IMPORTANT: this class deliberately does NOT listen to
 * window.keydown itself. With up to 2 device instances on the
 * page sharing one physical keyboard, only ONE global listener
 * should exist — owned by Workspace, which routes key events to
 * whichever device is currently "active". If every instance
 * bound its own window listener, a single keypress would control
 * every device at once, breaking the independent-signer illusion.
 */

/**
 * Maps physical keyboard event.code values to the simulator's
 * logical key names ('0'-'9', 'ok', 'x'). Exported so Workspace's
 * single shared listener can use the same mapping.
 */
export const PHYSICAL_KEY_MAP = {
  Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5', Digit6: '6',
  Digit7: '7', Digit8: '8', Digit9: '9', Digit0: '0',
  Numpad1: '1', Numpad2: '2', Numpad3: '3', Numpad4: '4', Numpad5: '5', Numpad6: '6',
  Numpad7: '7', Numpad8: '8', Numpad9: '9', Numpad0: '0',
  ArrowUp: '5', ArrowDown: '8', ArrowLeft: '7', ArrowRight: '9',
  Enter: 'ok', NumpadEnter: 'ok',
  Escape: 'x', Backspace: 'x',
};

export class KeypadController {
  /**
   * @param {HTMLElement} keypadEl - container with `.key[data-key]` buttons
   * @param {(key: string) => void} onKey - called with the logical key pressed
   */
  constructor(keypadEl, onKey) {
    this.keypadEl = keypadEl;
    this.onKey = onKey;
    this._bindClicks();
  }

  _bindClicks() {
    this.keypadEl.querySelectorAll('.key').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        this._flash(btn);
        this.onKey(key);
      });
    });
  }

  /**
   * Simulates pressing a logical key from an external source (the
   * physical keyboard). Flashes the matching on-screen button and
   * fires the same callback a mouse click would.
   * @param {string} key
   */
  pressKey(key) {
    const btn = this.keypadEl.querySelector(`.key[data-key="${key}"]`);
    if (btn) this._flash(btn);
    this.onKey(key);
  }

  /** Brief visual "pressed" feedback, matching the CSS .pressed rule. */
  _flash(btn) {
    btn.classList.add('pressed');
    setTimeout(() => btn.classList.remove('pressed'), 120);
  }
}
