// Lets async route functions throw errors that reach our error middleware
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next)

// Creates an error with an HTTP status, e.g. throw httpError(404, 'Room not found')
export function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}