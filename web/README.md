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
- ticker detail views with holders, trades, a market-performance surface, and real SPY comparisons when benchmark data is configured
- overview and ticker benchmark lanes consume cached market data from the API when `ALPHA_VANTAGE_API_KEY` is set
- the current app surface is styled through Tailwind theme/component CSS instead of plain global CSS
