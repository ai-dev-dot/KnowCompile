/**
 * Shared vector/similarity utilities.
 * Used by compile-service and qa-service.
 */

/** Convert LanceDB L2 distance to cosine similarity for normalized vectors. */
export function distanceToSimilarity(distance: number): number {
  return Math.max(0, 1 - (distance * distance) / 2)
}
