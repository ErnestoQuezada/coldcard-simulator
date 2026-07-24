/**
 * core/multisig-wallet.js
 * ------------------------------------------------------------
 * Builds and parses Coldcard's plain-text multisig wallet config
 * format — the file each device "registers" so it can recognize and
 * sign for a multisig wallet. Confirmed against multiple independent
 * sources (a security researcher's writeup, a Bitcoin Core PR
 * discussion, a Specter-Desktop bug report) all describing the exact
 * same format:
 *
 *   Name: My-2-of-2
 *   Policy: 2 of 2
 *   Derivation: m/48h/1h/0h/2h
 *   Format: P2WSH
 *
 *   A1A1A1A1: xpub...
 *   B1B1B1B1: xpub...
 *
 * SCOPE: this simulator only supports 2-of-2, native segwit (P2WSH,
 * BIP48 script_type 2'), regtest. Real Coldcard supports more
 * quorums/formats/coin types; not needed for what this project tests.
 *
 * SECURITY — READ BEFORE CHANGING parseMultisigConfig():
 * In January 2021, Coldcard fixed a real vulnerability where it would
 * register a multisig config WITHOUT checking that its own key was
 * actually one of the cosigners. A malicious coordinator could swap
 * in attacker-controlled xpubs, and the device would still show
 * "your" multisig addresses correctly — for making deposits — while
 * having no ability to control that money, or worse, verifying
 * change addresses that were actually the attacker's. This module
 * requires the caller to supply "our own" (fingerprint, xpub) pair,
 * and refuses to build a MultisigWallet unless that exact xpub is
 * genuinely present among the cosigners.
 */

import { sortedMultisig } from '@scure/btc-signer/payment.js';
import { HDKey } from '@scure/bip32';

/** This simulator only supports one derivation path — see the module scope note above. */
export const MULTISIG_DERIVATION_PATH = "m/48'/1'/0'/2'";
const MULTISIG_DERIVATION_DISPLAY = "m/48h/1h/0h/2h";
const REGTEST_NETWORK = { bech32: 'bcrt', pubKeyHash: 0x6f, scriptHash: 0xc4, wif: 0xef };

/** Same regtest tpub/tprv version bytes used everywhere else in this project (see wallet-engine.js). */
const REGTEST_KEY_VERSIONS = { private: 0x04358394, public: 0x043587cf };

export class MultisigWallet {
  /**
   * @param {object} config
   * @param {string} config.name
   * @param {number} config.m - required signatures
   * @param {{ fingerprint: string, xpub: string }[]} config.cosigners - length must equal n
   */
  constructor({ name, m, cosigners }) {
    this.name = name;
    this.m = m;
    this.cosigners = cosigners;
  }

  get n() {
    return this.cosigners.length;
  }

  /**
   * Derives the multisig payment (address + witnessScript) at a given
   * receive/change chain and index — combining EVERY cosigner's own
   * key at that same path, then sorting per BIP67 (sortedMultisig
   * does this automatically; this simulator never orders keys itself).
   * @param {0|1} chain - 0 = receive, 1 = change
   * @param {number} index
   */
  deriveAddress(chain, index) {
    const pubkeys = this.cosigners.map((c) => derivePublicKeyAtPath(c.xpub, chain, index));
    const payment = sortedMultisig(this.m, pubkeys, true, REGTEST_NETWORK);
    return { address: payment.address, witnessScript: payment.witnessScript };
  }
}

/**
 * Builds the exact config text a real Coldcard would read, from this
 * device's own (fingerprint, xpub) plus however many other cosigners
 * are already known.
 * @param {string} name
 * @param {number} m
 * @param {{ fingerprint: string, xpub: string }[]} cosigners - length must equal n; order doesn't matter, sortedMultisig re-sorts
 */
export function buildMultisigConfigText(name, m, cosigners) {
  const lines = [
    `Name: ${name}`,
    `Policy: ${m} of ${cosigners.length}`,
    `Derivation: ${MULTISIG_DERIVATION_DISPLAY}`,
    'Format: P2WSH',
    '',
    ...cosigners.map((c) => `${c.fingerprint.toUpperCase()}: ${c.xpub}`),
  ];
  return lines.join('\n');
}

