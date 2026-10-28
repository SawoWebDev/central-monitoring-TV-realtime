// An error that carries an HTTP status code (400 bad input, 404 not found, 503 not ready).
// The errorHandler middleware sends its message to the browser; any other error becomes a generic 500.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
