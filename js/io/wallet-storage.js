/**
 * Browser-local wallet persistence.
 *
 * Mnemonics and BIP39 passphrases are stored in this browser's local storage
 * so saved simulator wallets are not shared through the web server. This is
 * learning software, not a secure vault; never store a valuable seed here.
 */

import { Wallet } from "../core/wallet-engine.js";

const WALLET_STORAGE_KEY = "coldcard-simulator-wallets-v1";
const MULTISIG_STORAGE_KEY = "coldcard-simulator-multisig-wallets-v1";

function readRecords(storageKey) {
  const serialized = localStorage.getItem(storageKey);
  if (serialized === null) return [];

  const records = JSON.parse(serialized);
  if (!Array.isArray(records)) {
    throw new Error("Saved wallet data is not in a valid format.");
  }
  return records;
}

function writeRecords(storageKey, records) {
  localStorage.setItem(storageKey, JSON.stringify(records));
}

function newestFirst(records) {
  return records.sort((left, right) =>
    right.updated_at.localeCompare(left.updated_at),
  );
}

/** @param {import('../core/wallet-engine.js').Wallet} wallet */
export async function saveWallet(wallet) {
  const wallets = readRecords(WALLET_STORAGE_KEY);
  const fingerprint = wallet.fingerprint.toLowerCase();
  const existing = wallets.find((record) => record.fingerprint === fingerprint);
  const now = new Date().toISOString();
  const record = {
    id: fingerprint,
    mnemonic: wallet.mnemonic,
    passphrase: wallet.passphrase || "",
    fingerprint,
    created_at: existing?.created_at || now,
    updated_at: now,
  };

  writeRecords(WALLET_STORAGE_KEY, [
    record,
    ...wallets.filter((item) => item.fingerprint !== fingerprint),
  ]);
  return { fingerprint };
}

export async function listWallets() {
  return newestFirst(readRecords(WALLET_STORAGE_KEY));
}

/** @param {{ mnemonic: string, passphrase: string }} record */
export async function loadWallet(record) {
  return new Wallet(record.mnemonic, record.passphrase || "");
}

/** @param {string|number} id */
export async function deleteWallet(id) {
  const wallets = readRecords(WALLET_STORAGE_KEY);
  const remaining = wallets.filter(
    (record) => String(record.id) !== String(id),
  );
  writeRecords(WALLET_STORAGE_KEY, remaining);
  return { deleted: remaining.length < wallets.length };
}

/** @param {import('../core/multisig-wallet.js').MultisigWallet} multisigWallet */
export async function saveMultisigWallet(multisigWallet) {
  const name = String(multisigWallet.name || "").trim();
  const m = Number(multisigWallet.m);
  const cosigners = multisigWallet.cosigners
    .map((cosigner) => ({
      fingerprint: String(cosigner.fingerprint || "").toLowerCase(),
      xpub: String(cosigner.xpub || "").trim(),
    }))
    .sort(
      (left, right) =>
        left.fingerprint.localeCompare(right.fingerprint) ||
        left.xpub.localeCompare(right.xpub),
    );

  if (
    !name ||
    !Number.isInteger(m) ||
    cosigners.length < 2 ||
    cosigners.some(
      (cosigner) =>
        !/^[0-9a-f]{8}$/.test(cosigner.fingerprint) || !cosigner.xpub,
    )
  ) {
    throw new Error("Invalid multisig wallet policy.");
  }

  const walletKey = JSON.stringify([name, m, cosigners]);
  const wallets = readRecords(MULTISIG_STORAGE_KEY);
  const existing = wallets.find((record) => record.walletKey === walletKey);
  const now = new Date().toISOString();
  const record = {
    id: walletKey,
    walletKey,
    name,
    m,
    cosigners,
    created_at: existing?.created_at || now,
    updated_at: now,
  };

  writeRecords(MULTISIG_STORAGE_KEY, [
    record,
    ...wallets.filter((item) => item.walletKey !== walletKey),
  ]);
  return { walletKey };
}

export async function listMultisigWallets() {
  return newestFirst(readRecords(MULTISIG_STORAGE_KEY));
}

/** @param {{ name: string, m: number, cosigners: object[] }} record */
export async function loadMultisigWallet(record) {
  const { MultisigWallet } = await import("../core/multisig-wallet.js");
  return new MultisigWallet({
    name: record.name,
    m: Number(record.m),
    cosigners: record.cosigners,
  });
}
