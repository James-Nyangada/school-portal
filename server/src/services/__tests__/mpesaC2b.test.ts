import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeAccount, parseTransTime } from '../mpesaC2b';
import { c2bUrls } from '../mpesa';

describe('normalizeAccount', () => {
  it.each([
    ['ADM-3165', 'ADM3165'],
    ['adm 3165', 'ADM3165'],
    [' adm3165 ', 'ADM3165'],
    ['adm/3165', 'ADM3165'],
    ['', '']
  ])('%s → %s', (input, expected) => {
    expect(normalizeAccount(input)).toBe(expected);
  });
});

describe('parseTransTime', () => {
  it('reads Daraja time as Kenyan time (UTC+3)', () => {
    expect(parseTransTime('20261014093005')?.toISOString()).toBe('2026-10-14T06:30:05.000Z');
  });

  it.each([undefined, '', '2026-10-14', '2026101409300'])('rejects %s', (input) => {
    expect(parseTransTime(input)).toBeNull();
  });
});

describe('c2bUrls', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('builds URLs from the callback origin with the secret as a path segment', () => {
    vi.stubEnv('MPESA_CALLBACK_URL', 'https://school.example.com/api/mpesa/callback');
    vi.stubEnv('MPESA_CALLBACK_SECRET', 's3cret');
    vi.stubEnv('MPESA_C2B_URL_BASE', '');

    expect(c2bUrls()).toEqual({
      confirmationUrl: 'https://school.example.com/api/payments/c2b/confirmation/s3cret',
      validationUrl: 'https://school.example.com/api/payments/c2b/validation/s3cret'
    });
  });

  it('refuses addresses Safaricom would reject', () => {
    vi.stubEnv('MPESA_C2B_URL_BASE', 'https://mpesa-school.example.com');
    vi.stubEnv('MPESA_CALLBACK_SECRET', '');

    expect(() => c2bUrls()).toThrow(/"mpesa"/);
  });
});
