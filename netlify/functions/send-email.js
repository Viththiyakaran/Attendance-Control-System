const nodemailer = require("nodemailer");
const { PNG } = require("pngjs");
const QRCode = require("qrcode");

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured in Netlify environment variables.`);
  }
  return value;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

const LETTERS = {
  H: ["1001", "1001", "1001", "1111", "1001", "1001", "1001"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  S: ["0111", "1000", "1000", "0110", "0001", "0001", "1110"],
};

function setPixel(png, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const index = (png.width * y + x) << 2;
  png.data[index] = r;
  png.data[index + 1] = g;
  png.data[index + 2] = b;
  png.data[index + 3] = a;
}

function fillRect(png, x, y, width, height, color) {
  for (let row = y; row < y + height; row += 1) {
    for (let col = x; col < x + width; col += 1) {
      setPixel(png, col, row, ...color);
    }
  }
}

function strokeRect(png, x, y, width, height, color, thickness = 2) {
  fillRect(png, x, y, width, thickness, color);
  fillRect(png, x, y + height - thickness, width, thickness, color);
  fillRect(png, x, y, thickness, height, color);
  fillRect(png, x + width - thickness, y, thickness, height, color);
}

function drawLetter(png, letter, x, y, scale, color) {
  const rows = LETTERS[letter];
  rows.forEach((row, rowIndex) => {
    [...row].forEach((pixel, columnIndex) => {
      if (pixel === "1") {
        fillRect(png, x + columnIndex * scale, y + rowIndex * scale, scale, scale, color);
      }
    });
  });
}

function addHtsBadge(buffer) {
  const png = PNG.sync.read(buffer);
  const badgeWidth = 76;
  const badgeHeight = 42;
  const badgeX = Math.round((png.width - badgeWidth) / 2);
  const badgeY = Math.round((png.height - badgeHeight) / 2);
  const white = [255, 255, 255, 255];
  const green = [0, 122, 97, 255];
  const black = [20, 31, 27, 255];

  fillRect(png, badgeX, badgeY, badgeWidth, badgeHeight, white);
  strokeRect(png, badgeX, badgeY, badgeWidth, badgeHeight, green, 3);

  const scale = 4;
  const letterGap = 5;
  const textWidth = 4 * scale + letterGap + 5 * scale + letterGap + 4 * scale;
  const startX = Math.round((png.width - textWidth) / 2);
  const startY = Math.round((png.height - 7 * scale) / 2);

  drawLetter(png, "H", startX, startY, scale, black);
  drawLetter(png, "T", startX + 4 * scale + letterGap, startY, scale, black);
  drawLetter(png, "S", startX + 4 * scale + letterGap + 5 * scale + letterGap, startY, scale, black);

  return PNG.sync.write(png);
}

async function createQrPassBuffer(passUrl) {
  const buffer = await QRCode.toBuffer(passUrl, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: 320,
    color: {
      dark: "#111f1b",
      light: "#ffffff",
    },
  });
  return addHtsBadge(buffer);
}

async function createApprovalHtml({ body, passUrl, token, fullName, qidNumber }) {
  if (!passUrl) return body.replace(/\n/g, "<br>");

  return `
    <div style="font-family:Arial,sans-serif;color:#17211d;line-height:1.5">
      <h2 style="margin:0 0 12px;font-size:22px">Facility access approved</h2>
      <p>Your HTS QR pass is ready.</p>
      <div style="border:1px solid #d8e0dc;border-radius:8px;padding:16px;max-width:420px;background:#fbfcfb">
        <div style="font-size:13px;color:#007a61;font-weight:700;letter-spacing:.02em">HTS QR PASS</div>
        ${fullName ? `<p style="margin:8px 0 0"><strong>Name:</strong> ${escapeHtml(fullName)}</p>` : ""}
        ${qidNumber ? `<p style="margin:4px 0 0"><strong>QID:</strong> ${escapeHtml(qidNumber)}</p>` : ""}
        <p style="margin:4px 0 12px"><strong>Pass token:</strong> ${escapeHtml(token || "")}</p>
        <img src="cid:hts-qr-pass" width="260" height="260" alt="HTS QR pass" style="display:block;border:8px solid #ffffff;max-width:260px" />
        <p style="margin:12px 0 0">
          <a href="${escapeHtml(passUrl)}" style="color:#007a61;font-weight:700">Open QR pass</a>
        </p>
      </div>
      <p style="margin-top:14px;font-size:13px;color:#54615c">If the QR image does not show, open the pass link above.</p>
      <pre style="white-space:pre-wrap;font-family:Arial,sans-serif;font-size:13px;color:#54615c">${escapeHtml(body)}</pre>
    </div>
  `;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: "Method not allowed" }) };
  }

  try {
    const { to, subject, body, passUrl, token, fullName, qidNumber } = JSON.parse(event.body || "{}");
    if (!to || !subject || !body) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: "Missing to, subject, or body" }) };
    }

    const gmailUser = getRequiredEnv("GMAIL_USER");
    const gmailPassword = getRequiredEnv("GMAIL_APP_PASSWORD").replace(/\s+/g, "");
    const qrBuffer = passUrl ? await createQrPassBuffer(passUrl) : null;
    const html = await createApprovalHtml({ body, passUrl, token, fullName, qidNumber });
    const attachments = qrBuffer ? [{
      filename: "hts-qr-pass.png",
      content: qrBuffer,
      cid: "hts-qr-pass",
    }] : [];

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: gmailUser,
        pass: gmailPassword,
      },
    });

    const delivery = await transporter.sendMail({
      from: `"HTS Access" <${gmailUser}>`,
      to,
      subject,
      text: body,
      html,
      attachments,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        messageId: delivery.messageId,
        accepted: delivery.accepted || [],
        rejected: delivery.rejected || [],
        response: delivery.response || "",
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: error.message }),
    };
  }
};
