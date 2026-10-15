# Integrations: production configuration

Every integration sits behind an adapter with a mock (`*_PROVIDER=mock`, the default), so the app runs locally
without keys. `APP_ENV=production` refuses mocks. Local test-mode recipes are in the README; this page is the
production checklist.

## Stripe (payments) — `PAYMENTS_PROVIDER=stripe`

1. Account in PLN, business details, payment methods: cards, BLIK, Przelewy24 (BLIK/P24 work for one-time
   payments: premium templates; subscriptions are charged to cards).
2. `STRIPE_SECRET_KEY` (restricted key is fine: Customers, Checkout Sessions, Subscriptions, Prices, Products,
   Coupons, Promotion codes, Refunds, Billing portal — write).
3. Webhook endpoint `https://app.ROOT_DOMAIN/api/webhooks/stripe` with events `checkout.session.completed`,
   `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`,
   `invoice.payment_failed`, `charge.refunded`; its signing secret → `STRIPE_WEBHOOK_SECRET`.
4. Customer portal: allow cancelling and updating payment methods, **disable plan switching** (plans change via
   `/plans`, so entitlements and prorations stay consistent), turn off Stripe's own invoice emails (we send VAT
   invoices).
5. Admin `/plans` → "Synchronizuj ceny ze Stripe" creates products and prices; coupons sync when created in
   `/coupons`.
6. `TAX_ID_PROVIDER=vies` verifies EU VAT numbers for reverse charge.

## Fakturownia + KSeF (invoices) — `INVOICING_PROVIDER=fakturownia`

1. Fakturownia account → Settings → API: token → `FAKTUROWNIA_API_TOKEN`; account subdomain → `FAKTUROWNIA_DOMAIN`;
   optional department (seller data, numbering) → `FAKTUROWNIA_DEPARTMENT_ID`.
2. Connect KSeF in Fakturownia (start with the DEMO environment), keep automatic sending off — the app sends every
   invoice (`gov_save_and_send`) and polls statuses every 5 minutes. `FAKTUROWNIA_KSEF=false` only without KSeF.
3. Admin `/settings`: seller data, VAT rate (23% by owner decision until confirmed), exemption basis for "zw".
4. Test: a payment in Stripe test mode → `/invoices` shows the invoice ISSUED and KSeF ACCEPTED.

## Cloudflare for SaaS (client domains) — `HOSTNAME_PROVIDER=cloudflare`

1. Zone of `ROOT_DOMAIN` on Cloudflare, plan with Cloudflare for SaaS (custom hostnames; first 100 are free).
2. Proxied record `sites.ROOT_DOMAIN` → VPS; SSL/TLS → Custom Hostnames → fallback origin `sites.ROOT_DOMAIN`.
3. API token with _SSL and Certificates: Edit_ on the zone → `CLOUDFLARE_API_TOKEN`; zone id → `CLOUDFLARE_ZONE_ID`;
   `CUSTOM_DOMAIN_CNAME_TARGET=sites.ROOT_DOMAIN`.
4. Apex domains: clients need CNAME flattening/ALIAS at their DNS, or enable Apex Proxying and put the assigned IPs
   into `CUSTOM_DOMAIN_APEX_IPS` (shown to clients as A records).
5. Certificates use HTTP validation through the proxy, so clients only add the CNAME. The worker checks pending
   hostnames every minute (backing off with age) and active ones daily.

## Openprovider (domain registration) — `REGISTRAR_PROVIDER=openprovider`

1. Reseller account with prepaid balance; API access for the IP of the VPS.
2. `OPENPROVIDER_USERNAME`, `OPENPROVIDER_PASSWORD`; test in the sandbox first (`OPENPROVIDER_API_URL` = sandbox URL).
3. `OPENPROVIDER_NAMESERVERS` (Openprovider DNS, e.g. `ns1.openprovider.nl,ns2.openprovider.be,ns3.openprovider.eu`):
   purchased domains get a zone with `www` CNAME to `CUSTOM_DOMAIN_CNAME_TARGET`.
4. Admin `/settings` → domains: offered extensions (.pl, .com, .com.pl, .art.pl, .info.pl), markup (% with a
   minimum), exchange rates. Registrar auto-renew stays off: renewals happen only after the client's yearly payment.
5. The adapter was written against the public v1beta API without live access — run a full purchase in the sandbox
   before launch (decision 94).

## Cloudflare R2 (media) — `STORAGE_PROVIDER=s3`

1. Bucket (e.g. `portfolio-media`), public access through a custom domain `media.ROOT_DOMAIN` → `S3_PUBLIC_URL`.
2. API token (Object Read & Write on the bucket) → `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`;
   `S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com`, `S3_REGION=auto`, `S3_BUCKET`.
3. Enable object versioning or a replication job (operations.md). Invoice PDFs are never stored here.

## Resend (mail) — `MAIL_PROVIDER=resend`

1. Verify the sending domain (SPF, DKIM, DMARC records in Cloudflare DNS).
2. `RESEND_API_KEY`, `MAIL_FROM="Brand <no-reply@ROOT_DOMAIN>"`.
3. Templates are React Email components (`src/server/mail/layout.tsx`); texts are editable in admin `/settings`.
   Contact form notifications set `Reply-To` to the visitor's address.

## Google sign-in (optional)

OAuth client (Web) in Google Cloud Console, redirect URI `https://app.ROOT_DOMAIN/api/auth/callback/google`;
`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`. Without them the Google button is hidden.
