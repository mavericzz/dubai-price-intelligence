"""
Bayut.com Dubai property listings scraper.
Async Playwright with rotating proxies, Supabase upsert, price history tracking.
"""

import asyncio
import json
import logging
import os
import random
import re
import time
from datetime import datetime, timezone
from typing import Optional

import httpx
from dotenv import load_dotenv
from playwright.async_api import async_playwright, BrowserContext, Page, TimeoutError as PlaywrightTimeoutError
from supabase import create_client, Client

load_dotenv()

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
ROTATING_PROXY_URL = os.environ.get("ROTATING_PROXY_URL", "")
HEALTH_WEBHOOK_URL = os.environ.get("HEALTH_WEBHOOK_URL", "")

PROPERTY_TYPES = [
    "apartment",
    "villa",
    "townhouse",
    "penthouse",
    "duplex",
    "studio",
    "compound",
    "plot",
    "bulk-units",
    "hotel-apartment",
]

BASE_URL = "https://www.bayut.com"
LISTING_PATH = "/to-rent/property/dubai/"  # swap to /for-sale/ for sales

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.6312.122 Safari/537.36 Edg/123.0.0.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 OPR/108.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
]

MAX_RETRIES = 3
MIN_DELAY = 3.0
MAX_DELAY = 8.0

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger("bayut_scraper")


# ---------------------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------------------

def get_supabase() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def upsert_listing(db: Client, listing: dict) -> None:
    """Upsert a listing and handle price history."""
    external_id = listing["external_id"]

    # Fetch existing record to compare price
    existing = (
        db.table("listings")
        .select("id,price,peak_price")
        .eq("external_id", external_id)
        .maybe_single()
        .execute()
    )

    now = datetime.now(timezone.utc).isoformat()

    if existing.data:
        row = existing.data
        old_price = row.get("price")
        new_price = listing.get("price")

        if old_price is not None and new_price is not None and old_price != new_price:
            # Insert price history record
            db.table("price_history").insert(
                {
                    "listing_id": row["id"],
                    "old_price": old_price,
                    "new_price": new_price,
                    "changed_at": now,
                }
            ).execute()
            log.info("Price change for %s: %s → %s", external_id, old_price, new_price)

        # Update peak_price if current price is higher
        current_peak = row.get("peak_price") or 0
        if new_price and new_price > current_peak:
            listing["peak_price"] = new_price

    listing["updated_at"] = now
    listing["is_active"] = True

    db.table("listings").upsert(listing, on_conflict="external_id").execute()


def mark_stale_listings(db: Client, seen_ids: list[str]) -> int:
    """Mark any listing not in seen_ids as inactive."""
    if not seen_ids:
        return 0

    result = (
        db.table("listings")
        .update({"is_active": False})
        .eq("is_active", True)
        .not_.in_("external_id", seen_ids)
        .execute()
    )
    count = len(result.data) if result.data else 0
    if count:
        log.info("Marked %d stale listings as inactive", count)
    return count


def post_health_alert(message: str) -> None:
    if not HEALTH_WEBHOOK_URL:
        return
    try:
        httpx.post(HEALTH_WEBHOOK_URL, json={"text": message}, timeout=10)
    except Exception as exc:
        log.warning("Health webhook failed: %s", exc)


# ---------------------------------------------------------------------------
# Browser helpers
# ---------------------------------------------------------------------------

def random_delay() -> float:
    return random.uniform(MIN_DELAY, MAX_DELAY)


def random_user_agent() -> str:
    return random.choice(USER_AGENTS)


def build_proxy_config() -> Optional[dict]:
    if not ROTATING_PROXY_URL:
        return None
    return {"server": ROTATING_PROXY_URL}


