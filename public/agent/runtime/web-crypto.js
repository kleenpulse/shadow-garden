// Web Crypto conveniences with dependency-free fallbacks for plain-HTTP static
// demos. HTTPS still uses the browser's native primitives.
let fallbackSequence = 0;

export function randomUuid(cryptoImpl = globalThis.crypto) {
  if (typeof cryptoImpl?.randomUUID === "function") return cryptoImpl.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof cryptoImpl?.getRandomValues === "function") cryptoImpl.getRandomValues(bytes);
  else {
    // A request ID is a replay/trace nonce, not a credential.
    const stamp = Date.now() + (++fallbackSequence);
    for (let i = 0; i < bytes.length; i++) bytes[i] = ((Math.random() * 256) ^ (stamp >>> ((i % 6) * 8))) & 255;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function fallbackSha256(bytes) {
  const constants = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ];
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes); padded[bytes.length] = 0x80;
  const bitLength = BigInt(bytes.length) * 8n;
  for (let i = 0; i < 8; i++) padded[paddedLength - 1 - i] = Number((bitLength >> BigInt(i * 8)) & 255n);
  const hash = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const words = new Uint32Array(64);
  const rotate = (value, amount) => (value >>> amount) | (value << (32 - amount));
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const base = offset + i * 4;
      words[i] = (padded[base] << 24) | (padded[base + 1] << 16) | (padded[base + 2] << 8) | padded[base + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotate(words[i - 15], 7) ^ rotate(words[i - 15], 18) ^ (words[i - 15] >>> 3);
      const s1 = rotate(words[i - 2], 17) ^ rotate(words[i - 2], 19) ^ (words[i - 2] >>> 10);
      words[i] = (words[i - 16] + s0 + words[i - 7] + s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = hash;
    for (let i = 0; i < 64; i++) {
      const s1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25);
      const t1 = (h + s1 + ((e & f) ^ (~e & g)) + constants[i] + words[i]) >>> 0;
      const s0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22);
      const t2 = (s0 + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
    }
    for (const [i,value] of [a,b,c,d,e,f,g,h].entries()) hash[i] = (hash[i] + value) >>> 0;
  }
  return [...hash].map(value => value.toString(16).padStart(8, "0")).join("");
}

export async function sha256Hex(value, cryptoImpl = globalThis.crypto) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  if (typeof cryptoImpl?.subtle?.digest === "function") {
    const digest = await cryptoImpl.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  }
  return fallbackSha256(bytes);
}
