import { describe, it, expect, vi } from 'vitest';
import { ApiError, handleError } from './errors.js';

describe('ApiError', () => {
  it('constructs with correct properties', () => {
    const err = new ApiError(404, 'NOT_FOUND', 'Resource not found');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Resource not found');
    expect(err.name).toBe('ApiError');
  });

  it('is instanceof Error', () => {
    expect(new ApiError(400, 'BAD', 'bad')).toBeInstanceOf(Error);
  });
});

describe('handleError', () => {
  it('returns structured response for ApiError', () => {
    const err = new ApiError(422, 'VALIDATION', 'Invalid input');
    const result = handleError(err);
    expect(result).toEqual({
      statusCode: 422,
      body: { error: 'Invalid input', code: 'VALIDATION' },
    });
  });

  it('returns 500 for unknown errors', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = handleError(new Error('unexpected'));
    expect(result.statusCode).toBe(500);
    expect(result.body.code).toBe('INTERNAL_ERROR');
  });

  it('logs unknown errors to console', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    handleError('some string error');
    expect(spy).toHaveBeenCalledWith('Unhandled error:', 'some string error');
    spy.mockRestore();
  });
});
