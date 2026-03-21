import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test'
import { Pool, type PoolClient } from 'pg'

import { createApp } from './app.ts'
import { loadConfig } from './config.ts'
import type { MarketDataClient, MarketSeries } from './marketData.ts'
import { API_BASE_PATH, API_VERSION, API_VERSION_HEADER } from './version.ts'

const config = loadConfig({
  ...process.env,
  DATABASE_URL:
    process.env.DATABASE_URL ??
    'postgresql://tradewithcongress:tradewithcongress@localhost:5432/tradewithcongress',
})

let pool: Pool
let client: PoolClient

beforeAll(() => {
  pool = new Pool({
    connectionString: config.databaseUrl,
    max: 4,
  })
})

afterAll(async () => {
  await pool.end()
})

beforeEach(async () => {
  client = await pool.connect()
  await client.query('BEGIN')
  await resetDatabase(client)
  await seedDatabase(client)
})

afterEach(async () => {
  await client.query('ROLLBACK')
  client.release()
})

describe('versioned read api', () => {
  test('serves version metadata under /api/v1', async () => {
    const app = createApp({ db: client })
    const response = await app.request(`${API_BASE_PATH}/meta`)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get(API_VERSION_HEADER)).toBe(API_VERSION)
    expect(body.apiVersion).toBe('v1')
    expect(body.basePath).toBe('/api/v1')
  })

  test('returns official list, detail, portfolio, and trades', async () => {
    const app = createApp({ db: client })

    const listResponse = await app.request(`${API_BASE_PATH}/officials?limit=2`)
    const listBody = await listResponse.json()
    expect(listResponse.status).toBe(200)
    expect(listBody.data).toHaveLength(2)
    expect(listBody.data[0].displayName).toBe('Nancy Pelosi')

    const detailResponse = await app.request(`${API_BASE_PATH}/officials/1`)
    const detailBody = await detailResponse.json()
    expect(detailResponse.status).toBe(200)
    expect(detailBody.data.positionCount).toBe(2)

    const portfolioResponse = await app.request(
      `${API_BASE_PATH}/officials/1/portfolio?limit=10`,
    )
    const portfolioBody = await portfolioResponse.json()
    expect(portfolioResponse.status).toBe(200)
    expect(portfolioBody.data).toHaveLength(2)
    expect(portfolioBody.data[0].ticker).toBe('NVDA')

    const tradesResponse = await app.request(
      `${API_BASE_PATH}/officials/1/trades?limit=10`,
    )
    const tradesBody = await tradesResponse.json()
    expect(tradesResponse.status).toBe(200)
    expect(tradesBody.data).toHaveLength(2)
    expect(tradesBody.data[0].transactionType).toBe('sale')
  })

  test('returns overview metrics, activity, and recent disclosures', async () => {
    const app = createApp({ db: client, marketData: createStubMarketDataClient() })

    const response = await app.request(`${API_BASE_PATH}/overview?limit=5`)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.trackedOfficials).toBe(2)
    expect(body.data.trackedFilings).toBe(3)
    expect(body.data.trackedTrades).toBe(3)
    expect(body.data.trackedAssets).toBe(3)
    expect(body.data.activeHolders).toBe(3)
    expect(body.data.recentTrades).toHaveLength(3)
    expect(body.data.recentTrades[0].officialDisplayName).toBe('Ro Khanna')
    expect(body.data.monthlyActivity.length).toBeGreaterThan(0)
    expect(body.data.benchmark.symbol).toBe('SPY')
    expect(body.data.benchmark.points).toHaveLength(3)
  })

  test('returns ticker list, detail, trades, and holders', async () => {
    const app = createApp({ db: client })

    const listResponse = await app.request(`${API_BASE_PATH}/tickers?limit=2`)
    const listBody = await listResponse.json()
    expect(listResponse.status).toBe(200)
    expect(listBody.data).toHaveLength(2)
    expect(listBody.data[0].ticker).toBe('NVDA')

    const detailResponse = await app.request(`${API_BASE_PATH}/tickers/nvda`)
    const detailBody = await detailResponse.json()
    expect(detailResponse.status).toBe(200)
    expect(detailBody.data.tradingOfficialCount).toBe(2)

    const tradesResponse = await app.request(
      `${API_BASE_PATH}/tickers/NVDA/trades?limit=10`,
    )
    const tradesBody = await tradesResponse.json()
    expect(tradesResponse.status).toBe(200)
    expect(tradesBody.data).toHaveLength(2)
    expect(tradesBody.data[0].officialDisplayName).toBe('Ro Khanna')

    const holdersResponse = await app.request(
      `${API_BASE_PATH}/tickers/NVDA/holders?limit=10`,
    )
    const holdersBody = await holdersResponse.json()
    expect(holdersResponse.status).toBe(200)
    expect(holdersBody.data).toHaveLength(2)
    expect(holdersBody.data[0].officialDisplayName).toBe('Nancy Pelosi')
  })

  test('returns ticker market comparison when the provider is available', async () => {
    const app = createApp({ db: client, marketData: createStubMarketDataClient() })

    const response = await app.request(`${API_BASE_PATH}/tickers/NVDA/market`)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.security.symbol).toBe('NVDA')
    expect(body.data.benchmark.symbol).toBe('SPY')
    expect(body.data.security.points[0].normalizedClose).toBe(100)
  })

  test('returns 404 for missing official or ticker resources', async () => {
    const app = createApp({ db: client })

    const officialResponse = await app.request(`${API_BASE_PATH}/officials/9999`)
    const tickerResponse = await app.request(`${API_BASE_PATH}/tickers/ZZZZ`)

    expect(officialResponse.status).toBe(404)
    expect(tickerResponse.status).toBe(404)
  })

  test('returns grouped search results for fuzzy official and ticker queries', async () => {
    const app = createApp({ db: client })

    const officialResponse = await app.request(
      `${API_BASE_PATH}/search?q=nancy%20polesi&limit=5`,
    )
    const officialBody = await officialResponse.json()
    expect(officialResponse.status).toBe(200)
    expect(officialBody.data.query).toBe('nancy polesi')
    expect(officialBody.data.officials[0].displayName).toBe('Nancy Pelosi')
    expect(officialBody.data.officials[0].matchedAlias).toBe('Nancy Pelosi')

    const tickerResponse = await app.request(
      `${API_BASE_PATH}/search?q=nvda&limit=5`,
    )
    const tickerBody = await tickerResponse.json()
    expect(tickerResponse.status).toBe(200)
    expect(tickerBody.data.tickers[0].ticker).toBe('NVDA')
    expect(tickerBody.data.tickers[0].matchedField).toBe('ticker')
  })

  test('rejects underspecified search queries', async () => {
    const app = createApp({ db: client })

    const response = await app.request(`${API_BASE_PATH}/search?q=n`)

    expect(response.status).toBe(400)
  })
})

