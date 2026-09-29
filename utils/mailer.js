const nodemailer = require("nodemailer");

function mailConfig() {
    const host = String(process.env.SMTP_HOST || "").trim();
    const user = String(process.env.SMTP_USER || "").trim();
    const pass = String(process.env.SMTP_PASS || "").trim();
    const port = Number(process.env.SMTP_PORT || 587);
    const from = String(process.env.SMTP_FROM || user || "").trim();
    return { host, user, pass, port, from };
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
    ));
}
function isMailConfigured() {
    const { host, user, pass, from } = mailConfig();
    return Boolean(host && user && pass && from);
}

async function sendStaffWelcomeEmail({ to, name, temporaryCode }) {
    if (!isMailConfigured()) {
        return {
            sent: false,
            message:
                "Welcome email is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM.",
        };
    }

    const { host, port, user, pass, from } = mailConfig();
    const loginUrl = String(process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
    const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
    });

    const safeName = String(name || "there").trim();
    const text = [
        `Hello ${safeName},`,
        "",
        "Welcome to Edvora!",
        "",
        "Your staff account has been successfully created by your School Admin.",
        "",
        `Email: ${to}`,
        `Temporary Login Code: ${temporaryCode}`,
        "",
        "Use this temporary code to log in for the first time.",
        "After your first login, you will be required to create a new password for your account.",
        "This code stays valid until you create that password. It does not expire by time.",
        "",
        `Login: ${loginUrl}`,
        "",
        "Regards,",
        "Edvora Team",
    ].join("\n");

    await transporter.sendMail({
        from,
        to,
        subject: "Welcome to Edvora – Your Staff Account",
        text,
        html: `
          <p>Hello ${escapeHtml(safeName)},</p>
          <p>Welcome to Edvora!</p>
          <p>Your staff account has been successfully created by your School Admin.</p>
          <p><strong>Email:</strong> ${escapeHtml(to)}<br/>
          <strong>Temporary Login Code:</strong> ${escapeHtml(temporaryCode)}</p>
          <p>Use this temporary code to log in for the first time.</p>
          <p>After your first login, you will be required to create a new password for your account.</p>
          <p>This code stays valid until you create that password. It does not expire by time.</p>
          <p>Login: <a href="${loginUrl}">Edvora Staff Portal</a></p>
          <p>Regards,<br/>Edvora Team</p>
        `,
    });

    return { sent: true };
}

module.exports = { sendStaffWelcomeEmail, isMailConfigured };
