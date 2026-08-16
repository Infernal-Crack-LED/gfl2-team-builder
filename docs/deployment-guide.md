# Deployment Guide — Refitting Room

Everything that an agent or CI could do autonomously is already done. The
steps below are the ones that need **you** — accounts, dashboards, and DNS
registrars that can't be scripted from here.

## Status

| Area | State |
| --- | --- |
| Railway project (`GFL2`) | ✅ Created — web + bot services + Postgres |
| Config files (`railway.web.json`, `railway.bot.json`) | ✅ Wired via `railwayConfigFile` |
| Environment variables (`DATABASE_URL`, `SESSION_SECRET`, `ALLOWED_ORIGINS`, `SITE_URL`, `NODE_ENV`) | ✅ Set on both services |
| Railway domain (`gfl2-team-builder-web-production.up.railway.app`) | ✅ Generated |
| Custom domain `refittingroom.app` attached on Railway | ✅ Pending DNS |
| Deploy workflow (`.github/workflows/deploy.yml`) | ✅ Push-ready |
| `RAILWAY_TOKEN` GitHub Actions secret | ✅ Set |
| DB migrations (`drizzle.__drizzle_migrations` journal) | ✅ Seeded + verified |
| SEO (robots.txt, sitemap.xml, canonical, OG tags, JSON-LD) | ✅ In `web/` |
| Legal pages (`/privacy`, `/terms`) | ✅ Live in router |
| Umami injection (`src/server/app.ts`) | ✅ Code-side; env vars not yet set |

---

## Remaining steps

### 1. Create 3 Discord applications

Go to <https://discord.com/developers/applications> and create:

| App | Purpose | Notes |
| --- | --- | --- |
| **GFL2 Team Builder (dev)** | Local dev bot | Minimal config; copy its token for `.env` |
| **Refitting Room OAuth** | Website Discord login | Only needs an OAuth2 redirect URI (see step 3) |
| **Helen** | Production bot for the App Directory | Full bot + slash commands; this is the one you'll submit for approval later |

### 2. Set Discord env vars on Railway

Use the Railway dashboard or CLI (`railway variables set`):

**Bot service (`gfl2-team-builder-bot`):**

```
DISCORD_TOKEN=<Helen's bot token>
DISCORD_CLIENT_ID=<Helen's application ID>
```

**Web service (`gfl2-team-builder-web`):**

```
OAUTH_CLIENT_ID=<OAuth app's client ID>
OAUTH_CLIENT_SECRET=<OAuth app's client secret>
```

> ⚠️ The bot's pre-deploy command (`bot:deploy-commands`) **throws** if
> `DISCORD_TOKEN` is missing. The bot deploy will fail on first push
> until Helen exists and these vars are set. The web deploy is unaffected.

### 3. Set OAuth redirect URI

On the **Refitting Room OAuth** app in the Discord Developer Portal:

```
Redirects → https://refittingroom.app/auth/discord/callback
```

### 4. Cloudflare — DNS + proxy

1. Add `refittingroom.app` to Cloudflare (free plan is fine).
2. Point your domain registrar's nameservers at the two Cloudflare NS records.
3. Create a **proxied** (orange-cloud) CNAME record:

   | Type | Name | Target | Proxy |
   | --- | --- | --- | --- |
   | CNAME | `@` | `e9rw9nmw.up.railway.app` | Proxied |

   Cloudflare auto-flattens apex CNAMEs to A records.

4. Wait for propagation (usually < 5 min). Railway will issue a TLS cert
   for `refittingroom.app` once DNS resolves to their edge.

### 5. Umami analytics

1. Sign up at <https://cloud.umami.is> (or self-host).
2. Create a website entry for `refittingroom.app`.
3. Copy the **Website ID** and set on the **web service**:

   ```
   UMAMI_URL=https://cloud.umami.is
   UMAMI_WEBSITE_ID=<your-website-id>
   ```

   The server injects the tracking script automatically — no cookie banner
   needed (Umami doesn't use cookies).

### 6. Commit, push, first deploy

```bash
git add -A
git commit -m "chore: wire Railway deploy, SEO, legal pages, Umami"
git push origin main
```

The workflow runs `typecheck → test → deploy`. Web deploys first; bot
deploys second (and will fail pre-deploy until step 2 is complete — that's
expected).

### 7. Google Search Console

1. Add `refittingroom.app` at <https://search.google.com/search-console>.
2. Verify ownership (DNS TXT record is easiest).
3. Submit `https://refittingroom.app/sitemap.xml`.

### 8. Discord App Directory (Helen)

After Helen reaches ~75 server installs:

1. Go to Helen's app page in the Developer Portal → **App Directory**.
2. Fill in the listing:
   - Privacy Policy URL: `https://refittingroom.app/privacy`
   - Terms of Service URL: `https://refittingroom.app/terms`
3. Submit for review.

---

## Quick reference

| Resource | Value |
| --- | --- |
| Railway project | `GFL2` (`b23c30b9-ef7c-4f22-8572-cb84c6925832`) |
| Web service ID | `5f0f3092-cfcd-4484-9555-48652b8b2597` |
| Bot service ID | `fa07eacd-61d8-4aaf-b110-41478ebd67ea` |
| Railway CNAME target | `e9rw9nmw.up.railway.app` |
| Default Railway domain | `gfl2-team-builder-web-production.up.railway.app` |
| Custom domain | `refittingroom.app` |
