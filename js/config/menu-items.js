/**
 * config/menu-items.js
 * ------------------------------------------------------------
 * Labels shown in the simulated main menu.
 *
 * PHASE 1 (current): purely cosmetic — pressing OK on an item
 * does nothing yet (see the placeholder comment in
 * core/device-state.js, DeviceStateMachine#handleKey).
 *
 * PHASE 2 (planned): each label becomes a real action wired to
 * the wallet engine — e.g. "Import Seed" opens a BIP39 mnemonic
 * entry screen, "New Seed Words" generates one, "Address
 * Explorer" derives and displays receive addresses, etc.
 */

export const MENU_ITEMS = [
  "Ready To Sign",
  "Passphrase",
  "Import Seed",
  "New Seed Words",
  "Wallet Storage",
  "Address Explorer",
  "Advanced/Tools",
  "Settings",
];
