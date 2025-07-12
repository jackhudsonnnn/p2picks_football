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

### 🛠️ Recommended Development Tools

#### VS Code Extensions

To enhance your development experience, we recommend installing these VS Code extensions:

**Essential Extensions:**
1. **GitHub Copilot** - AI-powered code completion
   - Install: `code --install-extension GitHub.copilot`
   - Or search "GitHub Copilot" in VS Code Extensions marketplace

2. **Supabase** - Official Supabase extension for VS Code
   - Install: `code --install-extension supabase.supabase`
   - Or search "Supabase" in VS Code Extensions marketplace

**Additional Recommended Extensions:**
- **ES7+ React/Redux/React-Native snippets** - `dsznajder.es7-react-js-snippets`
- **Prettier - Code formatter** - `esbenp.prettier-vscode`
- **ESLint** - `dbaeumer.vscode-eslint`
- **Auto Rename Tag** - `formulahendry.auto-rename-tag`
- **Bracket Pair Colorizer 2** - `CoenraadS.bracket-pair-colorizer-2`
- **GitLens** - `eamodio.gitlens`

#### Model Context Protocol (MCP) Setup

MCP allows AI assistants to access local development context. Here's how to set it up:

1. **Install MCP Server for your project:**
   ```bash
   npm install -g @modelcontextprotocol/server-filesystem
   ```

2. **Create MCP configuration file** in your project root:
   ```json
   // .mcp-config.json
   {
     "mcpServers": {
       "filesystem": {
         "command": "npx",
         "args": ["@modelcontextprotocol/server-filesystem", "/path/to/your/project"],
         "env": {}
       }
     }
   }
   ```

3. **Configure your AI assistant** (Claude Desktop, etc.) to use MCP:
   - Add the MCP server configuration to your AI assistant's settings
   - Point it to your project directory for better context awareness

4. **Alternative: Use GitHub Copilot with MCP:**
   - Ensure GitHub Copilot is installed and authenticated
   - The extension will automatically use your project context
   - No additional MCP setup needed for basic functionality

> **📌 Note:** MCP setup varies by AI assistant. Check your specific AI tool's documentation for detailed MCP configuration instructions.

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

1. Navigate to the `/client` directory
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

## 📝 Contributing

We welcome contributions! Please ensure you have the necessary permissions and follow the setup instructions above.

## 📞 Support

For any questions or issues, please contact: **j4ckhudson111@gmail.com**

---

*This project is under active development. Documentation and features may change frequently.*
