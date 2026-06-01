# Environment setup

This project now uses one local `.env` file in the project root.

```txt
cb-ban-panel/.env
```

Start by copying:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
copy .env.example .env
```

Fill in Discord, bot, resolver, SMTP, and URL settings inside that one file.

The backend, frontend, and bot load the root `.env` automatically. Folder-specific files are optional overrides only:

- `backend/.env` overrides root values for backend only.
- `bot/.env` overrides root values for bot only.
- `frontend/.env` overrides root values for frontend only.

For Vercel, do not upload `.env`. Put production environment variables in Vercel Project Settings instead.
