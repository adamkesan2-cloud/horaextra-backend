// backend/src/utils/emailService.js
const nodemailer = require('nodemailer');

// ─────────────────────────────────────────────────────────────────────────────
// TRANSPORTER
// ─────────────────────────────────────────────────────────────────────────────
function createTransporter() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = parseInt(process.env.SMTP_PORT || '587');

  if (!host || !user || !pass) {
    console.warn('⚠️  emailService: SMTP não configurado — emails logados no console');
    return null;
  }

  return nodemailer.createTransport({
    host, port,
    secure: port === 465,
    auth: { user, pass },
  });
}

const transporter = createTransporter();
const FROM = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@horaextra.co.mz';
const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:3000';

// ─────────────────────────────────────────────────────────────────────────────
// FUNÇÃO BASE
// ─────────────────────────────────────────────────────────────────────────────
async function sendEmail({ to, subject, html, text }) {
  if (!transporter) {
    console.log(`📧 [DEV] Para: ${to} | Assunto: ${subject}`);
    if (text) console.log(`   ${text.slice(0, 200)}`);
    return { success: true, dev: true };
  }
  try {
    const info = await transporter.sendMail({ from: FROM, to, subject, html, text });
    console.log(`📧 Email enviado: ${info.messageId} → ${to}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`❌ emailService: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATES — ADMIN / PRESTADORES
// ─────────────────────────────────────────────────────────────────────────────

/** Prestador aprovado pelo admin */
async function sendProviderApprovedEmail(email, name = 'Prestador') {
  return sendEmail({
    to: email,
    subject: 'HoraExtra — A tua conta de prestador foi aprovada! 🎉',
    text: `Olá ${name}, a tua conta de prestador foi aprovada. Já podes receber pedidos na plataforma.`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto">
        <h2 style="color:#F97316">Parabéns, ${name}! 🎉</h2>
        <p>A tua conta de prestador de serviços na <strong>HoraExtra</strong> foi <strong>aprovada</strong>.</p>
        <p>Já podes fazer login e começar a receber pedidos de clientes.</p>
        <a href="${FRONTEND}/login"
           style="display:inline-block;background:#F97316;color:#fff;padding:12px 28px;
                  border-radius:8px;text-decoration:none;font-weight:bold;margin-top:8px">
          Entrar na plataforma
        </a>
        <p style="color:#888;font-size:12px;margin-top:24px">
          Se tiveres dúvidas, contacta-nos em suporte@horaextra.co.mz
        </p>
      </div>
    `,
  });
}

/** Prestador rejeitado pelo admin */
async function sendProviderRejectedEmail(email, name = 'Prestador', reason = '') {
  return sendEmail({
    to: email,
    subject: 'HoraExtra — Actualização sobre a tua conta de prestador',
    text: `Olá ${name}, infelizmente a tua conta de prestador não foi aprovada. ${reason ? 'Motivo: ' + reason : ''}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto">
        <h2 style="color:#374151">Olá, ${name}</h2>
        <p>Após análise, não foi possível aprovar a tua conta de prestador na <strong>HoraExtra</strong> neste momento.</p>
        ${reason ? `<p><strong>Motivo:</strong> ${reason}</p>` : ''}
        <p>Podes corrigir os dados e submeter novamente, ou contactar o nosso suporte para mais informações.</p>
        <a href="${FRONTEND}/support"
           style="display:inline-block;background:#374151;color:#fff;padding:12px 28px;
                  border-radius:8px;text-decoration:none;font-weight:bold;margin-top:8px">
          Contactar Suporte
        </a>
        <p style="color:#888;font-size:12px;margin-top:24px">
          suporte@horaextra.co.mz
        </p>
      </div>
    `,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATES — AUTENTICAÇÃO
// ─────────────────────────────────────────────────────────────────────────────

async function sendVerificationEmail(email, token, name = 'Utilizador') {
  const url = `${FRONTEND}/verify-email?token=${token}`;
  return sendEmail({
    to: email,
    subject: 'HoraExtra — Verifica o teu email',
    text: `Olá ${name}, verifica o teu email: ${url}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto">
        <h2 style="color:#F97316">Olá, ${name}!</h2>
        <p>Clica no botão abaixo para verificar o teu email:</p>
        <a href="${url}"
           style="display:inline-block;background:#F97316;color:#fff;padding:12px 28px;
                  border-radius:8px;text-decoration:none;font-weight:bold">
          Verificar Email
        </a>
        <p style="color:#888;font-size:12px;margin-top:24px">O link expira em 24 horas.</p>
      </div>
    `,
  });
}

async function sendPasswordResetEmail(email, token, name = 'Utilizador') {
  const url = `${FRONTEND}/reset-password?token=${token}`;
  return sendEmail({
    to: email,
    subject: 'HoraExtra — Recuperação de senha',
    text: `Olá ${name}, recupera a tua senha: ${url}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto">
        <h2 style="color:#F97316">Olá, ${name}!</h2>
        <p>Recebemos um pedido para repor a tua senha:</p>
        <a href="${url}"
           style="display:inline-block;background:#F97316;color:#fff;padding:12px 28px;
                  border-radius:8px;text-decoration:none;font-weight:bold">
          Repor Senha
        </a>
        <p style="color:#888;font-size:12px;margin-top:24px">
          Expira em 1 hora. Se não pediste isto, ignora este email.
        </p>
      </div>
    `,
  });
}

async function sendWelcomeEmail(email, name = 'Utilizador') {
  return sendEmail({
    to: email,
    subject: 'Bem-vindo(a) à HoraExtra!',
    text: `Olá ${name}, a tua conta foi criada com sucesso!`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto">
        <h2 style="color:#F97316">Bem-vindo(a) à HoraExtra, ${name}! 🎉</h2>
        <p>A tua conta foi criada com sucesso. Já podes começar a usar a plataforma.</p>
      </div>
    `,
  });
}

async function sendNotificationEmail(email, subject, message, name = 'Utilizador') {
  return sendEmail({
    to: email,
    subject,
    text: message,
    html: `<div style="font-family:sans-serif"><h2>Olá, ${name}!</h2><p>${message}</p></div>`,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  sendEmail,
  sendProviderApprovedEmail,
  sendProviderRejectedEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendNotificationEmail,
};