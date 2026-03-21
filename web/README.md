# web

React + Vite + TypeScript frontend for the `tradewithcongress` product surface.

Styling is handled with Tailwind CSS v4.

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

- redesigned dashboard-style landing page with a flatter, higher-density visual system
- overview metrics, activity charts, portfolio leaders, ticker flow, and recent disclosure tables
- versioned search against `/api/v1/search`
- shareable official detail views via `?official={id}`
- shareable ticker detail views via `?ticker={symbol}`
- official detail views with a profile rail, holdings concentration surfaces, trades, and visual portfolio/trade breakdowns
- ticker detail views with holders, trades, and visual action/party breakdowns
- benchmark panels reserved for future S&P 500 overlays
- the current app surface is styled through Tailwind theme/component CSS instead of plain global CSS
