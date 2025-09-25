# Vaultlight – Encrypted Media Albums

Vaultlight is a secure image and video sharing platform built with a Vite + React frontend and a hardened Express backend. Every upload is encrypted with AES-256-GCM at rest and decrypted only when streamed to the browser. MOV uploads are automatically converted to MP4 for broad playback support.

## Feature Highlights

- AES-256-GCM encryption with per-file IV and auth tag (legacy CBC files still stream).
- Automatic MOV → MP4 conversion powered by FFmpeg (`ffmpeg-static`).
- Album-based sharing with opaque permalinks.
- Streaming decryption so large videos never fully load into memory.
- Hardened Helmet configuration, CORS restrictions, and Tailwind-powered UI.

## Project Structure

```
root
├── src/                # React + Tailwind frontend
├── backend/            # Express API + SQLite persistence
├── public/
└── ...
```

## Prerequisites

- Node.js 20+ and npm 9+
- No system FFmpeg required (`ffmpeg-static` is bundled)

## Backend Environment

Create `backend/.env` with at least:

```ini
ENCRYPTION_KEY= # 64 hex chars (32 bytes) or base64-encoded 32-byte key
CLIENT_ORIGINS=https://localhost:4311,http://localhost:4311
MAX_FILE_SIZE_BYTES=104857600           # optional override (default 100 MB)
PORT=4311                               # listening port
DATABASE_PATH=/app/data/database.db     # SQLite location (inside container)
TLS_CERT_PATH=/app/certs/dev-cert.pem   # optional – enable HTTPS when present
TLS_KEY_PATH=/app/certs/dev-key.pem     # optional – enable HTTPS when present
# TLS_CA_PATH=/app/certs/ca.pem         # optional chain bundle
# TLS_PASSPHRASE=                       # optional private key passphrase
```

Generate a strong encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### HTTPS Certificates

Vaultlight can serve HTTPS directly when `TLS_CERT_PATH` and `TLS_KEY_PATH` are provided. For local certificates you can use [mkcert](https://github.com/FiloSottile/mkcert):

```bash
mkcert -install
mkcert -key-file certs/dev-key.pem -cert-file certs/dev-cert.pem 192.168.1.126 localhost
```

The Compose file mounts `./certs` read-only at `/app/certs`; keep real/private certificates outside of source control (the directory is excluded via `.dockerignore`).

## Running Locally (development mode)

In two terminals:

```bash
# Terminal 1 – backend (HTTP by default)
cd backend
npm install
npm run dev

# Terminal 2 – frontend dev server
npm install
npm run dev
```

- Backend listens on `http://localhost:3001` unless `PORT` is provided.
- Frontend dev server runs on `http://localhost:5173` and proxies to the backend via `VITE_API_BASE_URL` (default fallback is the current origin).

## Docker Compose Runtime

A production-ish stack ships via `docker-compose.yml`, exposing HTTPS on port `4311`.

```bash
docker compose up --build -d
```

Environment summary:

- `PORT=4311` – HTTPS listener inside the container.
- `DATABASE_PATH=/app/data/database.db` – SQLite location (bind-mounted).
- `TLS_CERT_PATH` / `TLS_KEY_PATH` – mount TLS material from `./certs`.

Volumes `./storage/uploads` and `./storage/database` are bind-mounted; ensure they are writable (`chmod 775 storage/uploads storage/database` on Linux / adjust ACLs on Windows). After the stack is running with a trusted certificate, open `https://<host-ip>:4311` across your network.

## Key Endpoints

| Method | Endpoint             | Description                                                |
| ------ | -------------------- | ---------------------------------------------------------- |
| POST   | `/upload`            | Accepts `FormData` field `files[]`, encrypts, and stores.  |
| GET    | `/album/:permalink`  | Returns album metadata (`filename`, `type`, `size`).       |
| GET    | `/uploads/:filename` | Streams decrypted media (image or video) inline.           |

## Security Notes

- Encryption happens before data touches persistent storage; temp files are removed after encryption.
- MOV uploads transcode to H.264/AAC MP4 to guarantee playback across browsers.
- Streaming decryption keeps memory usage stable for large media.
- `CLIENT_ORIGINS` restricts CORS; include every scheme/host that needs access.
- Run with HTTPS enabled in production; browsers will otherwise warn about mixed security contexts.
- Rotate `ENCRYPTION_KEY` periodically (requires re-encrypting existing assets).

## Styling

The frontend uses Tailwind CSS (`tailwind.config.js`) with a custom brand palette. Update `tailwind.config.js` and `src/index.css` to evolve the design system.

## Legacy Compatibility

Existing files stored with the previous AES-256-CBC scheme remain accessible—the download route detects missing auth tags and falls back to the legacy decryptor.

---

Need help with deployment hardening (reverse proxy, backups, key rotation)? Document those requirements before shipping.
