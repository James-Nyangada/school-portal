/**
 * Tells Safaricom to report every Paybill payment (made from the M-Pesa menu) to this server.
 * Run once per shortcode, and again whenever the server's public address changes:
 *
 *   npm run mpesa:register-c2b
 *
 * In production a shortcode's URLs can only be registered once from the API; to change them later,
 * delete them on the Daraja portal (or ask Safaricom) first.
 */
import 'dotenv/config';
import { mpesaConfig, registerC2BUrls } from '../src/services/mpesa';

async function main() {
  const c = mpesaConfig();
  if (!c.configured) throw new Error('M-Pesa is not configured: set the MPESA_* variables in .env');

  console.log(`Registering Paybill ${c.shortcode} (${c.production ? 'production' : 'sandbox'})…`);
  const { confirmationUrl, validationUrl, response } = await registerC2BUrls();
  console.log('Confirmation URL:', confirmationUrl);
  console.log('Validation URL:  ', validationUrl);
  console.log('Safaricom:', response.ResponseDescription ?? JSON.stringify(response));
}

main().catch((e) => {
  console.error('Failed:', (e as Error).message);
  process.exit(1);
});
