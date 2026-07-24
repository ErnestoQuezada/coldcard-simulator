/**
 * core/psbt-signer.js
 * ------------------------------------------------------------
 * Parses a PSBT, builds the human-readable summary for the
 * "Ready To Sign" review screen, and signs whichever inputs this
 * wallet's keys can sign — then finalizes and extracts the final
 * signed transaction.
 *
 * Pure logic, no DOM. device-state.js decides WHEN this runs and
 * what to do with the result; this module only does the Bitcoin work.
 *
 * SECURITY NOTE ON CHANGE DETECTION: an output's bip32Derivation
 * field ("this is your change, at path X") is just a CLAIM from
 * whoever built the PSBT — never trusted blindly. For every output,
 * we re-derive the address OURSELVES at the claimed path and only
 * mark it as recognized change if that independently-derived address
 * matches the output's ACTUAL committed script. A malicious PSBT
 * lying about the path will simply fail to match, and the output
 * correctly shows as external instead. This mirrors the real
 * Coldcard's own change-address verification.
 */

import * as btc from '@scure/btc-signer';
import { SCRIPT_TYPES } from './address-explorer.js';

/** Regtest network parameters for @scure/btc-signer's own address decoding (getOutputAddress). */
const REGTEST_NETWORK = { bech32: 'bcrt', pubKeyHash: 0x6f, scriptHash: 0xc4, wif: 0xef };

/** BIP32's hardened-index offset (0x80000000) — every path index in a PSBT includes this where hardened. */
const HARDENED_OFFSET = 0x80000000;

/** A change path always looks like [purpose', coinType', account', 1, addressIndex] — 5 components, chain=1. */
const CHANGE_PATH_LENGTH = 5;
const CHANGE_CHAIN_POSITION = 3;
const CHANGE_CHAIN_VALUE = 1;

/**
 * BIP48 multisig paths have an extra hardened component vs single-sig
 * (m/48'/coin'/account'/script_type' — 4 components, not 3), so a full
 * multisig change path is 6 elements: [...4 account components, 1, addressIndex].
 */
const MULTISIG_CHANGE_PATH_LENGTH = 6;
const MULTISIG_CHANGE_CHAIN_POSITION = 4;

/**
 * @param {Uint8Array} psbtBytes
 * @returns {InstanceType<typeof btc.Transaction>}
 * @throws if the bytes aren't a well-formed PSBT
 */
export function parsePsbt(psbtBytes) {
  return btc.Transaction.fromPSBT(psbtBytes, { allowLegacyWitnessUtxo: true });
}

/**
 * Builds everything the review screen needs: what's being spent,
 * where it's going, which output (if any) is our own change, and
 * the fee.
 * @param {import('./wallet-engine.js').Wallet} wallet
 * @param {InstanceType<typeof btc.Transaction>} tx
 * @param {import('./multisig-wallet.js').MultisigWallet|null} [multisigWallet] -
 *   pass this device's registered multisig wallet, if any, to review a
 *   multisig PSBT instead of a single-sig one. Change detection then
 *   requires ALL cosigners' derivation entries to agree, not just ours.
 */
export function buildReviewSummary(wallet, tx, multisigWallet = null) {
  const inputs = [];
  for (let i = 0; i < tx.inputsLength; i++) {
    const input = tx.getInput(i);
    inputs.push({ index: i, amountSats: input.witnessUtxo?.amount ?? null });
  }

  const outputs = [];
  for (let i = 0; i < tx.outputsLength; i++) {
    const output = tx.getOutput(i);
    const address = tx.getOutputAddress(i, REGTEST_NETWORK);
    const isChange = multisigWallet
      ? isRecognizedMultisigChange(multisigWallet, output, address)
      : isRecognizedChange(wallet, output, address);
    outputs.push({ index: i, address, amountSats: output.amount, isChange });
  }

  const totalInSats = inputs.reduce((sum, inp) => sum + (inp.amountSats ?? 0n), 0n);
  const totalOutSats = outputs.reduce((sum, out) => sum + out.amountSats, 0n);

  return {
    inputs,
    outputs,
    feeSats: tx.fee,
    totalInSats,
    totalOutSats,
  };
}

/** True only if we can independently re-derive the exact same address the output actually commits to. */
function isRecognizedChange(wallet, output, actualAddress) {
  const derivations = output.bip32Derivation ?? [];

  for (const [, info] of derivations) {
    if (!info) continue;

    const fingerprintHex = info.fingerprint.toString(16).padStart(8, '0');
    if (fingerprintHex !== wallet.fingerprint) continue;

    const indices = info.path;
    if (indices.length !== CHANGE_PATH_LENGTH || indices[CHANGE_CHAIN_POSITION] !== CHANGE_CHAIN_VALUE) continue;

    const purpose = indices[0] - HARDENED_OFFSET;
    const scriptType = SCRIPT_TYPES.find((s) => Number.parseInt(s.purpose, 10) === purpose);
    if (!scriptType) continue; // not one of the 3 script types this wallet derives

    const claimedPubKeyHash = wallet.derivePubKeyHashFromIndices(indices);
    const claimedAddress = scriptType.encode(claimedPubKeyHash);
    if (claimedAddress === actualAddress) return true;
  }

  return false;
}

