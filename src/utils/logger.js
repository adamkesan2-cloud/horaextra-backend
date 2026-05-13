// logger.js simplificado - sem winston
const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  debug: (...args) => console.debug('[DEBUG]', ...args),
  stream: {
    write: (message) => console.log(message.trim())
  }
};

module.exports = logger;