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
- `GET /api/v1/tickers/:ticker/trades`
- `GET /api/v1/tickers/:ticker/holders`

`/api/v1/overview` exists specifically to drive the dashboard-style landing page with tracked counts, recent disclosures, and activity series. Benchmark market data is still a future addition rather than part of the current contract.
