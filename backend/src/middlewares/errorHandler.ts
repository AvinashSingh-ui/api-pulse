import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  statusCode: number;
  code?: string;

  constructor(message: string, statusCode = 500, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  const status = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  const code = err.code || (status === 404 ? 'NOT_FOUND' : status === 401 ? 'UNAUTHORIZED' : 'SERVER_ERROR');

  if (process.env.NODE_ENV !== 'production' && status === 500) {
    console.error('[Error]', err);
  }

  res.status(status).json({
    message,
    code,
    status,
  });
};

