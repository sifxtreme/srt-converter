// server.js
// third-party imports
import bcrypt from 'bcrypt';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import multer from 'multer';
import pkg from 'pg';
import jwt from 'jsonwebtoken';
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

// Add middleware to protect routes
const authenticateToken = (req, res, next) => {
  const queryToken = req.query?.token

  const authHeader = req.headers['authorization'] || req.query?.token;
  const token = (authHeader && authHeader.split(' ')[1]) || queryToken;

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Configure CORS
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://srt.sifxtre.me']
    : ['http://localhost:5173', 'http://127.0.0.1:5173'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Parse JSON bodies
app.use(express.json());

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

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'ok',
      message: 'Server is running',
      database: 'connected',
      environment: process.env.NODE_ENV || 'development',
      authenticated: req.headers.authorization ?
        jwt.verify(req.headers.authorization.split(' ')[1], process.env.JWT_SECRET) ? true : false
        : false
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Server is running but database connection failed', error: error.message });
  }
});

// Upload endpoint
app.post('/upload', authenticateToken, upload.single('srt'), async (req, res) => {
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
app.get('/translation-progress/:setId', (req, res) => {
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
app.post('/translate/:setId', authenticateToken, async (req, res) => {
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
app.get('/download/:setId', authenticateToken, async (req, res) => {
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

// Add this before the login endpoint
app.get('/auth/status', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT email FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      authenticated: true,
      username: result.rows[0].email
    });
  } catch (error) {
    console.error('Auth status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login endpoint
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [username]
    );
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.email
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, username: user.email });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});