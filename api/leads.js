const PRODUCTION_ORIGINS = new Set([
  "https://pacificpurity.com",
  "https://www.pacificpurity.com",
]);

const MAX_FIELD_LENGTHS = {
  name: 120,
  email: 254,
  phone: 40,
  neighborhood: 120,
  source: 120,
  productInterest: 120,
  capacity: 40,
  installationContext: 80,
  pagePath: 300,
  pageUrl: 1000,
  submissionId: 120,
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalize(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function safeEmail(value) {
  const email = normalize(value, MAX_FIELD_LENGTHS.email).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function parseLead(payload) {
  return {
    name: normalize(payload.name, MAX_FIELD_LENGTHS.name),
    email: safeEmail(payload.email),
    phone: normalize(payload.phone, MAX_FIELD_LENGTHS.phone),
    neighborhood: normalize(payload.neighborhood, MAX_FIELD_LENGTHS.neighborhood),
    source: normalize(payload.source, MAX_FIELD_LENGTHS.source) || "Pacific Purity website",
    productInterest: normalize(payload.productInterest, MAX_FIELD_LENGTHS.productInterest) || "General water audit",
    capacity: normalize(payload.capacity, MAX_FIELD_LENGTHS.capacity),
    installationContext: normalize(payload.installationContext, MAX_FIELD_LENGTHS.installationContext),
    pagePath: normalize(payload.pagePath, MAX_FIELD_LENGTHS.pagePath),
    pageUrl: normalize(payload.pageUrl, MAX_FIELD_LENGTHS.pageUrl),
    submittedAt: normalize(payload.submittedAt, 80) || new Date().toISOString(),
    submissionId: normalize(payload.submissionId, MAX_FIELD_LENGTHS.submissionId) || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    website: normalize(payload.website, 200),
  };
}

async function parseJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body);

  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 16_000) throw new Error("Request body is too large.");
  }
  return body ? JSON.parse(body) : {};
}

async function sendResendEmail({ apiKey, payload, idempotencyKey }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Resend delivery failed (${response.status}): ${details.slice(0, 180)}`);
  }

  return response.json().catch(() => ({}));
}

function notificationEmail(lead, from, notificationTo) {
  const rows = [
    ["Name", lead.name],
    ["Email", lead.email],
    ["Phone", lead.phone],
    ["Neighborhood", lead.neighborhood || "Not provided"],
    ["Product interest", lead.productInterest],
    ["Capacity", lead.capacity || "Not selected"],
    ["Installation context", lead.installationContext || "Not selected"],
    ["Form source", lead.source],
    ["Submitted", lead.submittedAt],
    ["Page", lead.pageUrl || lead.pagePath || "Not available"],
  ];

  const htmlRows = rows
    .map(([label, value]) => `<tr><td style="padding:8px 12px;border:1px solid #dbe5e9;font-weight:700;vertical-align:top">${escapeHtml(label)}</td><td style="padding:8px 12px;border:1px solid #dbe5e9;vertical-align:top">${escapeHtml(value)}</td></tr>`)
    .join("");
  const textRows = rows.map(([label, value]) => `${label}: ${value}`).join("\n");

  return {
    from,
    to: [notificationTo],
    reply_to: lead.email,
    subject: `New Pacific Purity audit request — ${lead.productInterest}`,
    html: `<!doctype html><html><body style="margin:0;background:#eef5f5;font-family:Arial,Helvetica,sans-serif;color:#102033"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden"><tr><td style="padding:24px 28px;background:#102033;color:#ffffff"><p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#cff969">New website lead</p><h1 style="margin:0;font-size:28px;line-height:34px">Free in-home water audit</h1></td></tr><tr><td style="padding:28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;line-height:20px">${htmlRows}</table><p style="margin:24px 0 0;font-size:13px;line-height:20px;color:#526577">Reply directly to this message to contact the lead at ${escapeHtml(lead.email)}.</p></td></tr></table></td></tr></table></body></html>`,
    text: `NEW PACIFIC PURITY AUDIT REQUEST\n\n${textRows}\n\nReply directly to this message to contact the lead.`,
    tags: [
      { name: "type", value: "website-lead" },
      { name: "product", value: lead.productInterest.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "general" },
    ],
  };
}

function acknowledgementEmail(lead, from, notificationTo) {
  const firstName = escapeHtml(lead.name.split(/\s+/)[0] || "there");
  return {
    from,
    to: [lead.email],
    reply_to: notificationTo,
    subject: "We received your Pacific Purity audit request",
    html: `<!doctype html><html><body style="margin:0;background:#eef5f5;font-family:Arial,Helvetica,sans-serif;color:#102033"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden"><tr><td style="padding:24px 28px;background:#102033;color:#ffffff"><p style="margin:0;font-size:20px;font-weight:700">Pacific Purity</p></td></tr><tr><td style="padding:30px 28px"><h1 style="margin:0 0 14px;font-size:28px;line-height:34px">Thanks, ${firstName}.</h1><p style="margin:0 0 16px;font-size:16px;line-height:24px">We received your request for a free in-home water audit. A Pacific Purity team member will contact you to schedule a time.</p><p style="margin:0;font-size:14px;line-height:21px;color:#526577">Your request: ${escapeHtml(lead.productInterest)}<br>Neighborhood: ${escapeHtml(lead.neighborhood || "to be confirmed")}</p></td></tr></table></td></tr></table></body></html>`,
    text: `Thanks, ${lead.name.split(/\s+/)[0] || "there"}. We received your request for a free Pacific Purity in-home water audit. A team member will contact you to schedule a time.\n\nYour request: ${lead.productInterest}\nNeighborhood: ${lead.neighborhood || "to be confirmed"}`,
    tags: [{ name: "type", value: "website-lead-acknowledgement" }],
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Method not allowed." });
  }

  const origin = req.headers?.origin;
  if (origin && !PRODUCTION_ORIGINS.has(origin)) {
    return res.status(403).json({ ok: false, message: "Request origin is not allowed." });
  }

  try {
    const lead = parseLead(await parseJsonBody(req));
    if (lead.website) return res.status(200).json({ ok: true, acknowledgementSent: false });

    if (!lead.name || !lead.email || !lead.phone) {
      return res.status(400).json({ ok: false, message: "Please provide your name, email, and phone number." });
    }

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.LEAD_FROM;
    const notificationTo = process.env.LEAD_NOTIFICATION_TO;
    if (!apiKey || !from || !notificationTo) {
      console.error("Lead endpoint configuration is incomplete.");
      return res.status(503).json({ ok: false, message: "Lead delivery is temporarily unavailable. Please email hi@pacificpurity.com." });
    }

    await sendResendEmail({
      apiKey,
      payload: notificationEmail(lead, from, notificationTo),
      idempotencyKey: `pacific-purity-lead-${lead.submissionId}-internal`,
    });

    let acknowledgementSent = true;
    try {
      await sendResendEmail({
        apiKey,
        payload: acknowledgementEmail(lead, from, notificationTo),
        idempotencyKey: `pacific-purity-lead-${lead.submissionId}-ack`,
      });
    } catch (error) {
      acknowledgementSent = false;
      console.error("Lead acknowledgement delivery failed after internal notification.", error instanceof Error ? error.message : "Unknown error");
    }

    return res.status(200).json({ ok: true, acknowledgementSent });
  } catch (error) {
    console.error("Lead submission failed.", error instanceof Error ? error.message : "Unknown error");
    return res.status(500).json({ ok: false, message: "We could not submit your request. Please try again or email hi@pacificpurity.com." });
  }
}
