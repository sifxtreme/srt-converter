# SRT to Spanish Converter

This application allows you to upload `.srt` subtitle files and converts them into Spanish using AWS Translate. It is structured with separate backend and frontend directories for ease of development and deployment.

## Features
- Upload `.srt` files via a user-friendly frontend.
- Automatic translation of subtitle files to Spanish using AWS Translate.
- Download the translated `.srt` file.

---

- **backend/**: Contains the server-side code and handles API requests, translation logic, and database interactions.
- **frontend/**: Contains the client-side code and UI components for user interaction.

---

## Prerequisites
- Node.js (v20 or later)
- PostgreSQL database
- AWS account with access to AWS Translate

---

## Setup Instructions

### Backend Setup
1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   - Copy the `env.example` file to `.env`:
     ```bash
     cp env.example .env
     ```
   - Update the `.env` file with your AWS and database credentials.

4. Start the server:
   ```bash
   npm run dev
   ```

### Frontend Setup
1. Navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

---

## Environment Variables
The backend requires the following environment variables to be configured:

### AWS Credentials
```
AWS_ACCESS_KEY_ID=your_aws_access_key_here
AWS_SECRET_ACCESS_KEY=your_aws_secret_key_here
AWS_REGION=us-east-1
```

### Server Configuration
```
PORT=3001
```

### Database Configuration
```
POSTGRES_USER=asifahmed
POSTGRES_HOST=0.0.0.0
POSTGRES_DB=jarvis
POSTGRES_PASSWORD=your_database_password_here
POSTGRES_PORT=5432
```

### Session Configuration
```
SESSION_SECRET=your_session_secret_here
```

---

## Usage
1. Start both the backend and frontend servers.
2. Open your browser and navigate to the frontend application.
3. Upload an `.srt` file via the provided UI.
4. Wait for the file to be processed and translated.
5. Download the translated `.srt` file.

---

## Contributing
Feel free to submit issues or pull requests if you want to improve the application.

---

## License
This project is licensed under the MIT License. See the LICENSE file for details.

