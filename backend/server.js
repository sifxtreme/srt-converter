// server.js
// third-party imports
import bcrypt from 'bcrypt';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import session from 'express-session';
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import multer from 'multer';
import pkg from 'pg';
import cookieParser from 'cookie-parser';
// local imports
import AWSTranslator from './translation-service.js';
import { parseSRT, generateSRT } from './srt-utils.js';

const progressEmitter = new EventEmitter();

const { Pool } = pkg;

dotenv.config();

const translator = new AWSTranslator(
  process.env.AWS_REGION,
  process.env.AWS_ACCESS_KEY_ID,
  process.env.AWS_SECRET_ACCESS_KEY
);

const app = express();

// Configure CORS
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://srt.sifxtre.me']
    : ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Set-Cookie']
}));

// Parse JSON bodies
app.use(express.json());

// Add cookie parser before other middleware
app.use(cookieParser());

// Add session middleware here, before any routes
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: true,
  saveUninitialized: true,
  name: 'sessionId',
  store: new session.MemoryStore(),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'none',
    domain: process.env.NODE_ENV === 'production' ? '.sifxtre.me' : 'localhost',
    path: '/'
  },
  proxy: true,
  rolling: true
}));

// Add this right after your session middleware
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Credentials', 'true');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Expose-Headers', 'Set-Cookie');
  next();
});

// Configure multer for file upload
const upload = multer({
  storage: multer.diskStorage({
    destination: '/tmp/srt-uploads',
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
});

// PostgreSQL connection
const pool = new Pool({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD,
  port: parseInt(process.env.POSTGRES_PORT) || 5432,
});

// Authentication middleware
const isAuthenticated = (req, res, next) => {
  console.log('Auth check - Session:', {
    id: req.session.id,
    user: req.session.user,
    cookie: req.session.cookie
  });
  console.log('Auth check - Headers:', {
    cookie: req.headers.cookie,
    origin: req.headers.origin,
    referer: req.headers.referer
  });

  if (!req.session || !req.session.user) {
    return res.status(401).json({
      error: 'Unauthorized - Please log in',
      debug: {
        hasSession: !!req.session,
        hasSessionUser: !!(req.session && req.session.user),
        sessionID: req.session?.id
      }
    });
  }
  next();
};

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'ok',
      message: 'Server is running',
      database: 'connected',
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Server is running but database connection failed', error: error.message });
  }
});

// Upload endpoint
app.post('/upload', isAuthenticated, upload.single('srt'), async (req, res) => {
  try {
    const fileContent = await fs.readFile(req.file.path, 'utf-8');
    const subtitles = parseSRT(fileContent);

    // Store in database
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Create a new subtitle set
      const setResult = await client.query(
        'INSERT INTO subtitle_sets (original_filename) VALUES ($1) RETURNING id',
        [req.file.originalname]
      );
      const setId = setResult.rows[0].id;

      // Insert each subtitle
      for (const sub of subtitles) {
        await client.query(
          'INSERT INTO subtitles (set_id, index, timestamp, text) VALUES ($1, $2, $3, $4)',
          [setId, sub.index, sub.timestamp, sub.text]
        );
      }

      // Get preview of first 5 subtitles
      const previewResult = await client.query(
        'SELECT index, timestamp, text FROM subtitles WHERE set_id = $1 ORDER BY index LIMIT 5',
        [setId]
      );

      await client.query('COMMIT');

      res.json({
        setId,
        totalSubtitles: subtitles.length,
        preview: previewResult.rows
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
      // Clean up uploaded file
      await fs.unlink(req.file.path);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to process subtitle file' });
  }
});

// Add a new endpoint for SSE connection
app.get('/translation-progress/:setId', isAuthenticated, (req, res) => {
  const { setId } = req.params;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': req.headers.origin || 'http://localhost:5173',
    'Access-Control-Allow-Credentials': 'true'
  });

  const listener = (progress) => {
    if (progress.setId === parseInt(setId)) {
      res.write(`data: ${JSON.stringify(progress)}\n\n`);
    }
  };

  progressEmitter.on('progress', listener);

  req.on('close', () => {
    progressEmitter.removeListener('progress', listener);
  });
});

// Update the translation endpoint
app.post('/translate/:setId', isAuthenticated, async (req, res) => {
  try {
    const { setId } = req.params;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        'SELECT * FROM subtitles WHERE set_id = $1 ORDER BY index',
        [setId]
      );

      // Send initial progress
      progressEmitter.emit('progress', {
        setId: parseInt(setId),
        current: 0,
        total: rows.length
      });

      // Translate each subtitle using AWS Translate
      const translatedSubs = [];
      for (let i = 0; i < rows.length; i += 10) {
        const chunk = rows.slice(i, i + 10);
        const translatedChunk = await Promise.all(
          chunk.map(async (sub) => {
            const translation = await translator.translate(sub.text, 'es');
            return {
              ...sub,
              text: translation,
            };
          })
        );
        translatedSubs.push(...translatedChunk);

        // Emit progress after each chunk
        progressEmitter.emit('progress', {
          setId: parseInt(setId),
          current: Math.min(i + 10, rows.length),
          total: rows.length
        });
      }

      // Store translations
      for (const sub of translatedSubs) {
        await client.query(
          'UPDATE subtitles SET translated_text = $1 WHERE id = $2',
          [sub.text, sub.id]
        );
      }

      await client.query('COMMIT');

      // Emit completion
      progressEmitter.emit('progress', {
        setId: parseInt(setId),
        current: rows.length,
        total: rows.length,
        completed: true
      });

      res.json({ success: true });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to translate subtitles' });
  }
});

// Download endpoint
app.get('/download/:setId', isAuthenticated, async (req, res) => {
  try {
    const { setId } = req.params;
    const { rows } = await pool.query(
      'SELECT * FROM subtitles WHERE set_id = $1 ORDER BY index',
      [setId]
    );

    const srtContent = generateSRT(rows.map(row => ({
      index: row.index,
      timestamp: row.timestamp,
      text: row.translated_text || row.text,
    })));

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'attachment; filename="translated.srt"');
    res.send(srtContent);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to download subtitles' });
  }
});

// Login endpoint
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  console.log('Login attempt:', { email });

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user) {
      console.log('No user found with this email');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      console.log('Invalid password');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    req.session.user = { id: user.id, email: user.email };

    // Force regenerate the session
    req.session.regenerate((err) => {
      if (err) {
        console.error('Session regenerate error:', err);
        return res.status(500).json({ error: 'Failed to create session' });
      }

      req.session.user = { id: user.id, email: user.email };

      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).json({ error: 'Failed to save session' });
        }

        // Log everything about the response
        console.log('Final session:', req.session);
        console.log('Response headers before send:', res.getHeaders());
        console.log('Cookie header:', res.getHeader('Set-Cookie'));

        // Explicitly set the cookie in response
        if (!res.getHeader('Set-Cookie')) {
          const cookieOptions = {
            maxAge: 24 * 60 * 60 * 1000,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'none',
            domain: process.env.NODE_ENV === 'production' ? '.sifxtre.me' : 'localhost',
            path: '/'
          };

          res.cookie('sessionId', req.session.id, cookieOptions);
        }

        res.json({
          success: true,
          user: { email: user.email },
          sessionId: req.session.id,
          debug: {
            sessionExists: !!req.session,
            cookieHeader: res.getHeader('Set-Cookie')
          }
        });
      });
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Auth status endpoint
app.get('/auth/status', (req, res) => {
  res.json({
    isAuthenticated: !!req.session.user,
    user: req.session.user
  });
});

// Logout endpoint
app.get('/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});