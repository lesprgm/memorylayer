# Handoff Frontend

React + TypeScript + Vite + Tailwind CSS frontend for the Handoff AI memory application.

## Development

```bash
# Install dependencies (from root)
npm install

# Start dev server
npm run dev:frontend

# Build for production
npm run build:frontend

# Deploy to Cloudflare Pages
npm run deploy:frontend
```

## Environment Variables

Create a `.env` file:

```
VITE_API_URL=http://localhost:8787
```

## Tech Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- React Router
- Headless UI

---

## Development Approach

This frontend is part of the Handoff application, which was developed using Kiro's spec-driven development methodology. See the [main Handoff README](../README.md#development-approach) for complete details on the specification-driven development process and architecture decisions.
