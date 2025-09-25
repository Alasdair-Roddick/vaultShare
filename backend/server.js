require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const cors = require('cors');
const helmet = require('helmet');
const { pipeline } = require('stream/promises');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

const app = express();
const PORT = process.env.PORT || 3001;

const uploadsDir = path.join(__dirname, 'uploads');
const clientBuildDir = path.join(__dirname, 'public');
const databasePath = resolveDatabasePath(process.env.DATABASE_PATH);
fs.mkdirSync(uploadsDir, { recursive: true });

const encryptionKey = loadEncryptionKey(process.env.ENCRYPTION_KEY);
const DEFAULT_MAX_FILE_SIZE = 100 * 1024 * 1024;
const maxFileSize = normalizeFileSize(process.env.MAX_FILE_SIZE_BYTES, DEFAULT_MAX_FILE_SIZE);
const allowedOrigins = parseAllowedOrigins(process.env.CLIENT_ORIGINS);

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

const db = new sqlite3.Database(databasePath);

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, os.tmpdir()),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`),
});

const upload = multer({
  storage: diskStorage,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
    }
  },
  limits: { fileSize: maxFileSize },
});

const quickTimeTypes = new Set(['video/quicktime']);
const quickTimeExtensions = new Set(['.mov', '.qt']);

const runAsync = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function runCallback(err) {
    if (err) {
      reject(err);
    } else {
      resolve(this);
    }
  });
});

const getAsync = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) {
      reject(err);
    } else {
      resolve(row);
    }
  });
});

const allAsync = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) {
      reject(err);
    } else {
      resolve(rows);
    }
  });
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS albums (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      permalink TEXT UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      album_id INTEGER,
      filename TEXT,
      original_name TEXT,
      path TEXT,
      type TEXT,
      size INTEGER,
      iv TEXT,
      tag TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (album_id) REFERENCES albums (id)
    )
  `);

  ensureColumn(db, 'files', 'tag', 'TEXT');
});

app.post('/upload', upload.array('files'), async (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const permalink = uuidv4();

  try {
    const albumResult = await runAsync('INSERT INTO albums (permalink) VALUES (?)', [permalink]);
    const albumId = albumResult.lastID;

    const fileRecords = [];
    for (const file of req.files) {
      const record = await persistUploadedFile(file, albumId);
      fileRecords.push(record);
    }

    for (const record of fileRecords) {
      await runAsync(
        'INSERT INTO files (album_id, filename, original_name, path, type, size, iv, tag) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          record.album_id,
          record.filename,
          record.original_name,
          record.path,
          record.type,
          record.size,
          record.iv,
          record.tag,
        ],
      );
    }

    return res.json({ permalink });
  } catch (error) {
    return next(error);
  } finally {
    await Promise.all((req.files || []).map((file) => safeUnlink(file.path)));
  }
});

app.get('/album/:permalink', async (req, res, next) => {
  try {
    const { permalink } = req.params;
    if (!validateUuid(permalink)) {
      return res.status(400).json({ error: 'Invalid album identifier' });
    }

    const album = await getAsync('SELECT id FROM albums WHERE permalink = ?', [permalink]);
    if (!album) {
      return res.status(404).json({ error: 'Album not found' });
    }

    const files = await allAsync(
      'SELECT filename, original_name, type, size FROM files WHERE album_id = ? ORDER BY id ASC',
      [album.id],
    );

    return res.json({ files });
  } catch (error) {
    return next(error);
  }
});

app.get('/uploads/:filename', async (req, res, next) => {
  try {
    const { filename } = req.params;
    const fileRecord = await getAsync(
      'SELECT original_name, path, type, iv, tag FROM files WHERE filename = ?',
      [filename],
    );

    if (!fileRecord) {
      return res.status(404).send('File not found');
    }

    const absolutePath = resolveStoragePath(fileRecord.path);
    const ivBuffer = Buffer.from(fileRecord.iv, 'hex');

    res.setHeader('Content-Type', fileRecord.type || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${sanitizeFilename(fileRecord.original_name)}"`,
    );

    const readStream = fs.createReadStream(absolutePath);

    if (fileRecord.tag) {
      const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, ivBuffer);
      decipher.setAuthTag(Buffer.from(fileRecord.tag, 'hex'));
      await pipeline(readStream, decipher, res);
    } else {
      // Legacy CBC support for pre-migration files.
      const decipher = crypto.createDecipheriv('aes-256-cbc', encryptionKey, ivBuffer);
      await pipeline(readStream, decipher, res);
    }

    return null;
  } catch (error) {
    return next(error);
  }
});

