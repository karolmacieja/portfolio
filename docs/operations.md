# Operations: backups, retention, monitoring

## Backups

| Data                                                            | Where                         | Backup                                                                                                                                                                                                                    |
| --------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL (everything incl. invoice PDFs in `InvoiceDocument`) | Postgres volume               | Coolify scheduled backup: `pg_dump -Fc` **daily** to an R2 bucket separate from media, retention 30 daily + 12 monthly. Optionally WAL archiving (pgBackRest/WAL-G) for point-in-time recovery when revenue justifies it. |
| Media (uploads, thumbnails)                                     | R2 bucket                     | Enable R2 object versioning or a nightly `rclone sync` to a second bucket/provider; deleted objects kept 30 days.                                                                                                         |
| Redis                                                           | Redis volume (AOF)            | Not backed up: only rate-limit counters, job queues and the daily stats salt. Lost jobs are recreated (schedulers re-register on worker start; stale invoices are re-enqueued every 5 minutes).                           |
| Configuration                                                   | Coolify env + `Setting` table | Export Coolify environment variables after changes; `Setting` rows are in the database dump.                                                                                                                              |

Invoices also live at the provider (Fakturownia) and in KSeF; Stripe keeps payment history.

### Restore drill (quarterly)

1. Create an empty PostgreSQL 16 instance; `pg_restore --no-owner -d $DATABASE_URL backup.dump`.
2. Start web + worker against it with `PAYMENTS_PROVIDER=mock`, `MAIL_PROVIDER=mock` (no real side effects).
3. Check: sign-in, a published site, an invoice PDF download, `/api/health`. Record the time it took (RTO).

## Data retention (automatic, worker)

| Data                                 | Kept                                                                                   | Job                         |
| ------------------------------------ | -------------------------------------------------------------------------------------- | --------------------------- |
| Audit log (staff actions, IPs)       | 2 years                                                                                | daily `retention`           |
| Contact form messages                | until deleted by the client, max 2 years                                               | daily `retention`           |
| Visit statistics                     | daily counts 25 months; visitor hashes until the next day                              | daily `retention` (roll-up) |
| Deleted accounts                     | erased 14 days after the request; invoices/payments stay 5 years (anonymized user row) | hourly `dunning`            |
| Invoices, payments                   | 5 years from the end of the tax year (law); not deleted automatically                  | —                           |
| Password reset / verification tokens | 1 h / 48 h, single use                                                                 | —                           |

## Monitoring

- Uptime: `GET https://app.ROOT_DOMAIN/api/health` (DB + Redis) and the worker health port; alert after 2 failures.
- Logs: Coolify log drain (or `docker logs`). Grep for `[worker]`, `[invoicing]`, `[domains]`, `[account]`,
  `[contact]`, `[stats]`.
- Business alerts in the admin panel: FAILED invoices (`/invoices`), FAILED domain orders (`/domains`),
  open DSA reports (`/reports`), past-due subscriptions (dashboard).
- Stripe: enable email alerts for failed webhooks.

## Routine tasks

- Weekly: check `/invoices` and `/domains` for FAILED rows; `/reports` for open reports.
- Monthly: `pnpm audit` / dependency updates; review Cloudflare custom hostname quota.
- Before changing the terms of service: edit them in `/settings` (a new version asks every signed-in client to
  accept it) and mail clients about the change in advance.
