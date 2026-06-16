import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { AppError } from '../utils/app-error';

export function validate(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      // Let the global error handler format the ZodError
      throw result.error;
    }
    // Replace with parsed (cleaned) data
    (req as any)[source] = result.data;
    next();
  };
}
