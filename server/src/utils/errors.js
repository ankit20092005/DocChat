export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const missing = (name) => new ApiError(404, "NOT_FOUND", name + " not found.");
export const unauthorized = () => new ApiError(401, "UNAUTHORIZED", "A valid bearer token is required.");
export const upstreamError = () => new ApiError(502, "AI_UNAVAILABLE", "The AI service could not complete the request.");
export const tooLarge = () => new ApiError(413, "FILE_TOO_LARGE", "Choose a PDF of 50 MiB or less.");
