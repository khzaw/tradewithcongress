import { Hono } from 'hono'
import type { Context } from 'hono'

import {
  getOverviewSnapshot,
  getOfficialPortfolio,
  getOfficialSummary,
  getOfficialTrades,
  getTickerHolders,
  getTickerSummary,
  getTickerTrades,
  listOfficials,
  listTickers,
  search,
} from './readModels.ts'
import type { Queryable } from './readModels.ts'
import {
  API_BASE_PATH,
  API_VERSION,
  API_VERSION_HEADER,
} from './version.ts'

interface AppDependencies {
  db: Queryable
}

export function createApp({ db }: AppDependencies): Hono {
  const app = new Hono()
  const v1 = new Hono()

  app.get('/health', (c) => {
    return c.json({
      status: 'ok',
      apiVersion: API_VERSION,
    })
  })

  app.use(`${API_BASE_PATH}/*`, async (c, next) => {
    c.header(API_VERSION_HEADER, API_VERSION)
    await next()
  })

  v1.get('/meta', (c) => {
    return c.json({
      apiVersion: API_VERSION,
      basePath: API_BASE_PATH,
      policy: {
        breakingChanges: 'move to a new /api/v{major} namespace',
        additiveChanges: 'stay within the current major version',
      },
    })
  })

  v1.get('/overview', async (c) => {
    const limit = parseLimit(c.req.query('limit'))
    if (limit === null) {
      return badRequest(c, 'limit must be an integer between 1 and 100')
    }

    const overview = await getOverviewSnapshot(db, limit)
    return c.json({ data: overview })
  })

  v1.get('/search', async (c) => {
    const query = parseSearchQuery(c.req.query('q'))
    const limit = parseLimit(c.req.query('limit'))
    if (query === null) {
      return badRequest(c, 'q must be at least 2 non-space characters')
    }
    if (limit === null) {
      return badRequest(c, 'limit must be an integer between 1 and 100')
    }

    const results = await search(db, query, limit)
    return c.json({ data: results })
  })

  v1.get('/officials', async (c) => {
    const limit = parseLimit(c.req.query('limit'))
    if (limit === null) {
      return badRequest(c, 'limit must be an integer between 1 and 100')
    }

    const officials = await listOfficials(db, limit)
    return c.json({ data: officials })
  })

  v1.get('/officials/:officialId', async (c) => {
    const officialId = parsePositiveInteger(c.req.param('officialId'))
    if (officialId === null) {
      return badRequest(c, 'officialId must be a positive integer')
    }

    const summary = await getOfficialSummary(db, officialId)
    if (summary === null) {
      return notFound(c, 'official not found')
    }

    return c.json({ data: summary })
  })

  v1.get('/officials/:officialId/portfolio', async (c) => {
    const officialId = parsePositiveInteger(c.req.param('officialId'))
    const limit = parseLimit(c.req.query('limit'))
    if (officialId === null) {
      return badRequest(c, 'officialId must be a positive integer')
    }
    if (limit === null) {
      return badRequest(c, 'limit must be an integer between 1 and 100')
    }

    const summary = await getOfficialSummary(db, officialId)
    if (summary === null) {
      return notFound(c, 'official not found')
    }

    const positions = await getOfficialPortfolio(db, officialId, limit)
    return c.json({ data: positions })
  })

  v1.get('/officials/:officialId/trades', async (c) => {
    const officialId = parsePositiveInteger(c.req.param('officialId'))
    const limit = parseLimit(c.req.query('limit'))
    if (officialId === null) {
      return badRequest(c, 'officialId must be a positive integer')
    }
    if (limit === null) {
      return badRequest(c, 'limit must be an integer between 1 and 100')
    }

    const summary = await getOfficialSummary(db, officialId)
    if (summary === null) {
      return notFound(c, 'official not found')
    }

    const trades = await getOfficialTrades(db, officialId, limit)
    return c.json({ data: trades })
  })

  v1.get('/tickers', async (c) => {
    const limit = parseLimit(c.req.query('limit'))
    if (limit === null) {
      return badRequest(c, 'limit must be an integer between 1 and 100')
    }

    const tickers = await listTickers(db, limit)
    return c.json({ data: tickers })
  })

  v1.get('/tickers/:ticker', async (c) => {
    const ticker = normalizeTicker(c.req.param('ticker'))
    if (ticker === null) {
      return badRequest(c, 'ticker must be a non-empty symbol')
    }

    const summary = await getTickerSummary(db, ticker)
    if (summary === null) {
      return notFound(c, 'ticker not found')
    }

    return c.json({ data: summary })
  })

  v1.get('/tickers/:ticker/trades', async (c) => {
    const ticker = normalizeTicker(c.req.param('ticker'))
    const limit = parseLimit(c.req.query('limit'))
    if (ticker === null) {
      return badRequest(c, 'ticker must be a non-empty symbol')
    }
    if (limit === null) {
      return badRequest(c, 'limit must be an integer between 1 and 100')
    }

    const summary = await getTickerSummary(db, ticker)
    if (summary === null) {
      return notFound(c, 'ticker not found')
    }

    const trades = await getTickerTrades(db, ticker, limit)
    return c.json({ data: trades })
  })

  v1.get('/tickers/:ticker/holders', async (c) => {
    const ticker = normalizeTicker(c.req.param('ticker'))
    const limit = parseLimit(c.req.query('limit'))
    if (ticker === null) {
      return badRequest(c, 'ticker must be a non-empty symbol')
    }
    if (limit === null) {
      return badRequest(c, 'limit must be an integer between 1 and 100')
    }

    const summary = await getTickerSummary(db, ticker)
    if (summary === null) {
      return notFound(c, 'ticker not found')
    }

    const holders = await getTickerHolders(db, ticker, limit)
    return c.json({ data: holders })
  })

  app.route(API_BASE_PATH, v1)

  return app
}

function parseLimit(rawValue: string | undefined): number | null {
  if (rawValue === undefined) {
    return 10
  }

  const parsed = Number.parseInt(rawValue, 10)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    return null
  }

  return parsed
}

function parseSearchQuery(rawValue: string | undefined): string | null {
  if (rawValue === undefined) {
    return null
  }

  const query = rawValue.trim()
  if (query.length < 2) {
    return null
  }

  return query
}

function parsePositiveInteger(rawValue: string): number | null {
  const parsed = Number.parseInt(rawValue, 10)
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null
  }

  return parsed
}

function normalizeTicker(rawValue: string): string | null {
  const ticker = rawValue.trim().toUpperCase()
  return ticker === '' ? null : ticker
}

function badRequest(c: Context, message: string) {
  return c.json(
    {
      error: {
        code: 'bad_request',
        message,
      },
    },
    400,
  )
}

function notFound(c: Context, message: string) {
  return c.json(
    {
      error: {
        code: 'not_found',
        message,
      },
    },
    404,
  )
}
