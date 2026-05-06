const twilio = require('twilio');
const logger = require('../../utils/logger');

let client;

// Inicializar cliente Twilio
const initClient = () => {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  }
};

// Enviar SMS
const sendSMS = async ({ to, message }) => {
  try {
    if (!client) {
      initClient();
    }

    if (!client) {
      logger.warn('Twilio não configurado. SMS não enviado.');
      return { simulated: true, to, message };
    }

    const result = await client.messages.create({
      body: message,
      to,
      from: process.env.TWILIO_PHONE_NUMBER
    });

    logger.info(`SMS enviado para ${to}: ${result.sid}`);
    return result;

  } catch (error) {
    logger.error('Erro ao enviar SMS:', error);
    
    // Em desenvolvimento, apenas log
    if (process.env.NODE_ENV === 'development') {
      logger.info(`[DEV] SMS para ${to}: ${message}`);
      return { simulated: true, to, message };
    }
    
    throw error;
  }
};

// Enviar código de verificação
const sendVerificationCode = async (phone, code) => {
  const message = `Seu código de verificação HoraExtra é: ${code}. Válido por 10 minutos.`;
  return sendSMS({ to: phone, message });
};

// Enviar notificação de novo pedido
const sendNewRequestNotification = async (phone, data) => {
  const message = `Novo pedido de serviço: ${data.serviceName}. Acesse o app para ver detalhes.`;
  return sendSMS({ to: phone, message });
};

// Enviar confirmação de agendamento
const sendAppointmentConfirmation = async (phone, data) => {
  const message = `Seu serviço foi agendado para ${data.date} às ${data.time}. O prestador ${data.providerName} foi notificado.`;
  return sendSMS({ to: phone, message });
};

module.exports = { 
  sendSMS, 
  sendVerificationCode, 
  sendNewRequestNotification,
  sendAppointmentConfirmation 
};