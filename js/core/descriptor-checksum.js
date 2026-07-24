/**
 * core/descriptor-checksum.js
 * ------------------------------------------------------------
 * BIP-380 descriptor checksum — the 8-character `#xxxxxxxx` suffix
 * that Bitcoin Core, Sparrow, and Coldcard all append to output
 * descriptors. Ported directly from the reference Python in the
 * BIP-380 spec (bitcoin/bips/blob/master/bip-0380.mediawiki), not
 * reconstructed from memory — an off-by-one here produces a
 * descriptor Sparrow will silently refuse to import.
 *
 * IMPLEMENTATION NOTE: the reference algorithm operates on 35-40 bit
 * integers (`chk >> 35`, `chk & 0x7ffffffff`). JavaScript's native
 * bitwise operators (`>>`, `&`, `<<`, `^`) only work correctly on
 * 32-bit signed integers — translating the Python line-for-line with
 * those would silently truncate values and produce a WRONG (but
 * syntactically valid-looking) checksum. This uses BigInt throughout
 * instead, which supports arbitrary-precision bitwise operations,
 * matching Python's arbitrary-precision integers exactly.
 */

const INPUT_CHARSET =
  "0123456789()[],'/*abcdefgh@:$%{}IJKLMNOPQRSTUVWXYZ&+-.;<=>?!^_|~ijklmnopqrstuvwxyzABCDEFGH`#\"\\ ";
const CHECKSUM_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GENERATOR = [0xf5dee51989n, 0xa9fdca3312n, 0x1bab10e32dn, 0x3706b1677an, 0x644d626ffdn];

/** Direct port of descsum_polymod() from the BIP-380 reference. */
function descsumPolymod(symbols) {
  let chk = 1n;
  for (const value of symbols) {
    const top = chk >> 35n;
    chk = ((chk & 0x7ffffffffn) << 5n) ^ BigInt(value);
    for (let i = 0; i < 5; i++) {
      if ((top >> BigInt(i)) & 1n) {
        chk ^= GENERATOR[i];
      }
    }
  }
  return chk;
}

/** Direct port of descsum_expand() — character-to-symbol expansion. */
function descsumExpand(descriptor) {
  const groups = [];
  const symbols = [];
  for (const c of descriptor) {
    const v = INPUT_CHARSET.indexOf(c);
    if (v === -1) return null; // character outside the descriptor charset
    symbols.push(v & 31);
    groups.push(v >> 5);
    if (groups.length === 3) {
      symbols.push(groups[0] * 9 + groups[1] * 3 + groups[2]);
      groups.length = 0;
    }
  }
  if (groups.length === 1) {
    symbols.push(groups[0]);
  } else if (groups.length === 2) {
    symbols.push(groups[0] * 3 + groups[1]);
  }
  return symbols;
}

/**
 * Appends a BIP-380 checksum to a descriptor that doesn't have one yet.
 * @param {string} descriptor - a descriptor WITHOUT a trailing '#...' checksum
 * @returns {string} `${descriptor}#${8-character checksum}`
 * @throws if the descriptor contains a character outside the BIP-380 charset
 */
export function addChecksum(descriptor) {
  const symbols = descsumExpand(descriptor);
  if (symbols === null) {
    throw new Error(`Descriptor contains a character outside the BIP-380 charset: ${descriptor}`);
  }

  const checksum = descsumPolymod([...symbols, 0, 0, 0, 0, 0, 0, 0, 0]) ^ 1n;

  let result = '';
  for (let i = 0; i < 8; i++) {
    const shift = 5n * BigInt(7 - i);
    const index = Number((checksum >> shift) & 31n);
    result += CHECKSUM_CHARSET[index];
  }
  return `${descriptor}#${result}`;
}