async function resetDatabase(db: PoolClient): Promise<void> {
  await db.query(`
    TRUNCATE TABLE
      parse_issues,
      parse_runs,
      position_events,
      positions,
      transactions,
      filing_documents,
      filings,
      official_aliases,
      officials,
      assets
    RESTART IDENTITY CASCADE
  `)
}

async function seedDatabase(db: PoolClient): Promise<void> {
  await db.query(`
    INSERT INTO officials (
      chamber,
      official_type,
      first_name,
      last_name,
      display_name,
      sort_name,
      state_code,
      district_code,
      party,
      is_current,
      source_ref
    )
    VALUES
      (
        'house',
        'member',
        'Nancy',
        'Pelosi',
        'Nancy Pelosi',
        'Pelosi, Nancy',
        'CA',
        '11',
        'D',
        TRUE,
        'house:ca:11:pelosi:nancy'
      ),
      (
        'house',
        'member',
        'Ro',
        'Khanna',
        'Ro Khanna',
        'Khanna, Ro',
        'CA',
        '17',
        'D',
        TRUE,
        'house:ca:17:khanna:ro'
      );

    INSERT INTO official_aliases (official_id, alias, alias_kind)
    VALUES
      (1, 'Nancy Pelosi', 'display'),
      (1, 'Speaker Pelosi', 'search'),
      (2, 'Ro Khanna', 'display'),
      (2, 'Representative Khanna', 'search');

    INSERT INTO assets (
      ticker,
      asset_name,
      issuer_name,
      asset_type,
      is_exchange_traded
    )
    VALUES
      (
        'NVDA',
        'NVIDIA Corporation - Common Stock',
        'NVIDIA Corporation',
        'equity',
        TRUE
      ),
      (
        'AAPL',
        'Apple Inc. - Common Stock',
        'Apple Inc.',
        'equity',
        TRUE
      ),
      (
        NULL,
        'United States Treasury Bill',
        'United States Treasury',
        'government_security',
        FALSE
      );

    INSERT INTO filings (
      official_id,
      source_system,
      external_filing_id,
      chamber,
      report_type,
      filer_display_name,
      filing_date,
      report_year
    )
    VALUES
      (
        1,
        'house_clerk',
        'nancy-holdings-2026',
        'house',
        'financial_disclosure_report',
        'Nancy Pelosi',
        '2026-01-31',
        2026
      ),
      (
        1,
        'house_clerk',
        'nancy-ptr-2026',
        'house',
        'periodic_transaction_report',
        'Nancy Pelosi',
        '2026-02-21',
        2026
      ),
      (
        2,
        'house_clerk',
        'ro-ptr-2026',
        'house',
        'periodic_transaction_report',
        'Ro Khanna',
        '2026-02-25',
        2026
      );

    INSERT INTO transactions (
      filing_id,
      official_id,
      asset_id,
      source_row_number,
      transaction_date,
      notification_date,
      owner_type,
      transaction_type,
      amount_min,
      amount_max,
      amount_range_label,
      raw_ticker,
      raw_asset_name,
      raw_transaction
    )
    VALUES
      (
        2,
        1,
        1,
        1,
        '2026-01-16',
        '2026-01-16',
        'spouse',
        'purchase',
        100001,
        250000,
        '$100,001 - $250,000',
        'NVDA',
        'NVIDIA Corporation - Common Stock (NVDA) [ST]',
        '{}'::jsonb
      ),
      (
        2,
        1,
        2,
        2,
        '2026-01-20',
        '2026-01-20',
        'spouse',
        'sale',
        50001,
        100000,
        '$50,001 - $100,000',
        'AAPL',
        'Apple Inc. - Common Stock (AAPL) [ST]',
        '{}'::jsonb
      ),
      (
        3,
        2,
        1,
        1,
        '2026-02-01',
        '2026-02-01',
        'self',
        'purchase',
        1001,
        15000,
        '$1,001 - $15,000',
        'NVDA',
        'NVIDIA Corporation - Common Stock (NVDA) [ST]',
        '{}'::jsonb
      );

    INSERT INTO positions (
      official_id,
      asset_id,
      owner_type,
      position_status,
      amount_min,
      amount_max,
      amount_range_label,
      confidence_score,
      confidence_label,
      rationale,
      as_of_filing_date,
      last_transaction_date
    )
    VALUES
      (
        1,
        1,
        'spouse',
        'confirmed',
        100001,
        250000,
        '$100,001 - $250,000',
        0.950,
        'high',
        'Disclosed in latest report',
        '2026-01-31',
        '2026-01-16'
      ),
      (
        1,
        3,
        'self',
        'confirmed',
        15001,
        50000,
        '$15,001 - $50,000',
        0.900,
        'high',
        'Disclosed in latest report',
        '2026-01-31',
        NULL
      ),
      (
        1,
        2,
        'spouse',
        'exited',
        0,
        0,
        '$0',
        0.600,
        'medium',
        'Exited after sale',
        '2026-02-21',
        '2026-01-20'
      ),
      (
        2,
        1,
        'self',
        'confirmed',
        1001,
        15000,
        '$1,001 - $15,000',
        0.850,
        'high',
        'Disclosed in latest report',
        '2026-02-25',
        '2026-02-01'
      );
  `)
}

function createStubMarketDataClient(): MarketDataClient {
  const benchmark = createSeries('SPY', [
    ['2026-01-02', 100],
    ['2026-01-09', 104],
    ['2026-01-16', 109],
  ])

  const bySymbol = new Map<string, MarketSeries>([
    ['SPY', benchmark],
    [
      'NVDA',
      createSeries('NVDA', [
        ['2026-01-02', 100],
        ['2026-01-09', 112],
        ['2026-01-16', 120],
      ]),
    ],
  ])

  return {
    async getBenchmarkSeries() {
      return benchmark
    },
    async getTickerMarketSnapshot(ticker: string) {
      return {
        security: bySymbol.get(ticker.toUpperCase()) ?? null,
        benchmark,
      }
    },
  }
}

function createSeries(
  symbol: string,
  values: Array<[date: string, close: number]>,
): MarketSeries {
  const baseline = values[0]?.[1] ?? 1

  return {
    symbol,
    label: symbol,
    source: 'test',
    asOfDate: values[values.length - 1]?.[0] ?? null,
    points: values.map(([date, close]) => ({
      date,
      close,
      normalizedClose: (close / baseline) * 100,
    })),
  }
}
