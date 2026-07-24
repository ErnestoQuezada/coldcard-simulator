# Vendored dependencies

These are the exact `.js` source files (no types, no tests, no build
tooling) from 5 npm packages, copied in locally instead of loaded from
a CDN. Every import in this project is resolved via the import map in
`index.html`, so nothing here needs a bundler.

## Why vendored instead of CDN

This simulator is about self-custody and sovereignty — it shouldn't
depend on a third-party CDN being online, unmodified, and reachable
every time someone opens the page. Vendoring means the whole simulator
works fully offline once it's on your machine.

## What's here and why

| Package             | Version | Used for |
|----------------------|---------|----------|
| `@scure/bip39`        | 2.2.0   | mnemonic generation/validation, mnemonic → seed |
| `@scure/bip32`        | 2.2.0   | seed → master key, BIP32/BIP84 derivation |
| `@scure/base`         | 2.2.0   | base58check + bech32 encoding (dependency of bip32, and used directly for addresses) |
| `@noble/hashes`       | 2.2.0   | sha256/sha512/hmac/pbkdf2/ripemd160 (dependency of bip39 + bip32, used directly for addresses) |
| `@noble/curves`       | 2.2.0   | secp256k1 elliptic-curve math (dependency of bip32 — this is the actual secp256k1 usage: deriving public keys, never entropy) |
| `@scure/btc-signer`   | 2.2.0   | PSBT parsing, signing, finalizing (Ready To Sign) |
| `micro-packed`        | 0.9.0   | binary (de)serialization, dependency of btc-signer |

All 5 are MIT-licensed; each folder keeps its own `LICENSE` file from
the original package.

## How these were obtained

Installed via `npm install @scure/bip39 @scure/bip32` in a scratch
directory (these two pull in the other three as transitive
dependencies), then only the `.js` files were copied here, preserving
each package's internal folder structure exactly. Nothing was edited —
imports between these packages use bare specifiers (e.g.
`@noble/hashes/sha2.js`) exactly as npm published them, which is why
the import map in `index.html` uses prefix mappings
(`"@noble/hashes/": "./vendor/@noble/hashes/"`) rather than listing
every individual file.

## Updating a version later

1. In a scratch directory: `npm install @scure/bip39@<version> @scure/bip32@<version>`
2. Copy the `.js` files (and `LICENSE`) from `node_modules/<pkg>` over
   the matching folder here, keeping the same relative paths.
3. Re-run whatever sanity check script was used when this was first
   vendored (see the wallet-engine module's own comments) to confirm
   nothing in the public API changed.
