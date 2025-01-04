-- // Database schema (run these SQL commands to set up your database)

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
