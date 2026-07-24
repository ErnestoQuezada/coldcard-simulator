/**
 * core/workspace.js
 * ------------------------------------------------------------
 * Manages the set of live DeviceInstances on the page.
 *
 * Rules enforced here (not negotiable elsewhere in the app):
 *   - MIN_DEVICES = 1: there must always be at least one Coldcard
 *     visible. The remove button on the last remaining device is
 *     disabled rather than letting the workspace go empty.
 *   - MAX_DEVICES = 2: only two signers are supported right now
 *     (enough to test a real 2-of-2 or a leg of a larger multisig
 *     later). The "add" button is hidden once the max is reached.
 *
 * Also owns two things that must NOT be duplicated per-instance:
 *   - The single `window.keydown` listener. There is only one
 *     physical keyboard; it always controls whichever instance is
 *     "active" (see DeviceInstance's device-focus-request event).
 *   - The single `requestAnimationFrame` loop. Each instance's
 *     `tick()` + `render()` are called from here, so
 *     removing an instance from `this.devices` is all it takes to
 *     stop its work — no per-instance loop to leak.
 */

import { DeviceInstance } from './device-instance.js';
import { PHYSICAL_KEY_MAP } from '../ui/keypad-controller.js';

const MIN_DEVICES = 1;
const MAX_DEVICES = 2;

export class Workspace {
  /**
   * @param {Object} els
   * @param {HTMLElement} els.workspaceEl - container the device slots are appended to
   * @param {HTMLTemplateElement} els.template - the reusable device markup
   * @param {HTMLButtonElement} els.addButtonEl - the "+ Add second Coldcard" button
   */
  constructor({ workspaceEl, template, addButtonEl }) {
    this.workspaceEl = workspaceEl;
    this.template = template;
    this.addButtonEl = addButtonEl;

    /** @type {DeviceInstance[]} */
    this.devices = [];
    /** @type {DeviceInstance|null} whichever instance currently owns keyboard focus */
    this.activeDevice = null;

    this.addButtonEl.addEventListener('click', () => this.addDevice());

    // Single shared listener for ALL instances — see file header for why.
    window.addEventListener('keydown', (event) => this._handlePhysicalKey(event));

    // Bubbled from DeviceInstance when the user clicks/taps a device.
    this.workspaceEl.addEventListener('device-focus-request', (event) => {
      const instance = this.devices.find((d) => d.rootEl.contains(event.target));
      if (instance) this.setActiveDevice(instance);
    });

    // Start with the required minimum. Always at least one Coldcard on the page.
    this.addDevice();

    this._startRenderLoop();
  }

  /** Adds a new device, unless we're already at MAX_DEVICES. */
  addDevice() {
    if (this.devices.length >= MAX_DEVICES) return;

    const instance = new DeviceInstance(this.template);

    instance.removeBtnEl.addEventListener('click', () => this.removeDevice(instance.id));

    this.workspaceEl.appendChild(instance.rootEl);
    this.devices.push(instance);

    // A newly added device is the natural thing to focus next.
    this.setActiveDevice(instance);

    this._relabelDevices();
    this._updateButtonStates();
  }

  /**
   * Removes a device by id, unless it's the last one remaining.
   * @param {string} id
   */
  removeDevice(id) {
    if (this.devices.length <= MIN_DEVICES) return;

    const index = this.devices.findIndex((d) => d.id === id);
    if (index === -1) return;

    const [removed] = this.devices.splice(index, 1);
    const wasActive = this.activeDevice === removed;
    removed.destroy();

    // If the removed device had keyboard focus, hand it to whichever
    // device remains — physical input must always have a destination.
    if (wasActive) {
      this.setActiveDevice(this.devices[0] ?? null);
    }

    this._relabelDevices();
    this._updateButtonStates();
  }

  /** @param {DeviceInstance|null} instance */
  setActiveDevice(instance) {
    this.activeDevice = instance;
    this.devices.forEach((d) => d.setActive(d === instance));
  }

  /** Labels devices by their current left-to-right position: "Device 1", "Device 2". */
  _relabelDevices() {
    this.devices.forEach((d, i) => d.setLabel(`Device ${i + 1}`));
  }

  /** Add button hides at the max; remove buttons disable at the min. */
  _updateButtonStates() {
    this.addButtonEl.disabled = this.devices.length >= MAX_DEVICES;
    const canRemove = this.devices.length > MIN_DEVICES;
    this.devices.forEach((d) => d.setRemovable(canRemove));
  }

  /**
   * Routes a physical keypress to the active device only. If a key
   * isn't in the map (e.g. Tab, F5) it's ignored so we don't hijack
   * normal browser shortcuts.
   */
  _handlePhysicalKey(event) {
    const key = PHYSICAL_KEY_MAP[event.code];
    if (!key || !this.activeDevice) return;
    event.preventDefault();
    this.activeDevice.pressKey(key);
  }

  /** One rAF loop drives every live instance; see file header for why. */
  _startRenderLoop() {
    const loop = () => {
      for (const device of this.devices) {
        device.tick();
        device.render();
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
