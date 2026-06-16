import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

// General API rate limiter
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  message: { success: false, error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Submission rate limiter (stricter)
export const submissionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 submissions per minute
  message: { success: false, error: 'Submission rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false,
});

// SSO exchange rate limiter
export const ssoLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { success: false, error: 'SSO rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false,
});
