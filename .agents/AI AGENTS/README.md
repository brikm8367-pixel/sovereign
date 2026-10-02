# Personal AI Agent

This project is a working MVP for a local personal AI agent system built with React + TypeScript on the frontend and Node + TypeScript on the backend.

## Project architecture

- Frontend: Vite + React + TypeScript + Tailwind
- Backend: Express + TypeScript
- AI: OpenRouter via the OpenRouter API
- Agent layer: planner, tool registry, permissions, status tracking
- Persistence: SQLite-ready abstraction and memory model

## Installation

1. Install dependencies:
   npm install
2. Create a local environment file:
   cp .env.example .env
3. Add your OpenRouter API key and optional settings.

## Run locally

npm run dev

This starts:
- Web app: http://localhost:5173
- API server: http://localhost:4000

## Production build

npm run build

## Testing

npm test

## Security notes

- Store API keys in environment variables only.
- Do not place secrets in the frontend bundle.
- Treat all agent actions as permission-controlled and validated before execution.
- The local computer agent is intentionally isolated and is only connected through an explicit protocol layer.

## Future local agent connection

The backend exposes a clear local-agent protocol and sets the foundation for browser/OS automation without directly executing arbitrary shell commands.
