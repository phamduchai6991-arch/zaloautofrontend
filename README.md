# AutoZalo Frontend

React SPA cho AutoZalo — công cụ quản lý Zalo tự động.

## Tech Stack

- React 19 + Vite 8
- Material UI 7
- React Router 7
- Google OAuth

## Setup

```bash
npm install
cp .env.example .env    # Sửa giá trị phù hợp
npm run dev             # http://localhost:3001
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server (port 3001) |
| `npm run build` | Build production |
| `npm run preview` | Preview production build |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `VITE_BACKEND_URL` | Backend API URL (empty = same domain) |
| `VITE_ADMIN_EMAIL` | Optional email used to show the admin shortcut in the sidebar |

## Render Deploy

This repo now includes `render.yaml` for a Render static site deployment.

Set these environment variables in Render:

- `VITE_BACKEND_URL` = backend Render URL, for example `https://autozalo-backend.onrender.com`
- `VITE_GOOGLE_CLIENT_ID`
- `VITE_ADMIN_EMAIL` = admin

The static site uses an SPA rewrite so all frontend routes, including `/admin`, resolve to `index.html`.
