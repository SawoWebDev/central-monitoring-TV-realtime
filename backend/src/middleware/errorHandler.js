import { HttpError } from '../utils/httpError.js';

// Any URL we don't have.
export function notFound(req, res) {
  res.status(404).json({ success: false, message: 'Route not found' });
}

// Catches every error thrown in a route. Express 5 forwards errors here automatically.
// Expected errors (HttpError) send their own message. Anything else is logged on the server
// and the browser only gets a generic message: no stack traces, no internal details.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ success: false, message: err.message });
  }
  console.error(`[error] ${req.method} ${req.originalUrl}:`, err.stack || err.message);
  res.status(500).json({ success: false, message: 'Something went wrong on the server' });
}
