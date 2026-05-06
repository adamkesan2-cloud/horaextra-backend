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
      subject: 'Cadastro aprovado — HoraExtra',
      html: `<div style="font-family:Arial,sans-serif;padding:24px"><h2>Parabéns, ${user.name}!</h2><p>O seu cadastro foi <strong>aprovado</strong>. Já pode fazer login.</p></div>`,
    });
    console.log('📧 Email de aprovação enviado para:', user.email);
  } catch (e) {
    console.warn('⚠️ Falha ao enviar email:', e.message);
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
      subject: 'Cadastro não aprovado — HoraExtra',
      html: `<div style="font-family:Arial,sans-serif;padding:24px"><h2>Olá, ${user.name}</h2><p>O seu cadastro não foi aprovado desta vez.</p></div>`,
    });
    console.log('📧 Email de rejeição enviado para:', user.email);
  } catch (e) {
    console.warn('⚠️ Falha ao enviar email:', e.message);
  }
};
