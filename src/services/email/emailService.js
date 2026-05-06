// backend/src/utils/emailService.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

exports.sendProviderApprovedEmail = async (user) => {
  if (!process.env.SMTP_USER) {
    console.log('📧 SMTP não configurado — ignorando email para:', user.email);
    return;
  }
  try {
    await transporter.sendMail({
      from: `"HoraExtra" <${process.env.SMTP_USER}>`,
      to: user.email,
      subject: '✅ Cadastro aprovado — HoraExtra',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2 style="color:#1E3A5F">Parabéns, ${user.name}!</h2>
          <p>O seu cadastro como prestador na <strong>HoraExtra</strong> foi <strong style="color:#22c55e">aprovado</strong>.</p>
          <p>Já pode fazer login e começar a receber solicitações de serviço.</p>
          <a href="${process.env.APP_URL || 'http://localhost:4000'}"
             style="display:inline-block;margin-top:16px;padding:12px 24px;background:#1E3A5F;color:white;border-radius:8px;text-decoration:none;font-weight:bold">
            Entrar na plataforma
          </a>
          <p style="margin-top:32px;color:#888;font-size:12px">Equipa HoraExtra</p>
        </div>
      `,
    });
    console.log('📧 Email de aprovação enviado para:', user.email);
  } catch (e) {
    console.warn('⚠️ Falha ao enviar email de aprovação:', e.message);
  }
};

exports.sendProviderRejectedEmail = async (user) => {
  if (!process.env.SMTP_USER) {
    console.log('📧 SMTP não configurado — ignorando email para:', user.email);
    return;
  }
  try {
    await transporter.sendMail({
      from: `"HoraExtra" <${process.env.SMTP_USER}>`,
      to: user.email,
      subject: '❌ Cadastro não aprovado — HoraExtra',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2 style="color:#1E3A5F">Olá, ${user.name}</h2>
          <p>Infelizmente o seu cadastro como prestador na <strong>HoraExtra</strong> não foi aprovado desta vez.</p>
          <p>Pode tentar novamente com documentos actualizados.</p>
          <p style="margin-top:32px;color:#888;font-size:12px">Equipa HoraExtra</p>
        </div>
      `,
    });
    console.log('📧 Email de rejeição enviado para:', user.email);
  } catch (e) {
    console.warn('⚠️ Falha ao enviar email de rejeição:', e.message);
  }
};