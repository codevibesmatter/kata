# CLAUDE.md

This is the kata-wm eval fixture web app. It is used by the eval suite to validate
that Claude correctly follows kata-wm mode guidance end-to-end.

## Commands

```bash
npm run build        # Compile TypeScript → dist/
npm run typecheck    # Type-check without emitting
npm test             # Run tests
npm run dev          # Start dev server (tsx)
```

## Structure

- `src/routes/` — Express route handlers (health, users)
- `src/controllers/` — Controller logic
- `src/models/` — In-memory data models
- `tests/` — Test files

## kata Setup

This project has kata batteries installed. Modes available:
- `task` — For small focused changes
- `planning` — For feature planning
- `implementation` — For implementing approved specs
