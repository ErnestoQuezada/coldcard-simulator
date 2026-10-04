# Coldcard Web Simulator

**A Coldcard Mk5 hardware wallet, running entirely in your browser.**
No install. No hardware. No servers. Just you, your keyboard, and a
BIP39 seed that never leaves the tab.

```
          ╭─────────────────────────╮
          │  CC                 Mk5 │
          │ ┌─────────────────────┐ │
          │ │                     │ │
          │ │      Coldcard       │ │
          │ │       Wallet        │ │
          │ │                     │ │
          │ └─────────────────────┘ │
          │                         │
          │   [1]     [2]     [3]   │
          │                         │
          │   [4]     [5]     [6]   │
          │                         │
          │   [7]     [8]     [9]   │
          │                         │
          │   [x]     [0]     [✓]   │
          │                         │
          ╰─────────────────────────╯
       SIMULATOR · NOT A REAL DEVICE
```

## What even is this?

It's a pixel-for-pixel(ish), keypad-and-all simulator of a real
Coldcard — generate a seed, save it locally, add a passphrase, export to Sparrow,
sign a PSBT, and even build a full 2-of-2 multisig wallet across
**two simulated devices in the same browser tab.** All of it running
on the same math, the same derivation paths, and the same file
formats the real hardware uses.

Why? Because buying a hardware wallet just to _learn_ how self-custody
works is a weird ask. This lets you practice the whole ritual —
seed words, passphrases, PSBTs, multisig ceremonies — for free,
on regtest, with zero risk, before you ever touch real sats.

** Heads up:** this is a simulator. It is not, and will never try to
be, a real security device. Never type a seed phrase you actually
care about into this (or any) website. Regtest coins only, always.

## See it in action

