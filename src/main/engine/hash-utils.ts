/**
 * Common hash utility functions shared by pHash, dHash, and other
 * HashAlgorithm implementations that use 64-bit hex hashes.
 */

/** Count set bits in a 4-bit value (0-15). */
function popcount4(n: number): number {
  let count = 0
  let val = n
  while (val) {
    count += val & 1
    val >>= 1
  }
  return count
}

/**
 * Compute Hamming distance between two hex hash strings.
 * XOR each corresponding nibble and count set bits.
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) {
    throw new Error(
      `Hash length mismatch: ${hash1.length} vs ${hash2.length}`,
    )
  }

  let distance = 0
  for (let i = 0; i < hash1.length; i++) {
    const xor = parseInt(hash1[i], 16) ^ parseInt(hash2[i], 16)
    distance += popcount4(xor)
  }

  return distance
}
