# Bayut.com Dubai Property Scraper

Async Python scraper using Playwright + Chromium. Collects Dubai property listings from Bayut.com, upserts them into Supabase, and tracks price history.

---

## What it does

- Paginates through all Dubai property types (apartment, villa, townhouse, penthouse, duplex, studio, etc.)
- Extracts: external_id, title, area, sub_area, property_type, beds, baths, size_sqft, price, listing_url, image_url, agent_name, agent_phone, lat, lng, is_off_plan, developer, payment_plan, completion_date
- Upserts to `listings` table on `external_id`
- Writes a `price_history` row whenever price changes; updates `peak_price` if new price is higher
- Marks listings not seen in the current run as `is_active = false`
- Posts a Slack/webhook alert if fewer than 50 listings are scraped (likely a block)
- Rotates through 10 Chrome user-agent strings
- Randomised 3–8 s delays between page loads

---

## Database schema prerequisites

Create these tables in your Supabase project before running:

```sql
create table listings (
  id              uuid primary key default gen_random_uuid(),
  external_id     text unique not null,
  title           text,
  area            text,
  sub_area        text,
  property_type   text,
  beds            int,
  baths           int,
  size_sqft       numeric,
  price           bigint,
  peak_price      bigint,
  listing_url     text,
  image_url       text,
  agent_name      text,
  agent_phone     text,
  lat             double precision,
  lng             double precision,
  is_off_plan     boolean default false,
  developer       text,
  payment_plan    text,
  completion_date text,
  is_active       boolean default true,
  updated_at      timestamptz
);

create table price_history (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid references listings(id) on delete cascade,
  old_price   bigint,
  new_price   bigint,
  changed_at  timestamptz default now()
);
```

---

## Local development

### 1. Prerequisites

- Python 3.11+
- pip / venv

### 2. Install dependencies

```bash
cd scraper
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env — fill in SUPABASE_URL, SUPABASE_SERVICE_KEY, and optionally
# ROTATING_PROXY_URL and HEALTH_WEBHOOK_URL
```

### 4. Run the scraper

```bash
python scraper.py
```

Logs stream to stdout with timestamps. Expect a full Dubai run to take 1–3 hours depending on listing volume and proxy speed.

---

## Hetzner VPS deployment

### Recommended VPS spec

CX21 (2 vCPU, 4 GB RAM, Ubuntu 24.04 LTS) is sufficient for a headless Chromium scrape. A dedicated IP with a reputable residential proxy is strongly recommended to avoid Cloudflare blocks.

### 1. Provision and connect

```bash
ssh root@<your-vps-ip>
```

### 2. Install system dependencies

```bash
apt-get update && apt-get install -y \
    python3.11 python3.11-venv python3-pip \
    git curl \
    libglib2.0-0 libnss3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libasound2
```

### 3. Clone the repo and install Python deps

```bash
git clone https://github.com/your-org/your-repo.git /opt/dubai-scraper
cd /opt/dubai-scraper/scraper
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
playwright install-deps chromium
```

### 4. Set environment variables

Create `/opt/dubai-scraper/scraper/.env` with real values (never commit this file):

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGci...
ROTATING_PROXY_URL=http://user:pass@proxy.example.com:10000
HEALTH_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
```

Restrict permissions:

```bash
chmod 600 /opt/dubai-scraper/scraper/.env
```

### 5. Test a single run

```bash
cd /opt/dubai-scraper/scraper
source .venv/bin/activate
python scraper.py 2>&1 | tee /var/log/bayut_scraper.log
```

### 6. Schedule with cron (every 6 hours)

```bash
crontab -e
```

Add:

```
0 */6 * * * /opt/dubai-scraper/scraper/.venv/bin/python /opt/dubai-scraper/scraper/scraper.py >> /var/log/bayut_scraper.log 2>&1
```

This runs at 00:00, 06:00, 12:00, 18:00 UTC daily.

### 7. Log rotation (optional)

```bash
cat > /etc/logrotate.d/bayut_scraper <<'EOF'
/var/log/bayut_scraper.log {
    weekly
    rotate 4
    compress
    missingok
    notifempty
}
EOF
```

---

## Environment variables reference

| Variable             | Required | Description                                                   |
|----------------------|----------|---------------------------------------------------------------|
| `SUPABASE_URL`       | Yes      | Your Supabase project URL                                     |
| `SUPABASE_SERVICE_KEY` | Yes    | Service-role key (bypasses RLS)                               |
| `ROTATING_PROXY_URL` | No       | HTTP/SOCKS5 proxy endpoint for rotating residential IPs       |
| `HEALTH_WEBHOOK_URL` | No       | POST target for low-listing-count alerts (Slack webhook etc.) |

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| 0 listings scraped | Cloudflare block | Use a residential rotating proxy |
| `TimeoutError` on every page | Proxy is slow or dead | Check `ROTATING_PROXY_URL`; try without proxy locally |
| Supabase auth error | Wrong key | Use service-role key, not anon key |
| `playwright install` fails | Missing system libs | Re-run `playwright install-deps chromium` |
| Cron job doesn't fire | Wrong Python path | Use full venv path: `/opt/.../venv/bin/python` |
