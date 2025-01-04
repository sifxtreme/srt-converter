-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create initial users with password 'password123'
-- This hash is correctly generated for 'password123'
INSERT INTO users (email, password_hash)
VALUES
    ('js.mashouf@gmail.com', '$2b$10$zqB2Ow7YcqEKrg3Jls0jX.5vhqv7LJoYZ6rZqgXk5MGz1xkNS5iHi'),
    ('asif.h.ahmed@gmail.com', '$2b$10$zqB2Ow7YcqEKrg3Jls0jX.5vhqv7LJoYZ6rZqgXk5MGz1xkNS5iHi')
ON CONFLICT (email) DO NOTHING;