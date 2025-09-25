const browserOrigin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3001"

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? browserOrigin
