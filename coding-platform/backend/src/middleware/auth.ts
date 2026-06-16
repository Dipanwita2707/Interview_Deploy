import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AuthRequest, CodingJwtPayload, CodingRole } from '../types';
import { AppError } from '../utils/app-error';

// ─── Authenticate: Verify coding platform JWT ──────────────────
export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw AppError.unauthorized('Missing or invalid authorization header');
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as CodingJwtPayload;
    req.user = decoded;
    next();
  } catch (err) {
    throw AppError.unauthorized('Invalid or expired token');
  }
}

// ─── Require specific role ─────────────────────────────────────
export function requireRole(...roles: CodingRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw AppError.unauthorized();
    }
    if (!roles.includes(req.user.role)) {
      throw AppError.forbidden(`Access denied. Required role: ${roles.join(' or ')}`);
    }
    next();
  };
}

// ─── Require staff (placement member or head) ──────────────────
export function requireStaff(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    throw AppError.unauthorized();
  }
  if (req.user.role === CodingRole.STUDENT) {
    throw AppError.forbidden('Staff access required');
  }
  next();
}

// ─── Require placement head only ───────────────────────────────
export function requireHead(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    throw AppError.unauthorized();
  }
  if (req.user.role !== CodingRole.PLACEMENT_HEAD) {
    throw AppError.forbidden('Placement Head access required');
  }
  next();
}

// ─── Require student only ──────────────────────────────────────
export function requireStudent(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    throw AppError.unauthorized();
  }
  if (req.user.role !== CodingRole.STUDENT) {
    throw AppError.forbidden('Student access required');
  }
  next();
}
