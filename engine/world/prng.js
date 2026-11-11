// A tiny deterministic PRNG shared by terrain generation and its audit.
// Kept free of three so terrain logic runs outside the browser (tests,
// audits, tools). textures.js re-exports this; do not fork the algorithm.
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
