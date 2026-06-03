interface Env {
  RESEND_API_KEY: string;
  CONTACT_TO_EMAIL?: string;
  CONTACT_FROM_EMAIL?: string;
  SUCCESS_URL?: string;
  ERROR_URL?: string;
}

type ContactPayload = {
  name: string;
  phone: string;
  email: string;
  eventDate: string;
  headcount: string;
  location: string;
  eventType: string;
  notes: string;
};

const DEFAULT_TO_EMAIL = "Nick@SigsKitchen.com,Ben@SigsKitchen.com";
const DEFAULT_FROM_EMAIL = "Sig's Kitchen Catering <forms@forms.sigskitchen.com>";
const DEFAULT_SUCCESS_URL = "https://sigskitchen.com/thank-you.html";
const DEFAULT_ERROR_URL = "https://sigskitchen.com/catering.html";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return redirect(withStatus(env.ERROR_URL || DEFAULT_ERROR_URL, "validation"));
    }

    const successUrl = normalizeRedirectUrl(formData.get("success_url"), env.SUCCESS_URL || DEFAULT_SUCCESS_URL);
    const errorUrl = normalizeRedirectUrl(formData.get("error_url"), env.ERROR_URL || DEFAULT_ERROR_URL);

    if (getString(formData, "_honey")) {
      return redirect(successUrl);
    }

    const payload: ContactPayload = {
      name: getString(formData, "name", 120),
      phone: getString(formData, "phone", 50),
      email: getString(formData, "email", 160),
      eventDate: getString(formData, "event-date", 40),
      headcount: getString(formData, "headcount", 20),
      location: getString(formData, "location", 200),
      eventType: getString(formData, "event-type", 120),
      notes: getString(formData, "notes", 4000),
    };

    if (isInvalidPayload(payload)) {
      return redirect(withStatus(errorUrl, "validation"));
    }

    try {
      await sendViaResend(env, payload, request);
    } catch (error) {
      console.error("Sig's Kitchen contact delivery failed", error);
      return redirect(withStatus(errorUrl, "delivery"));
    }

    return redirect(successUrl);
  },
};

function getString(formData: FormData, key: string, maxLength = 0): string {
  const raw = formData.get(key);
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  return maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function isInvalidPayload(payload: ContactPayload): boolean {
  if (
    !payload.name ||
    !payload.email ||
    !payload.eventDate ||
    !payload.headcount ||
    !payload.location ||
    !payload.eventType
  ) {
    return true;
  }

  if (!EMAIL_REGEX.test(payload.email)) {
    return true;
  }

  const guests = Number.parseInt(payload.headcount, 10);
  if (!Number.isFinite(guests) || guests < 10 || guests > 100000) {
    return true;
  }

  return false;
}

async function sendViaResend(env: Env, payload: ContactPayload, request: Request): Promise<void> {
  if (!env.RESEND_API_KEY) {
    throw new Error("Missing RESEND_API_KEY");
  }

  const recipients = parseRecipientList(env.CONTACT_TO_EMAIL || DEFAULT_TO_EMAIL);
  if (!recipients.length) {
    throw new Error("Missing CONTACT_TO_EMAIL recipients");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.CONTACT_FROM_EMAIL || DEFAULT_FROM_EMAIL,
      to: recipients,
      reply_to: payload.email,
      subject: `New Sig's Kitchen Catering Inquiry - ${payload.name} - ${payload.eventType}`,
      html: buildHtmlEmail(payload, request),
      text: buildTextEmail(payload, request),
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend failed: ${response.status} ${await response.text()}`);
  }
}

function parseRecipientList(value: string): string[] {
  return value
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

function buildHtmlEmail(payload: ContactPayload, request: Request): string {
  const rows = [
    ["Name", payload.name],
    ["Phone", payload.phone || "Not provided"],
    ["Email", payload.email],
    ["Event date", payload.eventDate],
    ["Approx. headcount", payload.headcount],
    ["Event location", payload.location],
    ["Event type", payload.eventType],
    ["Notes", payload.notes || "None provided"],
    ["Submitted from", new URL(request.url).origin],
  ]
    .map(
      ([label, value]) =>
        `<tr><td style="padding:10px 12px;border:1px solid #d1d5db;font-weight:700;background:#f8f3e6;">${escapeHtml(
          label,
        )}</td><td style="padding:10px 12px;border:1px solid #d1d5db;">${escapeHtml(value).replace(/\n/g, "<br>")}</td></tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f5efe2;color:#111111;font-family:Arial,sans-serif;">
    <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e5d8b5;border-radius:12px;padding:24px;">
      <h1 style="margin:0 0 12px;font-size:26px;line-height:1.1;">New Sig's Kitchen catering inquiry</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#5b4630;">A customer submitted the live catering form on sigskitchen.com.</p>
      <table style="width:100%;border-collapse:collapse;font-size:15px;line-height:1.5;">${rows}</table>
    </div>
  </body>
</html>`;
}

function buildTextEmail(payload: ContactPayload, request: Request): string {
  return [
    "New Sig's Kitchen catering inquiry",
    "",
    `Name: ${payload.name}`,
    `Phone: ${payload.phone || "Not provided"}`,
    `Email: ${payload.email}`,
    `Event date: ${payload.eventDate}`,
    `Approx. headcount: ${payload.headcount}`,
    `Event location: ${payload.location}`,
    `Event type: ${payload.eventType}`,
    `Notes: ${payload.notes || "None provided"}`,
    `Submitted from: ${new URL(request.url).origin}`,
  ].join("\n");
}

function normalizeRedirectUrl(value: FormDataEntryValue | null, fallback: string): string {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  try {
    return new URL(value).toString();
  } catch {
    return fallback;
  }
}

function withStatus(baseUrl: string, status: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("status", status);
  return url.toString();
}

function redirect(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: location,
      ...corsHeaders(),
    },
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(),
    },
  });
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "https://sigskitchen.com",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
