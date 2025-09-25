import { Link, Route, Routes } from 'react-router-dom'
import Upload from './components/Upload'
import Album from './components/Album'

function App() {
  const currentYear = new Date().getFullYear()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-12 px-6 py-10 md:px-10">
        <header className="flex flex-col gap-6 rounded-3xl border border-slate-800 bg-slate-900/60 p-8 shadow-card backdrop-blur">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <Link to="/" className="inline-flex items-center gap-3 text-3xl font-semibold text-brand-300 transition hover:text-brand-200">
              <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-brand-500/20 text-brand-200">
                VL
              </span>
              Vaultlight
            </Link>
            <div className="flex flex-col gap-2 text-xs text-slate-400 md:text-right">
              <span>Media encrypted with AES-256-GCM</span>
              <span>MOV uploads transcode to MP4 for instant playback</span>
            </div>
          </div>
          <p className="max-w-2xl text-sm text-slate-400">
            Vaultlight is a zero-configuration vault for sensitive photos and videos. Upload any supported media
            and share a single permalink. Files stay encrypted on disk and are streamed decrypted only when viewed.
          </p>
        </header>

        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Upload />} />
            <Route path="/album/:permalink" element={<Album />} />
          </Routes>
        </main>

        <footer className="flex flex-col gap-3 border-t border-slate-800 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>Copyright {currentYear} Vaultlight. Secure media matters.</p>
          <p>Rotate your server-side ENCRYPTION_KEY regularly and back up database.db safely.</p>
        </footer>
      </div>
    </div>
  )
}

export default App