- [Part 1 — building a wallet, passphrases, and Sparrow export](https://rumble.com/v7d6ll2-colcard-mk5-web-simulator-01.html)
- [Part 2 — signing PSBTs and a full multisig ceremony](https://rumble.com/v7d6ln6-coldcard-mk5-web-simulator-02.html)

## About the real Coldcard

**[Coinkite](https://coinkite.com)** designs and builds the actual
Coldcard hardware wallet — this project is just a fan-built,
unofficial simulator of it, made for learning. Coinkite owns the
Coldcard name, design, and firmware; none of that belongs to this
project. Go buy a real one from them when you're ready to hold real
money — in my opinion, it's the best hardware wallet out there for
anyone serious about Bitcoin self-custody. This simulator exists to
get more people ready for that day, not to replace it.

## What it can actually do

**The device itself**

- A chunky, glowing, satisfyingly clicky on-screen keypad — works with
  your mouse _or_ your actual keyboard
- 6 colorways because why not (orange, green, blue, purple, pink, graphite)
- Run **1 or 2 devices side by side** in the same window — the whole
  point is testing multisig without owning two Coldcards

**Wallets & seeds**

- Real entropy (`crypto.getRandomValues`, the correct way, every time)
- Generate a new 12-word seed, complete with the "did you actually
  write it down" quiz
- Import an existing seed, word by word, off the real BIP39 wordlist
- Add a BIP39 passphrase and watch it become a _completely different_
  wallet — same words, different universe
- Save, load, and delete simulator wallets in this browser's local
  storage through the **Wallet Storage** menu. This stores the mnemonic
  and passphrase needed to recreate the wallet; never use a real seed here.
- Register multisig policies from **Settings > Multisig Wallets > Import
  from SD**. Policies are stored separately from seed wallets, so a
  singlesig wallet and a multisig policy can coexist even when they use
  the same master fingerprint, matching Coldcard's wallet-policy model.

**Talking to the outside world**

- Export your wallet as `coldcard-export.json` — drop it straight
  into Sparrow, no fiddling
- Browse your receive & change addresses (Legacy, Nested Segwit,
  Native Segwit), with the "does this match what your other wallet
  showed you" safety check the real device does

**Signing money-moving things**

- Upload a real PSBT from Sparrow, review exactly what it's asking you
  to sign (inputs, outputs, fee, and which output is _your own change_),
  then sign it and download the result
- **Full multisig, 2-of-2, done the real way**: export each device's
  XPUB, combine them into one wallet, register that wallet on _both_
  devices, then pass a PSBT back and forth between them until it's
  fully signed. No shortcuts, even though technically we could've
  cheated since both devices live in the same tab.

## Not just a toy — actual security lessons baked in

A few things this project takes seriously, the same way the real
device does:

- **Never trust a PSBT's claims.** When deciding "is this output my
  own change," the simulator doesn't just believe the file — it
  independently re-derives the address itself and checks it matches.
  A PSBT that lies about a change address gets caught, every time
  (there's a test for exactly this).
- **The "is my key actually in here" check.** Back in 2021, real
  Coldcard firmware had a bug where it would register a multisig
  wallet without checking its own key was genuinely one of the
  cosigners — a malicious file could swap in the wrong keys and the
  device wouldn't notice. This simulator replicates the fix: it
  refuses to register a config unless its own xpub is really in there.
- **Descriptor checksums, done right.** BIP-380 checksums need 35–40
  bit integer math, which JavaScript's normal number operations quietly
  break. This uses `BigInt` specifically so that never happens.
- **Address encoding verified against the real world**, not just
  self-consistency — one of the test addresses in this repo was
  actually generated by `bitcoin-cli -regtest getnewaddress` and
  reproduced byte-for-byte.

Not bad for a browser toy.

## Running the Browser Version

The core simulator is plain HTML/CSS/JS with ES modules and locally vendored crypto libraries.
While no build step is strictly required to run it in a browser, we now use `npm` to manage the local development server and Tauri desktop builds.

```bash
# Install development dependencies
npm install

# Start the local web server
npm run dev
# Then open http://localhost:8000
```

Alternatively, you can still serve the project over HTTP with XAMPP or a PHP server:
```bash
php -S localhost:8000
```

Saved wallets stay in the browser profile's local storage and are not shared through the web server.

## Desktop / Tauri Version

This project includes a native desktop application powered by [Tauri 2](https://v2.tauri.app). The desktop version reuses the exact same frontend and core logic as the browser simulator but provides a better OS-level experience (native windows, native file open/save dialogs, offline access).

### Architectural Decisions

- **Shared Core Logic**: The simulator runs exactly the same JavaScript in both the browser and Tauri. There is no separate implementation.
- **Native I/O Abstraction**: The `js/io/file-io.js` module automatically detects whether it's running inside Tauri (`window.__TAURI__`). If present, it uses Tauri's native file dialog and filesystem APIs for a seamless desktop experience. If absent, it gracefully falls back to browser-compatible mechanisms (`<input type="file">` and HTML5 `<a download>`).
- **Security**: The Tauri application is tightly locked down. It requests only the minimal permissions required (dialog and scoped filesystem access for user-selected files). It does not have broad, unrestricted disk access, and it makes no external network requests.
- **Persistence**: Wallet state is stored using standard `localStorage`, which Tauri isolates perfectly per-app just as a browser does per-origin.

### Development Requirements

To build and run the desktop application, you need the standard Tauri prerequisites installed on your system:
- [Node.js](https://nodejs.org)
- [Rust](https://www.rust-lang.org/)
- OS-specific build tools (C++ build tools on Windows, Xcode on macOS, or `build-essential`/webkit2gtk on Linux).

### Running the Desktop Version

```bash
# Install node dependencies if you haven't already
npm install

# Launch the Tauri desktop app in development mode
npm run tauri dev
```

### Production Builds

To create a standalone, distributable desktop binary:

```bash
npm run tauri build
```

The resulting artifacts are located in `src-tauri/target/release/bundle/`. 
Supported platforms include **Windows, macOS, and Linux**. 
Cross-compilation is generally not supported; you must run the build command on the specific OS you want to target.

### Portable Windows Build

For Windows users, the executable generated at `src-tauri/target/release/coldcard-web-simulator.exe` can be used as a fully portable application without requiring installation. It keeps user data isolated (using standard AppData paths), does not rely on source files, and can be easily copied to other machines. Installer bundles are also generated in the `bundle/` directory.

## How it's organized

Built to be readable by a stranger (or by future-you in three
months) — every module has one job:

```
coldcard-web-simulator/
├── index.html              # entry point + import map for the vendored crypto libs
├── vendor/                  # @scure/@noble crypto libs, vendored locally — zero CDN, works fully offline
├── css/                      # chassis, keypad, screen, themes — all split by concern
└── js/
    ├── main.js               # bootstraps everything
    ├── config/                # menu labels, color themes
    ├── core/                  # all the actual logic — zero DOM, fully testable
    │   ├── device-state.js       # the big one: every screen/flow as a state machine
    │   ├── wallet-engine.js      # mnemonic → seed → keys
    │   ├── word-picker.js        # the "scroll the wordlist" mechanic
    │   ├── seed-quiz.js          # "did you actually write it down"
    │   ├── address-encoder.js    # P2PKH / P2SH-P2WPKH / P2WPKH, regtest
    │   ├── address-explorer.js   # receive/change address browsing
    │   ├── descriptor-checksum.js  # BIP-380, via BigInt
    │   ├── wallet-export.js        # the Sparrow-compatible JSON export
    │   ├── psbt-signer.js          # parse, review, sign, finalize
    │   └── multisig-wallet.js      # the whole 2-of-2 ceremony
    ├── io/
    │   └── file-io.js         # the ONE place that's allowed to touch the DOM for files
    └── ui/                    # canvas rendering, keypad input, theme picker
```

## Built with

Everything crypto-related comes from the `@scure`/`@noble` family
(Paul Miller's audited, no-WASM, no-CDN-needed libraries) — same
ecosystem end to end, nothing mixed in from elsewhere:

- `@scure/bip39` / `@scure/bip32` — seeds and keys
- `@scure/base` — base58/bech32 address encoding
- `@scure/btc-signer` — PSBT parsing, signing, multisig
- `@noble/hashes` / `@noble/curves` — the actual hashing and secp256k1 math

All vendored straight into the repo — no CDN, works offline, and
you can read every line of crypto code this thing runs.

## Roadmap

- [ ] QR codes for Address Explorer (the whole point of that screen
      on a real device — scan and receive)
- [ ] The `first` address field in the wallet export
- [ ] P2SH-wrapped multisig, quorums beyond 2-of-2, if anyone needs them
- [ ] BIP85
- [ ] A completely unnecessary easter-egg mini-game, kept far away
      from anything Bitcoin-related

## License

MIT — see [`LICENSE`](./LICENSE). Fork it, learn from it, build on
it, teach with it.

## One more time, because it matters

This is a fan project, not an official Coinkite product, and not
affiliated with Coinkite. All credit for the actual Coldcard design
goes to them. If this simulator helped you understand self-custody
a little better, the best next step is to go get a real one.

If you found it util, share some sats!
https://geyser.fund/project/nodenation

Kids deserve fun!
