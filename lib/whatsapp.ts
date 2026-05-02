// WhatsApp delivery via Twilio Messaging API.
//
// Required env vars:
//   TWILIO_ACCOUNT_SID   — Twilio account SID (ACxxxxxxxx...)
//   TWILIO_AUTH_TOKEN    — Twilio auth token
//   TWILIO_WHATSAPP_FROM — Sender number with whatsapp: prefix
//                          (default: Twilio sandbox +14155238886)
//
// Production note: business-initiated WhatsApp messages must use an approved
// message template registered in the Twilio console. For development use the
// Twilio sandbox which allows freeform messages to registered test numbers.

const ACCOUNT_SID = process.env['TWILIO_ACCOUNT_SID']!;
const AUTH_TOKEN  = process.env['TWILIO_AUTH_TOKEN']!;
const FROM        = process.env['TWILIO_WHATSAPP_FROM'] ?? 'whatsapp:+14155238886';

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

export interface WhatsAppMessage {
  /** Recipient E.164 phone number, e.g. "+971501234567" */
  to: string;
  body: string;
}

/** Strip formatting chars and ensure E.164 + prefix. */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/[\s\-().]/g, '');
  return digits.startsWith('+') ? digits : `+${digits}`;
}

/**
 * Send a single WhatsApp message via Twilio.
 * Throws on non-2xx HTTP response.
 */
export async function sendWhatsAppMessage(msg: WhatsAppMessage): Promise<void> {
  const to  = `whatsapp:${normalizePhone(msg.to)}`;
  const url = `${TWILIO_API_BASE}/Accounts/${ACCOUNT_SID}/Messages.json`;

  const payload = new URLSearchParams({ From: FROM, To: to, Body: msg.body });

  const credentials = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64');
  const res = await fetch(url, {
    method:  'POST',
    headers: {
      Authorization:  `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: payload.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Twilio ${res.status}: ${text}`);
  }
}

export interface PriceDropParams {
  title:         string;
  area:          string | null;
  newPrice:      number;
  dropPercent:   number;
  dropAmountAed: number;
  listingId:     string;
  listingUrl:    string | null;
}

const APP_BASE_URL = process.env['APP_BASE_URL'] ?? 'https://dubaipriceint.com';

/** Build the WhatsApp message body for a price-drop alert. */
export function formatPriceDropMessage(p: PriceDropParams): string {
  const location       = p.area ?? 'Dubai';
  const priceStr       = new Intl.NumberFormat('en-AE').format(p.newPrice);
  const dropAmountStr  = new Intl.NumberFormat('en-AE').format(p.dropAmountAed);
  const deepLink       = p.listingUrl ?? `${APP_BASE_URL}/listings/${p.listingId}`;

  return [
    '🏠 *Price Drop Alert*',
    '',
    `*${p.title}*`,
    `📍 ${location}`,
    `💰 New price: AED ${priceStr}`,
    `📉 Down ${p.dropPercent.toFixed(1)}% · AED ${dropAmountStr} off peak`,
    '',
    `View listing: ${deepLink}`,
    '',
    '_Reply STOP to opt out_',
  ].join('\n');
}
