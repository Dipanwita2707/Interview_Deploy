export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static badRequest(message = 'Bad request') {
    return new AppError(message, 400);
  }

  static unauthorized(message = 'Unauthorized') {
    return new AppError(message, 401);
  }

  static forbidden(message = 'Forbidden') {
    return new AppError(message, 403);
  }

  static notFound(resource = 'Resource') {
    return new AppError(`${resource} not found`, 404);
  }

  static conflict(message = 'Conflict') {
    return new AppError(message, 409);
  }

  static validationError(message = 'Validation error') {
    return new AppError(message, 422);
  }

  static internal(message = 'Internal server error') {
    return new AppError(message, 500, false);
  }
}
