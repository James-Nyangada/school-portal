import { describe, expect, it } from 'vitest';
import { isStillProcessing, normalizeKenyanPhone } from '../mpesa';

describe('normalizeKenyanPhone', () => {
  it.each([
    ['0712345678', '254712345678'],
    ['0712 345 678', '254712345678'],
    ['+254712345678', '254712345678'],
    ['254712345678', '254712345678'],
    ['712345678', '254712345678'],
    ['0110345678', '254110345678']
  ])('%s → %s', (input, expected) => {
    expect(normalizeKenyanPhone(input)).toBe(expected);
  });

  it.each(['', '12345', '0212345678', '07123456789', '+1 555 123 4567'])('rejects %s', (input) => {
    expect(normalizeKenyanPhone(input)).toBeNull();
  });
});

describe('isStillProcessing', () => {
  it.each([
    [{ ResultCode: '4999', ResultDesc: 'The transaction is still under processing' }, true],
    [{ ResultCode: 4999 }, true],
    [{ ResultCode: '500.001.1001', ResultDesc: 'The transaction is being processed' }, true],
    [{ ResultCode: '0', ResultDesc: 'The service request is processed successfully.' }, false],
    [{ ResultCode: '1032', ResultDesc: 'Request cancelled by user' }, false],
    [{ ResultCode: '1037', ResultDesc: 'No response from user.' }, false]
  ])('%j → %s', (q, expected) => {
    expect(isStillProcessing(q)).toBe(expected);
  });
});
