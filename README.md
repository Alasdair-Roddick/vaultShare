# Vaultlight – Encrypted Media Albums

Vaultlight is a secure image and video sharing platform built with a Vite + React frontend and a hardened Express backend. Every upload is encrypted with AES-256-GCM at rest and decrypted only when streamed to the browser. MOV uploads are automatically converted to MP4 for broad playback support.

## Feature Highlights

- AES-256-GCM encryption with per-file IV and auth tag (legacy CBC files still stream).
- Automatic MOV to MP4 conversion powered by FFmpeg (`ffmpeg-static`).
- Album-based sharing with opaque permalinks.
- Streaming decryption so large videos never load fully into memory.
- Hardened CORS + Helmet configuration and a Tailwind-powered UI.

## Project Structure

```
root
├── src/                # React + Tailwind frontend
├── backend/            # Express API + SQLite persistence
├── public/
└── ...
```

## Prerequisites

- Node.js 20+ (for both frontend and backend tooling)
- npm 9+
- No system FFmpeg required (the backend ships with `ffmpeg-static`)

## Setup

1. Install root dependencies (frontend):
   ```bash
   npm install
   ```
2. Install backend dependencies:
   ```bash
   cd backend
   npm install
   ```
3. Create `backend/.env` with at least:
   ```ini
   ENCRYPTION_KEY= # 64 hex chars (32 bytes) or base64 32-byte key
   CLIENT_ORIGINS=http://localhost:5173 # optional, comma-separated
   MAX_FILE_SIZE_BYTES=104857600        # optional override (default 100MB)
   ```
   Generate a strong key (hex example):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
4. (Optional) Configure the frontend API origin in `.env`:
   ```ini
   VITE_API_BASE_URL=http://localhost:3001
   ```

## Running Locally

In two terminals:

```bash
# Terminal 1 – backend
cd backend
npm run dev

# Terminal 2 – frontend
npm run dev
```

- Backend listens on `http://localhost:3001` by default.
- Frontend dev server runs on `http://localhost:5173`.

## Key Endpoints

| Method | Endpoint             | Description                                                |
| ------ | -------------------- | ---------------------------------------------------------- |
| POST   | `/upload`            | Accepts `FormData` field `files[]`, encrypts, and stores.  |
| GET    | `/album/:permalink`  | Returns album metadata (`filename`, `type`, `size`).       |
| GET    | `/uploads/:filename` | Streams decrypted media (image or video) inline.           |

## Security Notes

- Encryption happens before data touches persistent storage; temporary files are deleted immediately after encryption.
- MOV uploads are transcoded to H.264/AAC MP4 to guarantee playback in modern browsers.
- Streaming decryption keeps memory usage stable for large videos.
- Use `CLIENT_ORIGINS` to restrict CORS in production.
- Rotate `ENCRYPTION_KEY` periodically (requires re-encrypting existing assets).

## Styling

The frontend uses Tailwind CSS (`tailwind.config.js`) with a custom brand palette. Modify `tailwind.config.js` and `src/index.css` to extend the design system.

## Legacy Compatibility

Existing files stored with the previous AES-256-CBC scheme remain accessible—the download route detects missing auth tags and falls back to the legacy decryptor.

---

Need help with deployment hardening (HTTPS termination, reverse proxy, key rotation)? Document those environment assumptions before shipping.
