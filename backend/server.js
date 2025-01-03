// server.js
import express from 'express';
import multer from 'multer';
import pkg from 'pg';
import { promises as fs } from 'fs';
import cors from 'cors';
import { EventEmitter } from 'events';

const progressEmitter = new EventEmitter();

const { Pool } = pkg;

import AWSTranslator from './translation-service.js';
import dotenv from 'dotenv';

dotenv.config();

const translator = new AWSTranslator(
  process.env.AWS_REGION,
  process.env.AWS_ACCESS_KEY_ID,
  process.env.AWS_SECRET_ACCESS_KEY
);

const app = express();
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173']
}));
app.use(express.json());

// Configure multer for file upload
const upload = multer({ dest: 'uploads/' });

// PostgreSQL connection
const pool = new Pool({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD,
  port: parseInt(process.env.POSTGRES_PORT) || 5432,
});

// Parse SRT content
function parseSRT(content) {
  const subtitles = [];
  // Split by double newlines but handle both \r\n and \n line endings
  const blocks = content.trim().split(/\r?\n\r?\n/);

  console.log(blocks.length)

  blocks.forEach(block => {
    const lines = block.split('\n');
    if (lines.length >= 3) {
      const index = parseInt(lines[0]);
      const timestamp = lines[1];
      const text = lines.slice(2).join('\n');

      subtitles.push({ index, timestamp, text });
    }
  });

  console.log(subtitles.length);

  return subtitles;
}

// Generate SRT content
function generateSRT(subtitles) {
  return subtitles
    .map(sub => {
      return `${sub.index}\n${sub.timestamp}\n${sub.text}\n`;
    })
    .join('\n');
}

// Upload endpoint
app.post('/upload', upload.single('srt'), async (req, res) => {
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
    'Connection': 'keep-alive'
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
app.post('/translate/:setId', async (req, res) => {
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
app.get('/download/:setId', async (req, res) => {
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Database schema (run these SQL commands to set up your database)
/*
CREATE TABLE subtitle_sets (
  id SERIAL PRIMARY KEY,
  original_filename VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE subtitles (
  id SERIAL PRIMARY KEY,
  set_id INTEGER REFERENCES subtitle_sets(id),
  index INTEGER NOT NULL,
  timestamp VARCHAR(255) NOT NULL,
  text TEXT NOT NULL,
  translated_text TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
*/