/**
 * core/address-explorer.js
 * ------------------------------------------------------------
 * Derives a single-sig receive/change address at any index, for any
 * of the 3 script types this simulator supports — the logic behind
 * the "Address Explorer" menu item.
 *
 * Pure logic, no DOM, no state — device-state.js owns which type,
 * chain (receive/change), and index are currently selected; this
 * module just answers "what's the address for THIS combination".
 */

import { encodeP2PKH, encodeP2SHP2WPKH, encodeP2WPKH } from './address-encoder.js';

const COIN_TYPE = "1'"; // testnet/regtest, matches every path this project derives
const ACCOUNT = 0; // this simulator only offers account 0 — no account-switching UI yet

/**
 * The 3 single-sig script types, in the order the real Coldcard's
 * Address Explorer presents them. `purpose` is the BIP32 purpose
 * field (44/49/84); `encode` turns a pubKeyHash into that type's
 * address string (see core/address-encoder.js).
 */
export const SCRIPT_TYPES = [
  { id: 'legacy', label: 'Legacy', purpose: "44'", encode: encodeP2PKH },
  { id: 'nested-segwit', label: 'Nested Segwit', purpose: "49'", encode: encodeP2SHP2WPKH },
  { id: 'native-segwit', label: 'Native Segwit', purpose: "84'", encode: encodeP2WPKH },
];

function accountPath(purpose) {
  return `m/${purpose}/${COIN_TYPE}/${ACCOUNT}'`;
}

/**
 * @param {import('./wallet-engine.js').Wallet} wallet
 * @param {string} scriptTypeId - one of SCRIPT_TYPES[].id
 * @param {0|1} chain - 0 = receive (external), 1 = change (internal)
 * @param {number} index - address index within that chain
 * @returns {{ address: string, path: string }}
 */
export function deriveAddress(wallet, scriptTypeId, chain, index) {
  const scriptType = SCRIPT_TYPES.find((s) => s.id === scriptTypeId);
  const path = `${accountPath(scriptType.purpose)}/${chain}/${index}`;
  const pubKeyHash = wallet.derivePubKeyHash(path);
  return { address: scriptType.encode(pubKeyHash), path };
}
