import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/app-error';
import { config } from '../config';
import { ApiResponse } from '../types';

export function notFoundHandler(req: Request, res: Response) {
  const response: ApiResponse = {
    success: false,
    error: `Route ${req.method} ${req.originalUrl} not found`,
  };
  res.status(404).json(response);
}

export function globalErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  // AppError — our own errors
  if (err instanceof AppError) {
    const response: ApiResponse = {
      success: false,
      error: err.message,
    };
    return res.status(err.statusCode).json(response);
  }

  // Zod validation error
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of err.issues) {
      const path = issue.path.join('.');
      fieldErrors[path] = issue.message;
    }
    
    // Log validation error details to a local file for debugging
    try {
      const fs = require('fs');
      const path = require('path');
      const logPath = path.join(__dirname, '../../zod_validation_error.log');
      const logContent = JSON.stringify({
        timestamp: new Date().toISOString(),
        url: req.originalUrl,
        method: req.method,
        body: req.body,
        errors: fieldErrors,
      }, null, 2) + '\n';
      fs.writeFileSync(logPath, logContent, 'utf8');
      console.error('[ZodError Logging] Wrote validation error to zod_validation_error.log');
    } catch (logErr) {
      console.error('[ZodError Logging] Failed to write log:', logErr);
    }

    const response: ApiResponse = {
      success: false,
      error: 'Validation error',
      errors: fieldErrors,
    };
    return res.status(422).json(response);
  }

  // JSON parse error
  if (err instanceof SyntaxError && 'body' in err) {
    const response: ApiResponse = {
      success: false,
      error: 'Invalid JSON in request body',
    };
    return res.status(400).json(response);
  }

  // Unknown errors
  console.error('[UNHANDLED ERROR]', err);
  const response: ApiResponse = {
    success: false,
    error: 'Internal server error',
    ...(config.isProduction ? {} : { message: err.message }),
  };
  return res.status(500).json(response);
}
