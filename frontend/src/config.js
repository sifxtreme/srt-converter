export const API_BASE_URL = import.meta.env.PROD
  ? 'https://srt-api.sifxtre.me' // Replace with your production URL
  : 'http://localhost:3001';

export const API_ENDPOINTS = {
  LOGIN: '/auth/login',
  LOGOUT: '/auth/logout',
  AUTH_STATUS: '/auth/status',
  UPLOAD: '/upload',
  TRANSLATE: (setId) => `/translate/${setId}`,
  DOWNLOAD: (setId) => `/download/${setId}`,
  TRANSLATION_PROGRESS: (setId) => `/translation-progress/${setId}`,
};