/**
 * core/wallet-engine.js
 * ------------------------------------------------------------
 * Turns 12 BIP39 words (generated fresh, or imported by the user)
 * into a BIP32 master key and a BIP84 account key — nothing more.
 * Descriptor construction and wallet export live in later modules
 * that will be built once this is confirmed working; this file's
 * only job is "words in, keys out."
 *
 * Pure logic, no DOM. Every function here is a plain function of
 * its inputs — this module never touches the screen, the keypad,
 * or any other instance's state. That's what lets each of the 2
 * device instances hold a completely independent Wallet: two
 * instances never share a call into this file's internals.
 *
 * ============================================================
 * ON ENTROPY (read this before touching anything below)
 * ============================================================
 * generateMnemonic() (imported from @scure/bip39) generates its own
 * randomness internally — it calls @noble/hashes' `randomBytes()`,
 * which explicitly requires and calls the browser's
 * `crypto.getRandomValues()` (Web Crypto API) and throws if that
 * API isn't available. That's a cryptographically secure PRNG seeded
 * by the OS — the correct source for this. It is NOT related to
 * "crypto" as in cryptocurrency; the name is a historical coincidence
 * (the browser API predates Bitcoin).
 *
 * secp256k1 (via @noble/curves, a dependency of @scure/bip32) is used
 * ELSEWHERE in this file — for deriving public keys from private keys
 * during BIP32 derivation. It is never used to generate randomness;
 * no elliptic-curve library generates randomness, that was never its
 * job in any Bitcoin implementation, hardware or software.
 *
 * We never call crypto.getRandomValues() ourselves in this file —
 * there's no need to, since generateMnemonic() already does it
 * correctly. Writing our own wrapper around it would just be an
 * extra layer with no security benefit.
 * ============================================================
 */

