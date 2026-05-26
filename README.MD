# MamaDoc Django Front

Separate frontend workspace for migrating the MamaDoc UI from Supabase to a
Django backend.

This folder is intentionally disconnected from the production MamaDoc git/deploy
setup. Keep production credentials out of `.env.local`.

## Development

```bash
npm install
npm run dev
```

Expected local API:

```env
VITE_BACKEND_MODE="django"
VITE_API_URL="http://localhost:8000/api"
```
