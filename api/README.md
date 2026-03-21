## api

Versioned read API for official-first and ticker-first data.

### Local development

```bash
bun install
bun run dev
```

The service mounts its public routes under `/api/v1`.

Current read surface includes:

- `GET /api/v1/meta`
- `GET /api/v1/search`
- `GET /api/v1/overview`
- `GET /api/v1/officials`
- `GET /api/v1/officials/:officialId`
- `GET /api/v1/officials/:officialId/portfolio`
- `GET /api/v1/officials/:officialId/trades`
- `GET /api/v1/tickers`
- `GET /api/v1/tickers/:ticker`
- `GET /api/v1/tickers/:ticker/market`
- `GET /api/v1/tickers/:ticker/trades`
- `GET /api/v1/tickers/:ticker/holders`

`/api/v1/overview` drives the landing page with tracked counts, recent disclosures, activity series, and an optional cached SPY benchmark lane.

Market benchmarking notes:

- set `ALPHA_VANTAGE_API_KEY` to enable real weekly adjusted series
- benchmark data is cached on disk under `MARKET_DATA_CACHE_DIR`
- `/api/v1/tickers/:ticker/market` returns the normalized ticker series plus the configured benchmark series
- if no key is configured, benchmark responses degrade to `null` without breaking the rest of the API
