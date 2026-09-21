# CostAdvisor — Vendor / Sub-processor Risk List

*Last updated 2026-08-22.*

Every third party that processes or could access customer data, as a
sub-processor. This list is what an enterprise buyer's DPA review will ask
for. **DPA status for every row below is "pending"** — actually obtaining
and countersigning each agreement is a legal/business action, not something
resolvable from the codebase; see `jvpdocs/wave1manual.md`.

| Vendor | Role | Data exposed | DPA status |
|---|---|---|---|
| Railway | Hosting — backend API, PostgreSQL, Redis, Celery | All customer data (at rest + in processing) | **Pending** |
| Cloudflare | CDN / edge hosting — frontend SPA and landing page | None beyond standard web request metadata (IP, user agent) served over HTTPS; no application data flows through Cloudflare Workers beyond what the SPA itself calls the API for | **Pending** |
| Hetzner | VM hosting for the self-hosted Ollama (AI narrative) instance | No customer database access; receives only the specific text prompts sent for narrative generation (product/pricing context), over a Tailscale-only private link | **Pending** |
| Google (OAuth) | Authentication provider | Email, name, profile picture (standard OIDC `openid email profile` scope) — no password ever handled by CostAdvisor | **Pending** — Google's own standard terms typically apply; confirm whether a separate DPA is required for this use case |
| SMTP provider (`smtp_host`/`smtp_user` in config — provider not fixed in code) | Outbound transactional email (invites, welcome, demo confirmations, alerts) | Recipient email address + email content (invite/notification text — no cost/pricing data is ever emailed) | **Pending** — depends on which SMTP provider is actually configured in production; confirm and add the specific vendor name here |
| Sentry (once `SENTRY_DSN` is set) | Error monitoring | Stack traces + `set_user_context(user_id, email)` — user id and email attached to error reports, no cost/pricing payloads | **Pending** — not yet active in production (see `jvpdocs/wave1manual.md`); DPA needed before enabling if any EU customer requires it |
| ECB / EIA / Eurostat / FRED / World Bank | Public commodity/FX index data sources (outbound only) | None — CostAdvisor only *reads* public data from these; no customer data is ever sent to them | **Not applicable** — no data processing agreement needed for a one-way public-data read |

## Notes

- This list should be reviewed whenever a new external service is added to
  `backend/app/config.py` or `requirements.txt` — if a new setting looks
  like an API key or base URL for a service that will see customer data
  (even indirectly, like an email or error report), add a row here as part
  of that change, not as an afterthought.
- The "public data sources" row is included specifically so a reviewer
  doesn't have to ask about them — they're outbound-only reads and
  structurally can't be a data-processor risk, but leaving them off the list
  entirely tends to prompt exactly that question.
