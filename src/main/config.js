// Конфигурация API.
// Для локальной работы замените значения ниже на свои.
export const GREEN_API_CONFIG = {
  idInstance: process.env.GREEN_API_ID || 'YOUR_ID_INSTANCE',
  apiTokenInstance: process.env.GREEN_API_TOKEN || 'YOUR_API_TOKEN',
  host: process.env.GREEN_API_HOST || 'https://7107.api.greenapi.com',
  apiUrl: process.env.GREEN_API_URL || 'https://7107.api.greenapi.com',
  geminiKey: process.env.GEMINI_API_KEY || 'YOUR_GEMINI_KEY'
}