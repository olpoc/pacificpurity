const PRODUCTION_ORIGINS = new Set([
  "https://pacificpurity.com",
  "https://www.pacificpurity.com",
]);

const BRAND = {
  name: "Pacific Purity",
  navy: "#102033",
  aqua: "#5ED8E8",
  lime: "#CFF969",
  mist: "#EEF5F5",
  slate: "#526577",
  border: "#D7E2E7",
  logoUrl: "https://pacificpurity.com/manus-storage/pacific-purity-double-droplet.png",
};

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

function documentStart(title) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0; padding:0; background-color:${BRAND.mist};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; background-color:${BRAND.mist};">
    <tr>
      <td align="center" bgcolor="${BRAND.mist}" style="padding-top:28px; padding-right:16px; padding-bottom:28px; padding-left:16px; background-color:${BRAND.mist};">`;
}

function documentEnd() {
  return `</td>
    </tr>
  </table>
</body>
</html>`;
}

function brandHeader(kicker, heading, eyebrowColor = BRAND.lime) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; background-color:${BRAND.navy};">
  <tr>
    <td bgcolor="${BRAND.navy}" style="padding-top:26px; padding-right:30px; padding-bottom:26px; padding-left:30px; background-color:${BRAND.navy};">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td valign="middle" style="padding-right:10px;">
            <img src="${BRAND.logoUrl}" alt="Pacific Purity" width="38" height="38" border="0" style="display:block; width:38px; height:38px; border:0;">
          </td>
          <td valign="middle">
            <p style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:18px; line-height:22px; font-weight:700; color:#FFFFFF;">Pacific Purity</p>
          </td>
        </tr>
      </table>
      <p style="margin-top:22px; margin-right:0; margin-bottom:7px; margin-left:0; font-family:Arial, Helvetica, sans-serif; font-size:11px; line-height:15px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:${eyebrowColor};">${escapeHtml(kicker)}</p>
      <h1 style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:28px; line-height:34px; font-weight:700; color:#FFFFFF;">${escapeHtml(heading)}</h1>
    </td>
  </tr>
</table>`;
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
    .map(([label, value]) => `<tr>
      <td valign="top" bgcolor="${BRAND.mist}" style="width:34%; padding-top:10px; padding-right:12px; padding-bottom:10px; padding-left:12px; border-top:1px solid ${BRAND.border}; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:19px; font-weight:700; color:${BRAND.navy}; background-color:${BRAND.mist};">${escapeHtml(label)}</td>
      <td valign="top" style="padding-top:10px; padding-right:12px; padding-bottom:10px; padding-left:12px; border-top:1px solid ${BRAND.border}; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:19px; color:${BRAND.navy};">${escapeHtml(value)}</td>
    </tr>`)
    .join("");
  const textRows = rows.map(([label, value]) => `${label}: ${value}`).join("\n");

  return {
    from,
    to: [notificationTo],
    reply_to: lead.email,
    subject: `New Pacific Purity audit request — ${lead.productInterest}`,
    html: `${documentStart("New Pacific Purity audit request")}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:640px; background-color:#FFFFFF; border:1px solid ${BRAND.border}; border-radius:18px; overflow:hidden;">
        <tr>
          <td>${brandHeader("New website lead", "Free in-home water audit")}</td>
        </tr>
        <tr>
          <td style="padding-top:28px; padding-right:30px; padding-bottom:30px; padding-left:30px;">
            <p style="margin-top:0; margin-right:0; margin-bottom:18px; margin-left:0; font-family:Arial, Helvetica, sans-serif; font-size:16px; line-height:24px; color:${BRAND.navy};">A new Pacific Purity audit request is ready for follow-up.</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; border-right:1px solid ${BRAND.border}; border-bottom:1px solid ${BRAND.border}; border-left:1px solid ${BRAND.border}; border-collapse:separate; border-spacing:0;">
              ${htmlRows}
            </table>
            <p style="margin-top:22px; margin-right:0; margin-bottom:0; margin-left:0; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:20px; color:${BRAND.slate};">Reply directly to this message to contact the lead at <a href="mailto:${escapeHtml(lead.email)}" style="color:${BRAND.navy}; font-weight:700; text-decoration:underline;">${escapeHtml(lead.email)}</a>.</p>
          </td>
        </tr>
      </table>
    ${documentEnd()}`,
    text: `PACIFIC PURITY — NEW WEBSITE LEAD\n\nFree in-home water audit\n\n${textRows}\n\nReply directly to this message to contact the lead.`,
    tags: [
      { name: "type", value: "website-lead" },
      { name: "product", value: lead.productInterest.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "general" },
    ],
  };
}

function acknowledgementEmail(lead, from, notificationTo) {
  const firstName = escapeHtml(lead.name.split(/\s+/)[0] || "there");
  const productInterest = escapeHtml(lead.productInterest);
  const neighborhood = escapeHtml(lead.neighborhood || "to be confirmed");

  return {
    from,
    to: [lead.email],
    reply_to: notificationTo,
    subject: "We received your Pacific Purity audit request",
    html: `${documentStart("Pacific Purity audit request received")}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:600px; background-color:#FFFFFF; border:1px solid ${BRAND.border}; border-radius:18px; overflow:hidden;">
        <tr>
          <td>${brandHeader("Audit request received", `Thanks, ${lead.name.split(/\s+/)[0] || "there"}.`, BRAND.aqua)}</td>
        </tr>
        <tr>
          <td style="padding-top:30px; padding-right:30px; padding-bottom:18px; padding-left:30px;">
            <p style="margin-top:0; margin-right:0; margin-bottom:16px; margin-left:0; font-family:Arial, Helvetica, sans-serif; font-size:16px; line-height:25px; color:${BRAND.navy};">We received your request for a free in-home water audit. A Pacific Purity team member will contact you to schedule a time.</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; background-color:${BRAND.mist}; border-radius:12px;">
              <tr>
                <td bgcolor="${BRAND.mist}" style="padding-top:17px; padding-right:18px; padding-bottom:17px; padding-left:18px; background-color:${BRAND.mist};">
                  <p style="margin-top:0; margin-right:0; margin-bottom:5px; margin-left:0; font-family:Arial, Helvetica, sans-serif; font-size:11px; line-height:15px; font-weight:700; letter-spacing:1.2px; text-transform:uppercase; color:${BRAND.slate};">Your request</p>
                  <p style="margin-top:0; margin-right:0; margin-bottom:4px; margin-left:0; font-family:Arial, Helvetica, sans-serif; font-size:16px; line-height:23px; font-weight:700; color:${BRAND.navy};">${productInterest}</p>
                  <p style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:20px; color:${BRAND.slate};">Neighborhood: ${neighborhood}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding-top:4px; padding-right:30px; padding-bottom:30px; padding-left:30px;">
            <p style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:20px; color:${BRAND.slate};">Need to add a detail? Reply to this email and the Pacific Purity team will see it.</p>
          </td>
        </tr>
      </table>
    ${documentEnd()}`,
    text: `Pacific Purity\n\nThanks, ${firstName}.\n\nWe received your request for a free in-home water audit. A Pacific Purity team member will contact you to schedule a time.\n\nYour request: ${productInterest}\nNeighborhood: ${neighborhood}\n\nNeed to add a detail? Reply to this email and the Pacific Purity team will see it.`,
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
