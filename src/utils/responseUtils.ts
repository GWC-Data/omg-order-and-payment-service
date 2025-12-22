import { Response } from 'express';

export function sendSuccessResponse<T extends object>(
  res: Response,
  statusCode: number,
  message: string,
  data: T
): void {
  res.status(statusCode).json({
    success: true,
    message,
    data
  });
}

export function sendErrorResponse(
  res: Response,
  statusCode: number,
  message: string,
  error?: unknown
): void {
  res.status(statusCode).json({
    success: false,
    message,
    error
  });
}


