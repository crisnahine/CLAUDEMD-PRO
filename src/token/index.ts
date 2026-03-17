/**
 * Token Counter
 *
 * Provides accurate token counting using tiktoken's cl100k_base encoding.
 * Falls back to chars/4 estimate if tiktoken fails to load.
 */

let encoder: { encode: (text: string) => Uint32Array; free: () => void } | null = null;
let initAttempted = false;

async function getEncoder() {
  if (encoder) return encoder;
  if (initAttempted) return null;
  initAttempted = true;

  try {
    const tiktoken = await import("tiktoken");
    encoder = tiktoken.get_encoding("cl100k_base");
    return encoder;
  } catch {
    // tiktoken not available — fall back to estimate
    return null;
  }
}

/**
 * Count tokens accurately using tiktoken, with chars/4 fallback.
 */
export async function countTokens(text: string): Promise<number> {
  const enc = await getEncoder();
  if (enc) {
    return enc.encode(text).length;
  }
  return estimateTokens(text);
}

/**
 * Synchronous token estimate (chars/4 approximation).
 * Use countTokens() when accuracy matters.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Clean up tiktoken encoder (call on process exit).
 */
export function freeEncoder(): void {
  if (encoder) {
    encoder.free();
    encoder = null;
  }
}
