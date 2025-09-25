import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { API_BASE_URL } from '../config'
import { formatBytes } from '../utils/format'

interface FileData {
  filename: string
  original_name: string
  type: string
  size?: number
}

interface AlbumResponse {
  files?: FileData[]
  error?: string
}

function Album() {
  const { permalink } = useParams<{ permalink: string }>()
  const [files, setFiles] = useState<FileData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!permalink) {
      setError('Album identifier missing')
      setLoading(false)
      return
    }

    const controller = new AbortController()

    const fetchAlbum = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`${API_BASE_URL}/album/${permalink}`, {
          signal: controller.signal,
        })
        const data: AlbumResponse = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(data.error || 'Unable to load album')
        }
        setFiles(Array.isArray(data.files) ? data.files : [])
      } catch (albumError) {
        if ((albumError as Error).name === 'AbortError') {
          return
        }
        const message = albumError instanceof Error ? albumError.message : 'Unable to load album'
        setError(message)
        setFiles([])
      } finally {
        setLoading(false)
      }
    }

    fetchAlbum()

    return () => {
      controller.abort()
    }
  }, [permalink])

  const hasFiles = files.length > 0

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-4 border-b border-slate-800 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <h2 className="text-3xl font-semibold text-slate-50">Encrypted album</h2>
          {permalink && (
            <p className="text-xs text-slate-500">
              Permalink
              <span className="ml-2 rounded-full bg-slate-900/80 px-3 py-1 font-mono text-[11px] text-slate-400">
                {permalink}
              </span>
            </p>
          )}
        </div>
        <Link
          to="/"
          className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-brand-400 hover:text-brand-200"
        >
          Upload more files
        </Link>
      </div>

      {loading && (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-8 text-sm text-slate-400">
          Decrypting album metadata...
        </div>
      )}

      {!loading && error && (
        <div className="rounded-3xl border border-rose-500/40 bg-rose-500/10 p-6 text-sm text-rose-100">
          {error}
        </div>
      )}

      {!loading && !error && !hasFiles && (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-8 text-center text-sm text-slate-400">
          No files in this album yet.
        </div>
      )}

      {!loading && !error && hasFiles && (
        <div className="grid gap-8 md:grid-cols-2">
          {files.map(file => {
            const isImage = file.type.startsWith('image/')
            const fileUrl = `${API_BASE_URL}/uploads/${file.filename}`
            return (
              <article
                key={file.filename}
                className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900/60 p-5 shadow-card"
              >
                <div className="overflow-hidden rounded-2xl border border-slate-800 bg-black">
                  {isImage ? (
                    <img
                      src={fileUrl}
                      alt={file.original_name}
                      className="max-h-96 w-full object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <video
                      className="max-h-96 w-full rounded-2xl bg-black"
                      controls
                      controlsList="nodownload"
                    >
                      <source src={fileUrl} type={file.type} />
                      Your browser does not support secure video playback.
                    </video>
                  )}
                </div>
                <div className="flex flex-col gap-2 text-sm text-slate-300">
                  <p className="font-medium text-slate-100">{file.original_name}</p>
                  <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-wide text-slate-500">
                    <span>{file.type}</span>
                    {typeof file.size === 'number' && file.size > 0 && <span>{formatBytes(file.size)}</span>}
                  </div>
                  <a
                    href={fileUrl}
                    download={file.original_name}
                    className="inline-flex items-center gap-2 self-start rounded-full border border-brand-400/60 px-4 py-2 text-xs font-semibold text-brand-100 transition hover:bg-brand-500/20"
                  >
                    Download encrypted media
                  </a>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default Album