async def make_browser_context(playwright) -> BrowserContext:
    proxy = build_proxy_config()
    ua = random_user_agent()

    launch_kwargs = {
        "headless": True,
        "args": [
            "--no-sandbox",
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
        ],
    }
    if proxy:
        launch_kwargs["proxy"] = proxy

    browser = await playwright.chromium.launch(**launch_kwargs)
    context = await browser.new_context(
        user_agent=ua,
        viewport={"width": random.randint(1200, 1920), "height": random.randint(768, 1080)},
        locale="en-US",
        timezone_id="Asia/Dubai",
        extra_http_headers={
            "Accept-Language": "en-US,en;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        },
    )
    # Hide webdriver flag
    await context.add_init_script(
        "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
    )
    return context


# ---------------------------------------------------------------------------
# Data extraction
# ---------------------------------------------------------------------------

def safe_text(el_text: Optional[str]) -> Optional[str]:
    if el_text is None:
        return None
    return el_text.strip() or None


def parse_price(raw: Optional[str]) -> Optional[int]:
    if not raw:
        return None
    cleaned = re.sub(r"[^\d]", "", raw)
    return int(cleaned) if cleaned else None


def parse_size(raw: Optional[str]) -> Optional[float]:
    if not raw:
        return None
    m = re.search(r"[\d,]+\.?\d*", raw.replace(",", ""))
    return float(m.group()) if m else None


def parse_int(raw: Optional[str]) -> Optional[int]:
    if not raw:
        return None
    m = re.search(r"\d+", raw)
    return int(m.group()) if m else None


async def extract_listing_data(page: Page, url: str) -> Optional[dict]:
    """Navigate to a listing detail page and extract all fields."""
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await asyncio.sleep(random.uniform(1.0, 2.5))
    except PlaywrightTimeoutError:
        log.warning("Timeout loading listing %s", url)
        return None

    try:
        # Extract JSON-LD structured data when available
        ld_json = await page.evaluate("""() => {
            const scripts = document.querySelectorAll('script[type="application/ld+json"]');
            for (const s of scripts) {
                try {
                    const d = JSON.parse(s.textContent);
                    if (d['@type'] === 'Apartment' || d['@type'] === 'SingleFamilyResidence'
                        || d['@type'] === 'Place' || d['@type'] === 'Product') {
                        return d;
                    }
                } catch(_) {}
            }
            return null;
        }""")

        # External ID from URL slug
        external_id_match = re.search(r"-(\d+)\.html?", url)
        external_id = external_id_match.group(1) if external_id_match else url.split("/")[-1]

        # Title
        title = safe_text(await page.text_content("h1[data-testid='page-title']", timeout=5000))
        if not title:
            title = safe_text(await page.text_content("h1", timeout=5000))

        # Price
        price_raw = safe_text(await page.text_content("[data-testid='price']", timeout=5000))
        if not price_raw:
            price_raw = safe_text(await page.text_content(".price", timeout=5000))
        price = parse_price(price_raw)

        # Beds / baths
        beds_raw = safe_text(await page.text_content("[aria-label='Beds']", timeout=5000))
        baths_raw = safe_text(await page.text_content("[aria-label='Baths']", timeout=5000))
        beds = parse_int(beds_raw)
        baths = parse_int(baths_raw)

        # Size
        size_raw = safe_text(await page.text_content("[aria-label='Area']", timeout=5000))
        size_sqft = parse_size(size_raw)

        # Location breadcrumb: area / sub_area
        breadcrumb_items = await page.query_selector_all("[data-testid='breadcrumb-item']")
        area = None
        sub_area = None
        if len(breadcrumb_items) >= 2:
            area = safe_text(await breadcrumb_items[-2].text_content())
        if len(breadcrumb_items) >= 1:
            sub_area = safe_text(await breadcrumb_items[-1].text_content())

        # Property type from URL or page
        property_type = None
        for pt in PROPERTY_TYPES:
            if pt in url.lower():
                property_type = pt
                break
        if not property_type:
            property_type = safe_text(
                await page.text_content("[data-testid='property-type']", timeout=5000)
            )

        # Image
        image_url = None
        img = await page.query_selector("img[data-testid='hero-image']")
        if not img:
            img = await page.query_selector("picture img")
        if img:
            image_url = await img.get_attribute("src")

        # Agent info
        agent_name = safe_text(
            await page.text_content("[data-testid='agent-name']", timeout=5000)
        )
        agent_phone = safe_text(
            await page.text_content("[data-testid='agent-phone']", timeout=5000)
        )
        if not agent_phone:
            agent_phone = safe_text(
                await page.text_content("a[href^='tel:']", timeout=5000)
            )

        # Lat / lng from JSON-LD or map embed
        lat = None
        lng = None
        if ld_json:
            geo = ld_json.get("geo") or {}
            lat = geo.get("latitude")
            lng = geo.get("longitude")
        if not lat:
            # Try extracting from the page meta or map iframe src
            map_url = await page.evaluate("""() => {
                const iframe = document.querySelector('iframe[src*="maps.google"]');
                return iframe ? iframe.src : null;
            }""")
            if map_url:
                m = re.search(r"q=([0-9.-]+),([0-9.-]+)", map_url)
                if m:
                    lat, lng = float(m.group(1)), float(m.group(2))

        # Off-plan / developer / payment plan / completion
        page_text = await page.text_content("body")
        is_off_plan = bool(re.search(r"off.?plan", page_text or "", re.IGNORECASE))

        developer = safe_text(
            await page.text_content("[data-testid='developer-name']", timeout=3000)
        )
        payment_plan = safe_text(
            await page.text_content("[data-testid='payment-plan']", timeout=3000)
        )
        completion_date = safe_text(
            await page.text_content("[data-testid='completion-date']", timeout=3000)
        )

        return {
            "external_id": external_id,
            "title": title,
            "area": area,
            "sub_area": sub_area,
            "property_type": property_type,
            "beds": beds,
            "baths": baths,
            "size_sqft": size_sqft,
            "price": price,
            "listing_url": url,
            "image_url": image_url,
            "agent_name": agent_name,
            "agent_phone": agent_phone,
            "lat": float(lat) if lat else None,
            "lng": float(lng) if lng else None,
            "is_off_plan": is_off_plan,
            "developer": developer,
            "payment_plan": payment_plan,
            "completion_date": completion_date,
        }

    except Exception as exc:
        log.error("Error extracting %s: %s", url, exc, exc_info=True)
        return None


# ---------------------------------------------------------------------------
# Pagination & listing URL collection
# ---------------------------------------------------------------------------

async def collect_listing_urls(context: BrowserContext, property_type: str) -> list[str]:
    """Paginate a property-type search page and collect all listing URLs."""
    page = await context.new_page()
    urls: list[str] = []
    page_num = 1

    # Bayut uses /page-N/ in the URL for pagination
    while True:
        search_url = (
            f"{BASE_URL}/to-rent/{property_type}/dubai/"
            if page_num == 1
            else f"{BASE_URL}/to-rent/{property_type}/dubai/page-{page_num}/"
        )
        log.info("Fetching listing index: %s", search_url)

        for attempt in range(1, MAX_RETRIES + 1):
            try:
                await page.goto(search_url, wait_until="domcontentloaded", timeout=30000)
                await asyncio.sleep(random.uniform(1.5, 3.0))
                break
            except PlaywrightTimeoutError:
                log.warning("Timeout on index page (attempt %d/%d): %s", attempt, MAX_RETRIES, search_url)
                if attempt == MAX_RETRIES:
                    log.error("Giving up on %s after %d attempts", search_url, MAX_RETRIES)
                    await page.close()
                    return urls

        # Collect listing links
        anchors = await page.query_selector_all("a[href*='/property/']")
        page_urls = []
        for anchor in anchors:
            href = await anchor.get_attribute("href")
            if href and re.search(r"-\d+\.html?", href):
                full = href if href.startswith("http") else BASE_URL + href
                if full not in urls:
                    page_urls.append(full)

        if not page_urls:
            log.info("No more listings on page %d for %s", page_num, property_type)
            break

        urls.extend(page_urls)
        log.info("Found %d listings on page %d (total so far: %d)", len(page_urls), page_num, len(urls))

        # Check if there's a next page
        next_btn = await page.query_selector("[aria-label='Next page'], .next-page, [data-testid='pagination-next']")
        if not next_btn:
            break

        page_num += 1
        await asyncio.sleep(random_delay())

    await page.close()
    return list(dict.fromkeys(urls))  # deduplicate preserving order


# ---------------------------------------------------------------------------
# Main scrape loop
# ---------------------------------------------------------------------------

async def scrape_property_type(
    playwright,
    db: Client,
    property_type: str,
    seen_ids: list[str],
) -> int:
    """Scrape all listings for a single property type. Returns count of scraped listings."""
    log.info("=== Starting property type: %s ===", property_type)

    context = await make_browser_context(playwright)
    listing_urls = await collect_listing_urls(context, property_type)
    log.info("Collected %d listing URLs for %s", len(listing_urls), property_type)

    count = 0
    for url in listing_urls:
        for attempt in range(1, MAX_RETRIES + 1):
            listing = await extract_listing_data(context.pages[0] if context.pages else await context.new_page(), url)
            if listing:
                try:
                    upsert_listing(db, listing)
                    seen_ids.append(listing["external_id"])
                    count += 1
                    log.info("[%s] Upserted listing %s — %s", property_type, listing["external_id"], listing.get("title", "")[:60])
                except Exception as exc:
                    log.error("DB upsert failed for %s: %s", url, exc)
                break
            else:
                log.warning("Extraction failed (attempt %d/%d): %s", attempt, MAX_RETRIES, url)
                if attempt < MAX_RETRIES:
                    await asyncio.sleep(random.uniform(2, 5))

        await asyncio.sleep(random_delay())

    await context.browser.close()
    log.info("=== Finished %s: %d listings scraped ===", property_type, count)
    return count


async def main() -> None:
    log.info("Bayut scraper started at %s", datetime.now(timezone.utc).isoformat())
    db = get_supabase()
    seen_ids: list[str] = []
    total = 0

    async with async_playwright() as playwright:
        for property_type in PROPERTY_TYPES:
            try:
                n = await scrape_property_type(playwright, db, property_type, seen_ids)
                total += n
            except Exception as exc:
                log.error("Fatal error scraping %s: %s", property_type, exc, exc_info=True)

    log.info("Scrape complete. Total listings upserted: %d", total)

    # Mark stale listings
    if seen_ids:
        stale = mark_stale_listings(db, seen_ids)
        log.info("Stale listings deactivated: %d", stale)

    # Health check
    if total < 50:
        msg = f"WARNING: Bayut scraper only collected {total} listings (< 50). Possible blockage or site change."
        log.warning(msg)
        post_health_alert(msg)
    else:
        log.info("Health check passed: %d listings collected", total)

    log.info("Bayut scraper finished at %s", datetime.now(timezone.utc).isoformat())


if __name__ == "__main__":
    asyncio.run(main())
