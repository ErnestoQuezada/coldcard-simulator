/**
 * core/address-encoder.js
 * ------------------------------------------------------------
 * Encodes a derived key's pubKeyHash into the 3 single-sig address
 * formats this simulator supports — regtest only.
 *
 * Pure logic, no DOM, no state. Given a key (from
 * Wallet#deriveAccount() or a further .derive() call on the returned
 * HDKey), returns an address string. This module has no opinion on
 * WHICH key/index gets encoded — that's address-explorer-state's job.
 *
 * Version bytes / HRP confirmed directly from Bitcoin Core's own
 * chainparams.cpp (CRegTestParams): regtest shares its P2PKH (0x6f)
 * and P2SH (0xc4) version bytes with testnet — only the bech32 HRP
 * differs ("bcrt" vs testnet's "tb"). Not guessed from memory alone;
 * cross-checked against Bitcoin Core source and a real
 * `bitcoin-cli -regtest getnewaddress` example before shipping.
 */

import { createBase58check, bech32 } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2.js';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { concatBytes } from '@noble/hashes/utils.js';

const base58check = createBase58check(sha256);

const REGTEST_P2PKH_VERSION = 0x6f;
const REGTEST_P2SH_VERSION = 0xc4;
const REGTEST_BECH32_HRP = 'bcrt';

/**
 * P2PKH ("Classic") address: base58check(version || pubKeyHash).
 * @param {Uint8Array} pubKeyHash - 20 bytes, e.g. a derived HDKey's `.pubKeyHash`
 * @returns {string} e.g. "mfoo...bar"
 */
export function encodeP2PKH(pubKeyHash) {
  return base58check.encode(concatBytes(Uint8Array.of(REGTEST_P2PKH_VERSION), pubKeyHash));
}

/**
 * P2SH-P2WPKH ("Segwit wrapped in P2SH") address. The redeem script
 * for a wrapped P2WPKH is exactly `OP_0 <20-byte pubKeyHash>`
 * (bytes: 0x00 0x14 <hash>); the P2SH address commits to HASH160 of
 * THAT script, not to the pubkey hash directly.
 * @param {Uint8Array} pubKeyHash - 20 bytes
 * @returns {string} e.g. "2foo...bar"
 */
export function encodeP2SHP2WPKH(pubKeyHash) {
  const redeemScript = concatBytes(Uint8Array.of(0x00, 0x14), pubKeyHash);
  const scriptHash = ripemd160(sha256(redeemScript));
  return base58check.encode(concatBytes(Uint8Array.of(REGTEST_P2SH_VERSION), scriptHash));
}

/**
 * P2WPKH ("Segwit native") address: bech32, witness version 0.
 * @param {Uint8Array} pubKeyHash - 20 bytes
 * @returns {string} e.g. "bcrt1qfoo...bar"
 */
export function encodeP2WPKH(pubKeyHash) {
  const words = [0, ...bech32.toWords(pubKeyHash)];
  return bech32.encode(REGTEST_BECH32_HRP, words);
}