/**
 * Parses a multisig config text file and verifies OUR OWN key is
 * genuinely one of the cosigners before returning a MultisigWallet.
 * @param {string} text
 * @param {{ fingerprint: string, xpub: string }} ownKey - what THIS
 *   device would export for itself right now (see wallet-export.js's
 *   buildMultisigExport) — compared by xpub, not just fingerprint.
 * @returns {MultisigWallet}
 * @throws if the file is malformed, or if `ownKey.xpub` isn't present
 *   among the parsed cosigners — see the security note in the file header.
 */
export function parseMultisigConfigText(text, ownKey) {
  const lines = text.split('\n').map((l) => l.trim());

  const name = matchField(lines, 'Name');
  const policy = matchField(lines, 'Policy'); // "M of N"
  const format = matchField(lines, 'Format');

  if (!name || !policy || !format) {
    throw new Error('Not a recognizable multisig config file.');
  }
  if (format !== 'P2WSH') {
    throw new Error(`Unsupported format "${format}" — this simulator only supports P2WSH.`);
  }

  const [mStr, , nStr] = policy.split(' '); // "2 of 2" -> ["2","of","2"]
  const m = Number.parseInt(mStr, 10);
  const n = Number.parseInt(nStr, 10);

  const cosigners = lines
    .map((line) => /^([0-9A-Fa-f]{8}):\s*(\S+)$/.exec(line))
    .filter(Boolean)
    .map((match) => ({ fingerprint: match[1].toLowerCase(), xpub: match[2] }));

  if (cosigners.length !== n) {
    throw new Error(`Expected ${n} cosigners, found ${cosigners.length}.`);
  }

  // --- THE security check (see file header) ---
  const ownKeyPresent = cosigners.some((c) => c.xpub === ownKey.xpub);
  if (!ownKeyPresent) {
    throw new Error(
      "This device's own key is not among the cosigners in this file — refusing to register. " +
        'Registering an unverified config could let a malicious file show fake "your" addresses.'
    );
  }

  return new MultisigWallet({ name, m, cosigners });
}

function matchField(lines, fieldName) {
  const line = lines.find((l) => l.startsWith(`${fieldName}:`));
  return line ? line.slice(fieldName.length + 1).trim() : null;
}

/** Derives the compressed public key at .../chain/index from an extended public key string. */
function derivePublicKeyAtPath(xpubString, chain, index) {
  const accountKey = HDKey.fromExtendedKey(xpubString, REGTEST_KEY_VERSIONS);
  return accountKey.derive(`m/${chain}/${index}`).publicKey;
}

/**
 * Builds this device's own per-device multisig xpub export — matches
 * Coldcard's real "ccxp-<XFP>.json" file (Settings > Multisig Wallets
 * > Export XPUB). This is a SEPARATE export from the single-sig
 * Generic JSON (wallet-export.js) — Coldcard's own docs are explicit
 * that importing the wrong one "loads the wrong key" for multisig.
 * @param {import('./wallet-engine.js').Wallet} wallet
 */
export function buildCosignerExport(wallet) {
  const account = wallet.deriveAccount(MULTISIG_DERIVATION_PATH);
  return {
    xfp: wallet.fingerprint.toUpperCase(),
    xpub: account.xpub,
    deriv: MULTISIG_DERIVATION_DISPLAY,
  };
}

/** The exact filename convention Coldcard uses for the cosigner export. */
export function cosignerExportFilename(wallet) {
  return `ccxp-${wallet.fingerprint.toUpperCase()}.json`;
}

/**
 * Reads a ccxp export back into the {fingerprint, xpub} shape
 * buildMultisigConfigText()/parseMultisigConfigText() use.
 * @param {object} json - parsed ccxp-*.json content
 * @returns {{fingerprint: string, xpub: string}}
 */
export function cosignerFromExportJson(json) {
  return { fingerprint: json.xfp.toLowerCase(), xpub: json.xpub };
}