import { generateMnemonic as generateMnemonicWords, validateMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { HDKey } from '@scure/bip32';

/** 128 bits of entropy = 12 words. (256 bits = 24 words, not offered — see project scope notes.) */
const MNEMONIC_STRENGTH_BITS = 128;

/**
 * BIP32 extended-key version bytes for testnet AND regtest — both
 * networks share the same `tprv`/`tpub` version bytes by convention
 * (this is also why Coldcard's own "chain" export field distinguishes
 * XTN/XRT as separate values even though the key version bytes are
 * identical between them). Confirmed against BIP-32's spec text.
 * Mainnet (xprv/xpub) is deliberately not defined here — this
 * simulator only operates on regtest.
 */
const REGTEST_KEY_VERSIONS = { private: 0x04358394, public: 0x043587cf };

/**
 * Generates a brand-new 12-word mnemonic using the wordlist's own
 * secure entropy (see the file header for exactly where that comes
 * from).
 * @returns {string} 12 space-separated English BIP39 words
 */
export function generateNewMnemonic() {
  return generateMnemonicWords(wordlist, MNEMONIC_STRENGTH_BITS);
}

/**
 * Checks whether a phrase is a valid BIP39 mnemonic (correct word
 * count, every word in the wordlist, and a valid checksum). Mirrors
 * the normalization your C# EsMnemonicValido() did — trim whitespace,
 * lowercase — before checking, since that's exactly the kind of
 * input a person typing on a keypad (or pasting) will produce.
 * @param {string} phrase
 * @returns {boolean}
 */
export function isValidMnemonic(phrase) {
  const cleaned = phrase.trim().toLowerCase();
  return validateMnemonic(cleaned, wordlist);
}

/**
 * A single derived wallet: the result of combining 12 words with an
 * (optional) BIP39 passphrase. Everything here is deterministic —
 * call this twice with the same mnemonic and passphrase, get
 * identical results back every time.
 *
 * IMPORTANT: passphrase is not a detail. An empty passphrase ('')
 * and any non-empty passphrase produce two COMPLETELY UNRELATED
 * wallets from the same 12 words — different seed, different master
 * key, different fingerprint, different account xpub. There is no
 * "the wallet, plus a passphrase modifier" — there is only ever
 * "the wallet for this exact (mnemonic, passphrase) pair." Treat the
 * passphrase as part of the identity of the wallet, never as an
 * add-on to it.
 *
 * This class only derives the MASTER key — it deliberately has no
 * opinion about which account-level paths matter (BIP44 vs BIP49 vs
 * BIP84 vs, later, BIP48 for multisig). Callers derive whatever they
 * need via deriveAccount(path). See core/wallet-export.js for where
 * the specific BIP44/49/84 paths this simulator cares about are
 * defined and used.
 */
export class Wallet {
  /**
   * @param {string} mnemonic - 12 space-separated BIP39 words (assumed already validated)
   * @param {string} [passphrase] - BIP39 passphrase; '' (the default) is itself a valid, specific choice
   */
  constructor(mnemonic, passphrase = '') {
    this.mnemonic = mnemonic;
    this.passphrase = passphrase;

    // mnemonic + passphrase -> 512-bit seed (PBKDF2-HMAC-SHA512 per BIP39)
    const seed = mnemonicToSeedSync(mnemonic, passphrase);

    // seed -> BIP32 master key, using regtest/testnet version bytes
    this.masterKey = HDKey.fromMasterSeed(seed, REGTEST_KEY_VERSIONS);
  }

  /**
   * The master fingerprint (XFP) — an 8-hex-character ID derived from
   * the master public key. This is the root-of-trust identifier used
   * in descriptors (`[fingerprint/84'/1'/0']...`) and in Coldcard's
   * export files — NOT the same as any individual account's own
   * fingerprint (see deriveAccount() below). Different (mnemonic,
   * passphrase) pairs almost certainly produce different fingerprints.
   * @returns {string} 8 lowercase hex characters, e.g. "f790f239"
   */
  get fingerprint() {
    return this.masterKey.fingerprint.toString(16).padStart(8, '0');
  }

  /**
   * The MASTER extended public key (depth 0, tpub...) — not scoped to
   * any account. This is what Coldcard's Generic JSON export calls the
   * top-level "xpub" field, distinct from any of the per-account xpubs
   * deriveAccount() returns.
   * @returns {string}
   */
  get masterXpub() {
    return this.masterKey.publicExtendedKey;
  }

  /**
   * Derives any account-level (or deeper) key from this wallet's
   * master key. This is the one general-purpose derivation entry
   * point in the whole simulator — BIP44, BIP49, and BIP84 all call
   * this today with their own path (see core/wallet-export.js), and
   * BIP48 (multisig, later) will do the exact same thing with its own
   * path, with no changes needed here.
   *
   * Note the returned fingerprint is THIS key's own fingerprint (i.e.
   * of the account-level key itself) — not the wallet's master
   * fingerprint above. Coldcard's export format includes both,
   * distinctly, for the same reason.
   *
   * @param {string} path - e.g. "m/84'/1'/0'"
   * @returns {{ path: string, xpub: string, fingerprint: string }}
   */
  deriveAccount(path) {
    const key = this.masterKey.derive(path);
    return {
      path,
      xpub: key.publicExtendedKey,
      fingerprint: key.fingerprint.toString(16).padStart(8, '0'),
    };
  }

  /**
   * Derives the pubKeyHash (RIPEMD160(SHA256(pubkey))) at any full
   * path — account-level or deeper (e.g. a specific receive/change
   * address index). This is what core/address-encoder.js needs to
   * build an actual address string; this method itself has no
   * opinion on which address format that becomes.
   * @param {string} fullPath - e.g. "m/84'/1'/0'/0/3"
   * @returns {Uint8Array} 20 bytes
   */
  derivePubKeyHash(fullPath) {
    return this.masterKey.derive(fullPath).pubKeyHash;
  }

  /**
   * Derives the pubKeyHash at a raw BIP32 index array — e.g.
   * [0x80000054, 0x80000001, 0x80000000, 1, 3] for m/84'/1'/0'/1/3 —
   * rather than a path string. This is the format a PSBT's own
   * bip32Derivation field uses, so this lets psbt-signer.js verify a
   * PSBT's CLAIMED path without round-tripping it through a path
   * string first.
   * @param {number[]} indices - hardened components already include the offset
   * @returns {Uint8Array} 20 bytes
   */
  derivePubKeyHashFromIndices(indices) {
    return this._deriveFromIndices(indices).pubKeyHash;
  }

  /**
   * Derives the private key at a raw BIP32 index array. See
   * derivePubKeyHashFromIndices() above for why raw indices instead
   * of a path string — used when signing a PSBT input whose
   * bip32Derivation claims a path under this wallet.
   * @param {number[]} indices
   * @returns {Uint8Array} 32 bytes
   */
  derivePrivateKeyFromIndices(indices) {
    return this._deriveFromIndices(indices).privateKey;
  }

  _deriveFromIndices(indices) {
    let key = this.masterKey;
    for (const index of indices) key = key.deriveChild(index);
    return key;
  }
}
