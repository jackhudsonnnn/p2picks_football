# P2Picks (Football)

P2Picks is a modern web application built with React and Supabase. This project is currently under active development.

**Tech Stack:** React, Vite, Supabase, Node.js

---

## 📁 Project Structure

The repository is organized into a monorepo structure:

```
p2picks_football/
├── client/
│   ├── public/
│   ├── src/
│   ├── .env
│   └── package.json
└── server/
```

---

## 🚀 Getting Started

Follow these instructions to get a local copy of the project up and running.

### Prerequisites

You'll need a recent version of Node.js and a package manager like npm. We recommend using a Node version manager like nvm to ensure compatibility.

- **Node.js:** v20.x (LTS) or higher
- **npm:** v10.x or higher

You can check your installed versions with the following commands:

```bash
node --version
npm --version
```

> **💡 Tip:** If you don't have Node.js or npm installed, we recommend visiting the official Node.js website for installation instructions: https://nodejs.org/en/download/package-manager

### Installation

#### 1. 🔐 Permissions

- To contribute directly, you will need collaborator access to this repository and the associated Supabase project.
- Please contact **j4ckhudson111@gmail.com** for any permission-related issues.

#### 2. 📥 Clone the Repository

Fork the repository to your own GitHub account and then clone it locally.

```bash
git clone https://github.com/jackhudsonnnn/p2picks_football.git
cd p2picks_football
```

#### 3. ⚙️ Set Up Client Environment Variables

Navigate to the client directory and create a local environment file by copying the example.

```bash
cd client
touch .env
```

Open the newly created `.env` file and add your Supabase project credentials:

```env
VITE_SUPABASE_URL="YOUR_SUPABASE_PROJECT_URL"
VITE_SUPABASE_ANON_KEY="YOUR_SUPABASE_PUBLIC_ANON_KEY"
```

> **📌 Note:** You can find these keys in your Supabase Project Dashboard under **Project Settings > Data API** and **Project Settings > API Keys**.

#### 4. 📦 Install Client Dependencies

While still in the `/client` directory, install the required npm packages:

```bash
npm install
```

---

## 🏃‍♂️ Running the Application

### Frontend (React Client)

The frontend is a Vite-powered React application.

1. Navigate to the `/client` directory if you aren't here already
2. Run the development server:

```bash
cd client
npm run dev
```

This will start the application, which is typically accessible at **http://localhost:5173**.

### Backend (Supabase)

The backend infrastructure is currently powered entirely by Supabase. There is no separate server application to run locally. All database, authentication, and API services are managed live on the Supabase platform.

> **🔮 Future Plans:** A dedicated Node.js server may be added to the `/server` directory to handle more complex backend logic.


---

*This project is under active development. Documentation and features may change frequently.*
