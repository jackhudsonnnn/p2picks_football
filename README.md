# Full Stack Application (Client + Server)

This project is structured with a React (Vite + TypeScript) client and a Node.js (TypeScript) server.

## Project Structure

- `/client`: Contains the frontend React application.
- `/server`: Contains the backend Node.js application.
- `/scripts`: Utility scripts for the project.

## Prerequisites

- Node.js (v18 or newer recommended)
- npm or yarn

## Setup Instructions

### 1. Clone the Repository (if applicable)

```bash
# git clone <your-repo-url>
# cd <your-project-directory>
```

### 2. Configure Client Environment Variables

Navigate to the `client` directory:
```bash
cd client
```
Create a `.env` file by copying `.env.example` (if one existed, or create it manually based on the script's output):
```
VITE_SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLIC_ANON_KEY
```
Replace the placeholder values with your actual Supabase URL and Anon Key (found in your Supabase project's API settings).

### 3. Install Client Dependencies

While in the `client` directory:
```bash
npm install
# or
# yarn install
```

### 4. Configure Server Environment Variables

Navigate to the `server` directory:
```bash
cd ../server
```
Create a `.env` file by copying `server/.env.example`:
```bash
cp .env.example .env
```
Edit `server/.env` and provide your Supabase URL and **SERVICE ROLE KEY**.
```
SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY # KEEP THIS SECRET!
PORT=3001
```
**IMPORTANT**: The `SUPABASE_SERVICE_ROLE_KEY` is highly sensitive. Do not commit it to version control or expose it publicly.

### 5. Install Server Dependencies

While in the `server` directory:
```bash
npm install
# or
# yarn install
```

## Running the Application

### Client (React App)

Navigate to the `client` directory:
```bash
cd ../client
npm run dev
```
This will start the Vite development server, typically on `http://localhost:5173`.

### Server (Node.js App)

Navigate to the `server` directory:
```bash
cd ../server
npm run build # To compile TypeScript
npm run dev   # To run with nodemon (compiles and restarts on changes)
# or
# npm run start # To run the compiled code (after building)
```
The server will start, typically on `http://localhost:3001` (or as configured in `server/.env`).

## Supabase Configuration (Recap)

1.  **Create Supabase Project**: Go to [supabase.com](https://supabase.com).
2.  **Enable Google Auth Provider**:
    * In Supabase Dashboard > Authentication > Providers > Google.
    * Note the **Redirect URI**.
3.  **Configure Google Cloud Console for OAuth**:
    * Create OAuth 2.0 Client ID (Web application).
    * Authorized JavaScript origins: `https://<YOUR_PROJECT_REF>.supabase.co` (and your dev origins like `http://localhost:5173`).
    * Authorized redirect URIs: The Redirect URI from Supabase (e.g., `https://<YOUR_PROJECT_REF>.supabase.co/auth/v1/callback`).
    * Get Client ID and Client Secret.
4.  **Add Google Credentials to Supabase**: Paste Client ID and Secret into Supabase Google provider settings and save.
5.  **API Keys**:
    * **Project URL** and **anon public key** for the client (`client/.env`).
    * **service_role key** for the server (`server/.env`).

## Next Steps

- Implement the empty component, page, service, and utility files.
- Set up routing in the client (e.g., using React Router).
- Develop API endpoints in the server.
- Configure ESLint and Prettier for code quality.
- Write tests.
