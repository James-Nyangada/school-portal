import { PaymentMethod, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { applyPayment, feesPageFor, FEE_TX } from './fees';

/**
 * Safaricom Daraja (Lipa na M-Pesa Online / STK Push).
 *
 * Env:
 *   MPESA_ENV               sandbox | production (default sandbox)
 *   MPESA_CONSUMER_KEY      Daraja app consumer key
 *   MPESA_CONSUMER_SECRET   Daraja app consumer secret
 *   MPESA_SHORTCODE         Paybill / store number that signs the request (BusinessShortCode)
 *   MPESA_PASSKEY           Lipa na M-Pesa Online passkey
 *   MPESA_CALLBACK_URL      Public https URL of POST /api/mpesa/callback
 *   MPESA_CALLBACK_SECRET   Random string; sent as ?token= on the callback URL and checked on arrival
 *   MPESA_TRANSACTION_TYPE  CustomerPayBillOnline (default) | CustomerBuyGoodsOnline
 *   MPESA_PARTY_B           Till number for buy-goods; defaults to MPESA_SHORTCODE
 *   MPESA_C2B_URL_BASE      Public https origin Safaricom sends Paybill (C2B) payments to; defaults to MPESA_CALLBACK_URL's origin
 *   MPESA_C2B_REJECT_UNKNOWN_ACCOUNTS  true → refuse Paybill payments whose account isn't an admission number
 *                           (only applies once Safaricom has enabled external validation on the shortcode)
 */

export class MpesaError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

const env = (key: string) => process.env[key]?.trim() || '';

export function mpesaConfig() {
  const production = env('MPESA_ENV') === 'production';
  const config = {
    production,
    baseUrl: production ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke',
    consumerKey: env('MPESA_CONSUMER_KEY'),
    consumerSecret: env('MPESA_CONSUMER_SECRET'),
    shortcode: env('MPESA_SHORTCODE'),
    passkey: env('MPESA_PASSKEY'),
    callbackUrl: env('MPESA_CALLBACK_URL'),
    callbackSecret: env('MPESA_CALLBACK_SECRET'),
    transactionType: env('MPESA_TRANSACTION_TYPE') || 'CustomerPayBillOnline',
    partyB: env('MPESA_PARTY_B') || env('MPESA_SHORTCODE'),
    c2bUrlBase: env('MPESA_C2B_URL_BASE'),
    c2bRejectUnknownAccounts: env('MPESA_C2B_REJECT_UNKNOWN_ACCOUNTS') === 'true'
  };
  const configured = !!(config.consumerKey && config.consumerSecret && config.shortcode && config.passkey && config.callbackUrl);
  return { ...config, configured };
}

/** 0712 345 678, +254712345678, 254712345678, 712345678 → 254712345678. Null if it isn't a Kenyan mobile number. */
export function normalizeKenyanPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  const local = digits.replace(/^(254|0)/, '');
  return /^[17]\d{8}$/.test(local) ? `254${local}` : null;
}