/**
 * Multisig version of the same check: recognized as OUR change only
 * if EVERY cosigner in the registered wallet has a matching
 * derivation entry, all claiming the SAME chain/index — and the
 * resulting sortedMultisig() address, built the exact same way both
 * devices would build it independently, matches the output's actual
 * script. A PSBT that only includes some cosigners' entries, or gives
 * inconsistent paths across them, is correctly rejected.
 */
function isRecognizedMultisigChange(multisigWallet, output, actualAddress) {
  const derivations = output.bip32Derivation ?? [];
  if (derivations.length < multisigWallet.n) return false;

  let claimedChain = null;
  let claimedIndex = null;
  const matchedFingerprints = new Set();

  for (const [, info] of derivations) {
    if (!info) continue;

    const fingerprintHex = info.fingerprint.toString(16).padStart(8, '0');
    const isKnownCosigner = multisigWallet.cosigners.some((c) => c.fingerprint === fingerprintHex);
    if (!isKnownCosigner) continue;

    const indices = info.path;
    if (indices.length !== MULTISIG_CHANGE_PATH_LENGTH || indices[MULTISIG_CHANGE_CHAIN_POSITION] !== CHANGE_CHAIN_VALUE) continue;

    const [thisChain, thisIndex] = [indices[MULTISIG_CHANGE_PATH_LENGTH - 2], indices[MULTISIG_CHANGE_PATH_LENGTH - 1]];
    if (claimedChain === null) {
      claimedChain = thisChain;
      claimedIndex = thisIndex;
    } else if (claimedChain !== thisChain || claimedIndex !== thisIndex) {
      return false; // cosigners disagree on the path — never trust an inconsistent claim
    }

    matchedFingerprints.add(fingerprintHex);
  }

  if (matchedFingerprints.size !== multisigWallet.n) return false; // not every cosigner accounted for

  const { address: claimedAddress } = multisigWallet.deriveAddress(claimedChain, claimedIndex);
  return claimedAddress === actualAddress;
}

/**
 * Signs every input whose bip32Derivation claims a path under this
 * wallet's fingerprint. Works identically for single-sig and
 * multisig inputs — a multisig input simply has one derivation entry
 * per cosigner, and this only ever matches (and signs with) our own.
 * @param {import('./wallet-engine.js').Wallet} wallet
 * @param {InstanceType<typeof btc.Transaction>} tx
 * @returns {number} how many inputs were actually signed
 */
export function signRecognizedInputs(wallet, tx) {
  let signedCount = 0;

  for (let i = 0; i < tx.inputsLength; i++) {
    const input = tx.getInput(i);
    const derivations = input.bip32Derivation ?? [];

    for (const [, info] of derivations) {
      if (!info) continue;
      const fingerprintHex = info.fingerprint.toString(16).padStart(8, '0');
      if (fingerprintHex !== wallet.fingerprint) continue;

      const privateKey = wallet.derivePrivateKeyFromIndices(info.path);
      tx.signIdx(privateKey, i);
      signedCount += 1;
      break; // one matching key is enough per input, even for multisig — we only ever hold one of the cosigner keys
    }
  }

  return signedCount;
}

/**
 * Attempts to finalize and extract the final, broadcastable
 * transaction. For a multisig input that doesn't have enough
 * signatures YET, @scure/btc-signer's finalize() throws — that's
 * EXPECTED here, not an error: it just means another cosigner still
 * needs to sign. The caller checks `isFinal`; when false, `psbtBytes`
 * is the same PSBT with this device's new partial signature already
 * embedded, ready to hand to the next signer.
 * @param {InstanceType<typeof btc.Transaction>} tx
 * @returns {{isFinal: true, bytes: Uint8Array} | {isFinal: false, psbtBytes: Uint8Array}}
 */
export function finalizeOrExportPartial(tx) {
  try {
    tx.finalize();
    return { isFinal: true, bytes: tx.extract() };
  } catch (err) {
    return { isFinal: false, psbtBytes: tx.toPSBT() };
  }
}

/**
 * Real Coldcard convention: the signed result is saved as a NEW file,
 * never overwriting the original — "-signed" inserted before the
 * extension (unsigned.psbt -> unsigned-signed.psbt). Used whether the
 * result is fully final or still a partially-signed PSBT for the next
 * cosigner — this simulator hasn't found documentation distinguishing
 * the two cases by filename, so the same convention is applied to both.
 * @param {string} originalFilename
 * @returns {string}
 */
export function signedFilename(originalFilename) {
  const dotIndex = originalFilename.lastIndexOf('.');
  if (dotIndex === -1) return `${originalFilename}-signed`;
  return `${originalFilename.slice(0, dotIndex)}-signed${originalFilename.slice(dotIndex)}`;
}
