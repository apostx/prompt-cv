export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function handleError(error: unknown): { statusCode: number; body: { error: string; code: string } } {
  if (error instanceof ApiError) {
    return { statusCode: error.statusCode, body: { error: error.message, code: error.code } };
  }
  console.error('Unhandled error:', error);
  return { statusCode: 500, body: { error: 'Internal server error', code: 'INTERNAL_ERROR' } };
}