/** Daraja wants yyyyMMddHHmmss in Kenyan time (UTC+3, no DST). */
function timestamp(date = new Date()) {
  const eat = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  return eat.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken() {
  const c = mpesaConfig();
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const auth = Buffer.from(`${c.consumerKey}:${c.consumerSecret}`).toString('base64');
  const res = await fetch(`${c.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) throw new MpesaError(`M-Pesa authentication failed (${res.status})`);

  const body = (await res.json()) as { access_token: string; expires_in: string };
  cachedToken = { value: body.access_token, expiresAt: Date.now() + Number(body.expires_in || 3599) * 1000 };
  return cachedToken.value;
}

async function darajaPost<T>(path: string, payload: unknown): Promise<T> {
  const c = mpesaConfig();
  const res = await fetch(`${c.baseUrl}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const body = (await res.json().catch(() => ({}))) as T & { errorMessage?: string };
  if (!res.ok) throw new MpesaError(body.errorMessage || `M-Pesa request failed (${res.status})`);
  return body;
}

function password(ts: string) {
  const c = mpesaConfig();
  return Buffer.from(`${c.shortcode}${c.passkey}${ts}`).toString('base64');
}

export async function stkPush(opts: { phone: string; amount: number; accountReference: string; description: string }) {
  const c = mpesaConfig();
  const ts = timestamp();
  const callback = new URL(c.callbackUrl);
  if (c.callbackSecret) callback.searchParams.set('token', c.callbackSecret);

  const body = await darajaPost<{
    MerchantRequestID: string;
    CheckoutRequestID: string;
    ResponseCode: string;
    ResponseDescription: string;
    CustomerMessage: string;
  }>('/mpesa/stkpush/v1/processrequest', {
    BusinessShortCode: c.shortcode,
    Password: password(ts),
    Timestamp: ts,
    TransactionType: c.transactionType,
    Amount: Math.round(opts.amount),
    PartyA: opts.phone,
    PartyB: c.partyB,
    PhoneNumber: opts.phone,
    CallBackURL: callback.toString(),
    AccountReference: opts.accountReference.slice(0, 12),
    TransactionDesc: opts.description.slice(0, 13)
  });

  if (body.ResponseCode !== '0') throw new MpesaError(body.ResponseDescription || 'M-Pesa rejected the request');
  return body;
}

/** Asks Daraja what happened to a prompt; used when the callback hasn't arrived. */
export async function stkQuery(checkoutRequestId: string) {
  const c = mpesaConfig();
  const ts = timestamp();
  return darajaPost<{ ResultCode?: string; ResultDesc?: string; errorCode?: string }>('/mpesa/stkpushquery/v1/query', {
    BusinessShortCode: c.shortcode,
    Password: password(ts),
    Timestamp: ts,
    CheckoutRequestID: checkoutRequestId
  });
}

/** A query answer that isn't an outcome yet: the customer hasn't finished, or Safaricom is still processing. */
export function isStillProcessing(q: { ResultCode?: string | number | null; ResultDesc?: string | null }) {
  return Number(q.ResultCode) === 4999 || /still under processing|being processed|in progress/i.test(q.ResultDesc ?? '');
}

/**
 * Where Safaricom should send Paybill payments. Daraja refuses URLs containing words such as "mpesa",
 * "safaricom", "query" or "exec", which is why these routes live under /api/payments/c2b.
 */
export function c2bUrls() {
  const c = mpesaConfig();
  const origin = (c.c2bUrlBase || (c.callbackUrl ? new URL(c.callbackUrl).origin : '')).replace(/\/+$/, '');
  if (!origin) throw new MpesaError('Set MPESA_C2B_URL_BASE (or MPESA_CALLBACK_URL) to the server\'s public https address', 500);

  // The secret is a path segment rather than ?token= so it survives however Safaricom builds the request
  const suffix = c.callbackSecret ? `/${encodeURIComponent(c.callbackSecret)}` : '';
  const urls = {
    confirmationUrl: `${origin}/api/payments/c2b/confirmation${suffix}`,
    validationUrl: `${origin}/api/payments/c2b/validation${suffix}`
  };

  const banned = ['mpesa', 'm-pesa', 'safaricom', 'exec', 'cmd', 'sql', 'query'];
  for (const url of Object.values(urls)) {
    const word = banned.find((w) => url.toLowerCase().includes(w));
    if (word) throw new MpesaError(`Safaricom rejects C2B URLs containing "${word}": ${url}`, 500);
  }
  return urls;
}

/** One-off: tells Safaricom to report every Paybill payment to this server. */
export async function registerC2BUrls() {
  const c = mpesaConfig();
  const { confirmationUrl, validationUrl } = c2bUrls();
  const path = c.production ? '/mpesa/c2b/v2/registerurl' : '/mpesa/c2b/v1/registerurl';

  const body = await darajaPost<{ ResponseCode?: string; ResponseDescription?: string }>(path, {
    ShortCode: c.shortcode,
    // Completed: if our validation URL can't be reached, Safaricom accepts the payment anyway
    ResponseType: 'Completed',
    ConfirmationURL: confirmationUrl,
    ValidationURL: validationUrl
  });
  return { confirmationUrl, validationUrl, response: body };
}

type Settlement = { resultCode: number; resultDesc: string; amount?: number | null; receiptNumber?: string | null };

/**
 * Records the outcome of a prompt exactly once. The callback and the status query can race, so the
 * PENDING → final transition is a conditional update; the loser only back-fills the receipt number.
 */
export async function settleMpesaRequest(checkoutRequestId: string, result: Settlement) {
  return prisma.$transaction((tx) => settleMpesaRequestTx(tx, checkoutRequestId, result), FEE_TX);
}

/** settleMpesaRequest inside a caller's transaction (the Paybill confirmation uses this). */
export async function settleMpesaRequestTx(tx: Prisma.TransactionClient, checkoutRequestId: string, result: Settlement) {
  const request = await tx.mpesaRequest.findUnique({ where: { checkoutRequestId } });
  if (!request) return null;

  const success = result.resultCode === 0;
  // Money moving is final: a success may overturn a FAILED that came from a status query, never the reverse
  const claimed = await tx.mpesaRequest.updateMany({
    where: { id: request.id, status: success ? { in: ['PENDING', 'FAILED'] } : 'PENDING' },
    data: {
      status: success ? 'SUCCESS' : 'FAILED',
      resultCode: result.resultCode,
      resultDesc: result.resultDesc,
      mpesaReceiptNumber: result.receiptNumber ?? null
    }
  });

  if (claimed.count === 0) {
    // Already settled (by the status query) — the callback carries the receipt number the query lacks
    if (success && result.receiptNumber && !request.mpesaReceiptNumber) {
      await tx.mpesaRequest.update({ where: { id: request.id }, data: { mpesaReceiptNumber: result.receiptNumber } });
      const taken = await tx.feeTransaction.findUnique({ where: { receiptNumber: result.receiptNumber } });
      if (request.transactionId && !taken) {
        await tx.feeTransaction.update({ where: { id: request.transactionId }, data: { receiptNumber: result.receiptNumber } });
      }
    }
    return tx.mpesaRequest.findUnique({ where: { id: request.id } });
  }

  if (!success) {
    return tx.mpesaRequest.findUnique({ where: { id: request.id } });
  }

  // A Paybill confirmation for this same receipt may have credited it first
  const existing = result.receiptNumber
    ? await tx.feeTransaction.findUnique({ where: { receiptNumber: result.receiptNumber } })
    : null;
  if (existing) {
    return tx.mpesaRequest.update({ where: { id: request.id }, data: { transactionId: existing.id } });
  }

  const amount = result.amount && result.amount > 0 ? result.amount : request.amount;
  const { transaction } = await applyPayment(tx, {
    studentId: request.studentId,
    amount,
    method: PaymentMethod.MPESA,
    receiptNumber: result.receiptNumber ?? null,
    term: request.term,
    recordedById: null
  });

  await tx.notification.create({
    data: {
      userId: request.initiatedById,
      type: 'FEE_PAYMENT_RECEIVED',
      title: 'M-Pesa payment received',
      message: `KES ${amount.toLocaleString('en-KE')} has been credited to school fees${result.receiptNumber ? ` (${result.receiptNumber})` : ''}.`,
      link: await feesPageFor(request.initiatedById, tx)
    }
  });

  return tx.mpesaRequest.update({ where: { id: request.id }, data: { transactionId: transaction.id } });
}
