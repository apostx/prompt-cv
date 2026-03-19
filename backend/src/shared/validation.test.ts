import { describe, it, expect } from 'vitest';
import { googleDocIdSchema, cvGenerateRequestSchema, userSettingsSchema, optimizeRequestSchema, docUpdateRequestSchema } from './validation.js';

describe('googleDocIdSchema', () => {
  it('accepts valid Google Doc ID', () => {
    expect(googleDocIdSchema.safeParse('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms').success).toBe(true);
  });

  it('rejects too short ID', () => {
    expect(googleDocIdSchema.safeParse('abc').success).toBe(false);
  });

  it('rejects invalid characters', () => {
    expect(googleDocIdSchema.safeParse('abc def!@#$%^&*()').success).toBe(false);
  });

  it('accepts IDs with hyphens and underscores', () => {
    expect(googleDocIdSchema.safeParse('abc-def_ghi-123456').success).toBe(true);
  });
});

describe('cvGenerateRequestSchema', () => {
  it('accepts valid request', () => {
    const result = cvGenerateRequestSchema.safeParse({
      templateDocId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms',
      data: { header: { name: 'John' } },
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing templateDocId', () => {
    expect(cvGenerateRequestSchema.safeParse({ data: {} }).success).toBe(false);
  });

  it('rejects missing data', () => {
    expect(cvGenerateRequestSchema.safeParse({ templateDocId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms' }).success).toBe(false);
  });
});

describe('userSettingsSchema', () => {
  it('accepts all optional fields', () => {
    expect(userSettingsSchema.safeParse({}).success).toBe(true);
  });

  it('accepts empty string for doc IDs (clears setting)', () => {
    expect(userSettingsSchema.safeParse({ contextDocId: '' }).success).toBe(true);
  });

  it('accepts valid doc IDs', () => {
    const result = userSettingsSchema.safeParse({
      folderPath: 'cv/generated',
      contextDocId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid doc ID format', () => {
    expect(userSettingsSchema.safeParse({ contextDocId: 'not valid!' }).success).toBe(false);
  });
});

describe('optimizeRequestSchema', () => {
  it('accepts valid request with defaults', () => {
    const result = optimizeRequestSchema.safeParse({
      documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms',
    });
    expect(result.success).toBe(true);
  });

  it('rejects targetPages out of range', () => {
    expect(optimizeRequestSchema.safeParse({
      documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms',
      targetPages: 0,
    }).success).toBe(false);
  });

  it('rejects minMargin below 0.3', () => {
    expect(optimizeRequestSchema.safeParse({
      documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms',
      minMargin: 0.1,
    }).success).toBe(false);
  });
});

describe('docUpdateRequestSchema', () => {
  it('accepts valid content', () => {
    expect(docUpdateRequestSchema.safeParse({ content: '<p>Hello</p>' }).success).toBe(true);
  });

  it('rejects empty content', () => {
    expect(docUpdateRequestSchema.safeParse({ content: '' }).success).toBe(false);
  });
});
