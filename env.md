DATABASE_URL="postgresql://postgres.qajefrwpbnfgthrebhiq:JemaFaith200@aws-1-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.qajefrwpbnfgthrebhiq:JemaFaith200@aws-1-eu-central-1.pooler.supabase.com:5432/postgres"
JWT_SECRET="supersecret_for_dev_only_jemafaith"
PORT=4000
CLOUDINARY_CLOUD_NAME=ixc1b2oe
CLOUDINARY_API_KEY=156192898188344
CLOUDINARY_API_SECRET=DUfA-vwpqkNvSShOC8B4HLEf7qA
# --- Fee payments (server/.env) ---
# M-Pesa STK Push (Safaricom Daraja). Leave unset to hide M-Pesa; parents can still report bank deposits.
MPESA_ENV=sandbox                      # sandbox | production
MPESA_CONSUMER_KEY=
MPESA_CONSUMER_SECRET=
MPESA_SHORTCODE=                       # paybill / store number (sandbox: 174379)
MPESA_PASSKEY=                         # Lipa na M-Pesa Online passkey
MPESA_CALLBACK_URL=               # public https URL to POST /api/mpesa/callback (use ngrok locally)
MPESA_CALLBACK_SECRET=                 # long random string; checked on every callback
MPESA_TRANSACTION_TYPE=CustomerPayBillOnline   # or CustomerBuyGoodsOnline for a till
MPESA_PARTY_B=                         # till number for buy-goods; defaults to MPESA_SHORTCODE
# School bank account shown to parents on the Fees page
SCHOOL_BANK_NAME=
SCHOOL_BANK_BRANCH=
SCHOOL_BANK_ACCOUNT_NAME=
SCHOOL_BANK_ACCOUNT_NUMBER=
