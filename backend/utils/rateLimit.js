// Returns a function. Call it once per event: it returns false when the limit is exceeded.
export function createLimiter(max, windowMs) {
  let hits = []
  return () => {
    const now = Date.now()
    hits = hits.filter((t) => now - t < windowMs)
    if (hits.length >= max) return false
    hits.push(now)
    return true
  }
}