import { useEffect, useMemo, useRef, useState } from 'react'
import { API_BASE_URL } from '../config'
import { formatBytes } from '../utils/format'

const ACCEPTED_TYPES = 'image/*,video/*'

interface UploadResponse {
  permalink: string
  error?: string
}

function Upload() {
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [permalink, setPermalink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const copyTimeoutRef = useRef<number | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const totalSize = useMemo(
    () => files.reduce((accumulator, file) => accumulator + file.size, 0),
    [files],
  )

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current)
      }
    }
  }, [])

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files ? Array.from(event.target.files) : []
    setFiles(selectedFiles)
    setPermalink(null)
    setError(null)
    setCopied(false)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (files.length === 0 || uploading) {
      return
    }

    setUploading(true)
    setError(null)

    const formData = new FormData()
    files.forEach(file => {
      formData.append('files', file, file.name)
    })

    try {
      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        body: formData,
      })

      const data: UploadResponse = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed')
      }

      setPermalink(data.permalink)
      setFiles([])
      if (inputRef.current) {
        inputRef.current.value = ''
      }
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : 'Upload failed'
      setError(message)
    } finally {
      setUploading(false)
    }
  }

  const albumLink = permalink ? `${window.location.origin}/album/${permalink}` : ''

  const handleCopyLink = async () => {
    if (!albumLink) {
      return
    }
    try {
      await navigator.clipboard.writeText(albumLink)
      setCopied(true)
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current)
      }
      copyTimeoutRef.current = window.setTimeout(() => setCopied(false), 2500)
    } catch (clipboardError) {
      console.error('Failed to copy permalink', clipboardError)
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-8 shadow-card backdrop-blur">
        <header className="mb-8 flex flex-col gap-2">
          <h2 className="text-3xl font-semibold text-slate-50">Create a secure album</h2>
          <p className="text-sm text-slate-400">
            Upload images and videos; everything is encrypted at rest with AES-256-GCM and decrypted on-demand for
            playback in the browser.
          </p>
        </header>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <label htmlFor="file-upload" className="text-sm font-medium text-slate-200">
              Choose files to encrypt (images &amp; videos including MOV)
            </label>
            <input
              ref={inputRef}
              id="file-upload"
              type="file"
              multiple
              accept={ACCEPTED_TYPES}
              onChange={handleFileChange}
              className="block w-full cursor-pointer rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-6 text-sm text-slate-300 transition hover:border-brand-500 focus:border-brand-500 focus:outline-none"
            />
          </div>

          {files.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-slate-300">Queue</h3>
              <ul className="divide-y divide-slate-800 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40">
                {files.map(file => (
                  <li key={`${file.lastModified}-${file.name}`} className="flex items-center justify-between gap-4 px-4 py-3 text-sm text-slate-200">
                    <span className="truncate">{file.name}</span>
                    <span className="text-xs font-mono text-slate-500">{formatBytes(file.size)}</span>
                  </li>
                ))}
                <li className="flex items-center justify-between gap-4 bg-slate-900/60 px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-400">
                  <span>Total</span>
                  <span>{formatBytes(totalSize, 2)}</span>
                </li>
              </ul>
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="submit"
              disabled={uploading || files.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {uploading ? 'Encrypting...' : 'Upload & Encrypt'}
            </button>
            <p className="text-xs text-slate-500">
              Files never persist unencrypted. MOV uploads are converted to MP4 with FFmpeg before encryption.
            </p>
          </div>
        </form>
      </div>

      {permalink && (
        <div className="flex flex-col gap-4 rounded-3xl border border-brand-500/50 bg-brand-500/10 p-6 text-sm text-brand-50 shadow-card">
          <div>
            <span className="rounded-full bg-brand-500/30 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-50">
              Album ready
            </span>
            <p className="mt-3 text-base font-medium text-brand-50">Share this permalink to grant access:</p>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <code className="flex-1 truncate rounded-2xl border border-brand-400/40 bg-slate-950/60 px-4 py-3 font-mono text-xs text-brand-100">
              {albumLink}
            </code>
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-brand-400/60 px-5 py-2 text-xs font-semibold text-brand-50 transition hover:bg-brand-500/20"
            >
              {copied ? 'Copied!' : 'Copy link'}
            </button>
          </div>
          <p className="text-xs text-brand-100/80">
            Keep this link private. Anyone with the permalink can decrypt and view the album while your encryption key remains server-side.
          </p>
        </div>
      )}
    </section>
  )
}

export default Upload




