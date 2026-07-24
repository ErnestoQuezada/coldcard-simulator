/**
 * core/wallet-export.js
 * ------------------------------------------------------------
 * Builds Coldcard's "Generic JSON" wallet export — the exact file
 * format documented at:
 *   github.com/Coldcard/firmware/blob/master/docs/generic-wallet-export.md
 * and the same format Sparrow's "Import File > Coldcard" reads
 * (sparrowwallet.com/docs/coldcard-wallet.html), delivered as
 * `coldcard-export.json` — that exact filename, per Coldcard's own
 * docs ("do not rename or modify the file").
 *
 * SCOPE — deliberately omitted for now, each noted where relevant below:
 *   - Multisig sections (bip48_1, bip48_2, bip45): this simulator is
 *     single-sig only for now. When multisig lands, it derives via
 *     the same Wallet#deriveAccount(path) used here — nothing about
 *     THIS file needs to change for that to work.
 *   - The `_pub` SLIP-132 field (ypub/upub/zpub/vpub): Sparrow doesn't
 *     need it to import; it's an alternate encoding some other tools
 *     read instead of the plain xpub.
 *   - The `first` address field: computing it means deriving and
 *     encoding an actual address (P2PKH/P2SH-P2WPKH/P2WPKH — three
 *     different encodings). That's genuinely the "Address Explorer"
 *     feature, not yet built. Add it here once that exists, so the
 *     address-encoding logic is written exactly once, not duplicated.
 *
 * Two formatting details that are easy to get wrong:
 *   - Coldcard writes derivation paths with 'h' for hardened steps
 *     (m/84h/0h/0h) in the file; our own code uses apostrophes
 *     ("m/84'/1'/0'") internally because that's what @scure/bip32's
 *     derive() requires as input. Converting between the two is
 *     entirely the job of toDisplayPath()/toDescriptorOrigin() below.
 *   - The standalone "xfp" fields are UPPERCASE hex. The same
 *     fingerprint embedded inside a descriptor string's origin info
 *     (e.g. "[0f056943/84h/...]") is lowercase. Both appear in this
 *     file — don't let one accidentally match the other's case.
 */

import { addChecksum } from './descriptor-checksum.js';

/** Regtest, per Coldcard's own "chain" field convention (BTC / XTN / XRT). */
const CHAIN = 'XRT';

/** This simulator only offers account 0 — no account-switching UI exists yet. */
const ACCOUNT = 0;

/** Coin type 1' for testnet/regtest — matches every path this project derives. */
const COIN_TYPE = "1'";

/** The 3 single-signature schemes Coldcard's Generic JSON always includes. */
const SINGLE_SIG_SCHEMES = [
  {
    section: 'bip44',
    name: 'p2pkh',
    purpose: "44'",
    buildDescriptor: (fingerprint, originPath, xpub) => `pkh([${fingerprint}/${originPath}]${xpub}/<0;1>/*)`,
  },
  {
    section: 'bip49',
    name: 'p2sh-p2wpkh',
    purpose: "49'",
    buildDescriptor: (fingerprint, originPath, xpub) => `sh(wpkh([${fingerprint}/${originPath}]${xpub}/<0;1>/*))`,
  },
  {
    section: 'bip84',
    name: 'p2wpkh',
    purpose: "84'",
    buildDescriptor: (fingerprint, originPath, xpub) => `wpkh([${fingerprint}/${originPath}]${xpub}/<0;1>/*)`,
  },
];

/** "m/84'/1'/0'" -> "m/84h/1h/0h" (Coldcard's display convention for the "deriv" field). */
function toDisplayPath(path) {
  return path.replace(/'/g, 'h');
}

/** "m/84'/1'/0'" -> "84h/1h/0h" (no leading "m/") — what goes inside a descriptor's [origin]. */
function toDescriptorOrigin(path) {
  return toDisplayPath(path).replace(/^m\//, '');
}

/** Builds one of the bip44 / bip49 / bip84 sections for a given scheme config. */
function buildSingleSigSection(wallet, scheme) {
  const path = `m/${scheme.purpose}/${COIN_TYPE}/${ACCOUNT}'`;
  const account = wallet.deriveAccount(path);

  // The fingerprint embedded IN the descriptor is always the wallet's
  // MASTER fingerprint (the root of trust for the whole derivation
  // path) — never this account's own fingerprint. See the note on
  // Wallet#deriveAccount() in wallet-engine.js for why those two are
  // different values.
  const descriptorBody = scheme.buildDescriptor(wallet.fingerprint, toDescriptorOrigin(path), account.xpub);

  return {
    name: scheme.name,
    xfp: account.fingerprint.toUpperCase(),
    deriv: toDisplayPath(path),
    xpub: account.xpub,
    desc: addChecksum(descriptorBody),
  };
}

/**
 * Builds the full Generic JSON export object for whichever wallet is
 * passed in — always the CURRENTLY ACTIVE wallet on a device (base or
 * passphrase-applied; this function has no opinion on which, matching
 * how the real Coldcard's export always reflects whatever's active).
 *
 * @param {import('./wallet-engine.js').Wallet} wallet
 * @returns {object} plain JSON-serializable object, ready for JSON.stringify()
 */
export function buildGenericJsonExport(wallet) {
  const sections = {};
  for (const scheme of SINGLE_SIG_SCHEMES) {
    sections[scheme.section] = buildSingleSigSection(wallet, scheme);
  }

  return {
    chain: CHAIN,
    xfp: wallet.fingerprint.toUpperCase(),
    account: ACCOUNT,
    xpub: wallet.masterXpub,
    ...sections,
  };
}

/** The exact filename Coldcard itself uses — Sparrow's docs say not to rename it. */
export const EXPORT_FILENAME = 'coldcard-export.json';
