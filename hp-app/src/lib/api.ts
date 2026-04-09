// API base URL — set VITE_API_URL in production (e.g. https://api.hostaposta.app)
// In local dev leave it unset and calls go to the same origin via Vite proxy.
export const API = import.meta.env.VITE_API_URL ?? '';

// Preview server URL — port 3002 locally, not yet exposed in production.
export const PREVIEW_URL = import.meta.env.VITE_PREVIEW_URL ?? 'http://localhost:3002';

export const IS_PROD = import.meta.env.PROD && !!import.meta.env.VITE_API_URL;
