import { getSettings } from './grading';
import { normalizeKenyanPhone } from './mpesa';

/**
 * Transactional SMS through Africa's Talking (admission credentials, fee reminders, absence alerts).
 * Configure in server/.env:
 *   AT_API_KEY      Africa's Talking API key (SMS is skipped, not faked, when unset)
 *   AT_USERNAME     Africa's Talking username (default sandbox)
 *   AT_SENDER_ID    Optional alphanumeric sender ID
 * Nothing is sent while SMS notifications are switched off in System Settings → Feature Toggles.
 * Message bodies are never logged: some carry temporary passwords.
 */

const env = (key: string) => process.env[key]?.trim() || '';
const schoolName = () => env('SCHOOL_NAME') || 'School';

export const smsConfigured = () => !!env('AT_API_KEY');

export type SmsResult = {
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  /** Numbers the gateway accepted, in +254… form */
  sent: string[];
  failed: string[];
  error?: string | undefined;
};

export async function sendSms(phones: string | (string | null | undefined)[], message: string): Promise<SmsResult> {
  const list = Array.isArray(phones) ? phones : [phones];
  const numbers = [...new Set(list.map((p) => (p ? normalizeKenyanPhone(p) : null)).filter((p): p is string => !!p))].map((p) => `+${p}`);

  if (numbers.length === 0) return { status: 'SKIPPED', sent: [], failed: [], error: 'No valid Kenyan mobile number' };
  if (!(await getSettings()).smsEnabled) return { status: 'SKIPPED', sent: [], failed: [], error: 'SMS notifications are turned off' };
  if (!smsConfigured()) return { status: 'SKIPPED', sent: [], failed: [], error: 'The SMS gateway is not configured' };

  const body = new URLSearchParams({ username: env('AT_USERNAME') || 'sandbox', to: numbers.join(','), message });
  if (env('AT_SENDER_ID')) body.append('from', env('AT_SENDER_ID'));

  try {
    const res = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: { apiKey: env('AT_API_KEY'), 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: body.toString()
    });
    if (!res.ok) return { status: 'FAILED', sent: [], failed: numbers, error: `The SMS gateway returned ${res.status}` };

    const data = (await res.json()) as { SMSMessageData?: { Recipients?: { number: string; status: string }[] } };
    const sent = (data.SMSMessageData?.Recipients ?? []).filter((r) => r.status === 'Success').map((r) => r.number);
    const failed = numbers.filter((n) => !sent.includes(n));

    return {
      status: sent.length > 0 ? 'SENT' : 'FAILED',
      sent,
      failed,
      error: failed.length > 0 ? `${failed.length} number(s) were rejected` : undefined
    };
  } catch (error) {
    console.error("[Africa's Talking SMS]", (error as Error).message);
    return { status: 'FAILED', sent: [], failed: numbers, error: 'Could not reach the SMS gateway' };
  }
}

/** One-line outcome for audit logs and API responses. */
export const smsSummary = (r: SmsResult) =>
  r.status === 'SENT' ? `SMS sent to ${r.sent.length} number(s)` : `SMS not sent: ${r.error ?? r.status.toLowerCase()}`;

/** Admission (§2.2): login details for the new student, sent to the parent's phone. */
export function sendAdmissionCredentialsSms(params: {
  parentPhone: string;
  studentName: string;
  studentEmail?: string | null;
  tempPassword?: string;
  admissionNumber: string;
}) {
  let text = `Welcome to ${schoolName()}. ${params.studentName} has been admitted (Adm: ${params.admissionNumber}).`;
  if (params.studentEmail && params.tempPassword) text += ` Student login: ${params.studentEmail} / Password: ${params.tempPassword}.`;
  text += ' Sign in to the parent portal with this phone number.';
  return sendSms(params.parentPhone, text);
}

/** Finance "prompt parent" (§4.2): the current balance plus how to pay. */
export function feeReminderText(params: { studentName: string; balance: number; term: string; admissionNumber?: string | null }) {
  const paybill = env('MPESA_SHORTCODE');
  const how = paybill
    ? `Pay via M-Pesa Paybill ${paybill}, account ${params.admissionNumber || "your child's admission number"}, or through the parent portal.`
    : 'Pay through the parent portal or at the school office.';
  return `${schoolName()}: Dear parent, ${params.studentName} has a fee balance of KES ${params.balance.toLocaleString('en-KE')} (${params.term}). ${how} Thank you.`;
}
