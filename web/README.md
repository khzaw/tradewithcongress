# web

React + Vite + TypeScript frontend for the `tradewithcongress` product surface.

## Scripts

```bash
bun install
bun run dev
bun run test
bun run typecheck
bun run lint
bun run build
```

Current frontend behavior:

- overview cards for top officials and top tickers
- versioned search against `/api/v1/search`
- shareable official detail views via `?official={id}`
- shareable ticker detail views via `?ticker={symbol}`