if (fs.existsSync(clientBuildDir)) {
  app.use(express.static(clientBuildDir));

  app.get('*', (req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/uploads/')) {
      return next();
    }

    const acceptsHtml = (req.headers.accept || '').includes('text/html');
    if (!acceptsHtml) {
      return next();
    }

    return res.sendFile(path.join(clientBuildDir, 'index.html'));
  });
}
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }

  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

function loadEncryptionKey(rawKey) {
  if (!rawKey) {
    throw new Error('ENCRYPTION_KEY is required');
  }

  if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    return Buffer.from(rawKey, 'hex');
  }

  try {
    const decoded = Buffer.from(rawKey, 'base64');
    if (decoded.length === 32) {
      return decoded;
    }
  } catch (_error) {
    // fall through
  }

  throw new Error('ENCRYPTION_KEY must be a 32-byte key in hex or base64 form');
}

function parseAllowedOrigins(origins) {
  if (!origins) {
    return ['http://localhost:5173'];
  }
  return origins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function validateUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function persistUploadedFile(file, albumId) {
  let workingPath = file.path;
  let mimeType = file.mimetype;
  let extension = path.extname(file.originalname) || '';

  try {
    if (shouldConvertToMp4(file)) {
      const convertedPath = await convertToMp4(workingPath);
      await safeUnlink(workingPath);
      workingPath = convertedPath;
      mimeType = 'video/mp4';
      extension = '.mp4';
    }

    const targetExtension = extension ? (extension.startsWith('.') ? extension : `.${extension}`) : '';
    const encrypted = await encryptAndStoreFromDisk(workingPath, targetExtension);

    return {
      album_id: albumId,
      filename: encrypted.filename,
      original_name: file.originalname,
      path: encrypted.relativePath,
      type: mimeType,
      size: encrypted.size,
      iv: encrypted.ivHex,
      tag: encrypted.tagHex,
    };
  } finally {
    await safeUnlink(workingPath);
  }
}

async function encryptAndStoreFromDisk(inputPath, extension) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  const filename = `${uuidv4()}${extension || ''}`;
  const relativePath = path.join('uploads', filename);
  const absolutePath = path.join(__dirname, relativePath);

  await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });

  const readStream = fs.createReadStream(inputPath);
  const writeStream = fs.createWriteStream(absolutePath);

  await pipeline(readStream, cipher, writeStream);

  const authTag = cipher.getAuthTag();
  const stats = await fs.promises.stat(absolutePath);

  return {
    filename,
    relativePath: path.relative(__dirname, absolutePath),
    size: stats.size,
    ivHex: iv.toString('hex'),
    tagHex: authTag.toString('hex'),
  };
}

function shouldConvertToMp4(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  return quickTimeTypes.has(file.mimetype) || quickTimeExtensions.has(ext);
}

async function convertToMp4(inputPath) {
  if (!ffmpegStatic) {
    throw new Error('MOV conversion requires FFmpeg. Install ffmpeg-static to enable this feature.');
  }

  const outputPath = path.join(os.tmpdir(), `${uuidv4()}.mp4`);

  await new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        '-c:v libx264',
        '-preset veryfast',
        '-crf 23',
        '-c:a aac',
        '-movflags +faststart',
      ])
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });

  return outputPath;
}

async function safeUnlink(targetPath) {
  if (!targetPath) {
    return;
  }

  try {
    await fs.promises.unlink(targetPath);
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      console.warn(`Failed to remove temporary file ${targetPath}:`, error.message);
    }
  }
}

function resolveStoragePath(storedPath) {
  const absolute = path.isAbsolute(storedPath)
    ? storedPath
    : path.resolve(__dirname, storedPath);

  const relative = path.relative(uploadsDir, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Invalid file path');
  }

  return absolute;
}

function resolveDatabasePath(rawPath) {
  if (!rawPath) {
    const fallback = path.join(__dirname, 'database.db');
    fs.mkdirSync(path.dirname(fallback), { recursive: true });
    return fallback;
  }

  const resolved = path.isAbsolute(rawPath) ? rawPath : path.resolve(__dirname, rawPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  return resolved;
}

function normalizeFileSize(rawValue, fallback) {
  const parsed = Number(rawValue);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

function sanitizeFilename(filename) {
  return filename.replace(/["\\\n\r]/g, '_');
}

function ensureColumn(database, table, column, definition) {
  database.all(`PRAGMA table_info(${table})`, (err, rows) => {
    if (err) {
      console.error(`Failed to inspect ${table} schema`, err);
      return;
    }
    const hasColumn = rows.some((row) => row.name === column);
    if (!hasColumn) {
      database.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`, (alterErr) => {
        if (alterErr) {
          console.error(`Failed to add ${column} column to ${table}`, alterErr);
        }
      });
    }
  });
}










