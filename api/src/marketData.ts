import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export interface MarketSeriesPoint {
  date: string
  close: number
  normalizedClose: number
}

export interface MarketSeries {
  symbol: string
  label: string
  source: string
  asOfDate: string | null
  points: MarketSeriesPoint[]
}

export interface TickerMarketSnapshot {
  security: MarketSeries | null
  benchmark: MarketSeries | null
}

export interface MarketDataClient {
  getBenchmarkSeries(): Promise<MarketSeries | null>
  getTickerMarketSnapshot(ticker: string): Promise<TickerMarketSnapshot>
}

export interface MarketDataConfig {
  alphaVantageApiKey: string | null
  benchmarkSymbol: string
  cacheDir: string
  cacheTtlHours: number
}

export type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

interface CacheEnvelope {
  fetchedAt: string
  series: MarketSeries
}

interface AlphaVantageMetaData {
  '2. Symbol'?: string
  '3. Last Refreshed'?: string
}

interface AlphaVantageRow {
  '4. close'?: string
  '5. adjusted close'?: string
}

interface AlphaVantageWeeklyAdjustedResponse {
  'Meta Data'?: AlphaVantageMetaData
  'Weekly Adjusted Time Series'?: Record<string, AlphaVantageRow>
  Note?: string
  Information?: string
  'Error Message'?: string
}

const COMPACT_POINT_LIMIT = 26
const DATA_SOURCE = 'Alpha Vantage'

export function createMarketDataClient(
  config: MarketDataConfig,
  fetchImpl: Fetcher = fetch,
): MarketDataClient {
  return new AlphaVantageMarketDataClient(config, fetchImpl)
}

class AlphaVantageMarketDataClient implements MarketDataClient {
  #apiKey: string | null
  #benchmarkSymbol: string
  #cacheDir: string
  #cacheTtlMs: number
  #fetch: Fetcher

  constructor(
    config: MarketDataConfig,
    fetchImpl: Fetcher,
  ) {
    this.#apiKey = normalizeApiKey(config.alphaVantageApiKey)
    this.#benchmarkSymbol = normalizeSymbol(config.benchmarkSymbol)
    this.#cacheDir = config.cacheDir
    this.#cacheTtlMs = Math.max(config.cacheTtlHours, 1) * 60 * 60 * 1000
    this.#fetch = fetchImpl
  }

  async getBenchmarkSeries(): Promise<MarketSeries | null> {
    return this.#getSeries(this.#benchmarkSymbol)
  }

  async getTickerMarketSnapshot(ticker: string): Promise<TickerMarketSnapshot> {
    const securitySymbol = normalizeSymbol(ticker)
    const [security, benchmark] = await Promise.all([
      this.#getSeries(securitySymbol),
      securitySymbol === this.#benchmarkSymbol
        ? this.#getSeries(securitySymbol)
        : this.#getSeries(this.#benchmarkSymbol),
    ])

    return {
      security,
      benchmark,
    }
  }

  async #getSeries(symbol: string): Promise<MarketSeries | null> {
    const cached = await this.#readCachedSeries(symbol)

    if (cached !== null && Date.now() - Date.parse(cached.fetchedAt) < this.#cacheTtlMs) {
      return cached.series
    }

    if (this.#apiKey === null) {
      return cached?.series ?? null
    }

    try {
      const series = await this.#fetchSeries(symbol)
      await this.#writeCachedSeries(symbol, series)
      return series
    } catch {
      return cached?.series ?? null
    }
  }

  async #fetchSeries(symbol: string): Promise<MarketSeries> {
    const url = new URL('https://www.alphavantage.co/query')
    url.searchParams.set('function', 'TIME_SERIES_WEEKLY_ADJUSTED')
    url.searchParams.set('symbol', symbol)
    url.searchParams.set('apikey', this.#apiKey!)

    const response = await this.#fetch(url)
    if (!response.ok) {
      throw new Error(`Market data request failed for ${symbol} with ${response.status}`)
    }

    const payload = (await response.json()) as AlphaVantageWeeklyAdjustedResponse
    return parseAlphaVantageWeeklyAdjustedSeries(symbol, payload)
  }

  async #readCachedSeries(symbol: string): Promise<CacheEnvelope | null> {
    try {
      const raw = await readFile(this.#cachePath(symbol), 'utf8')
      const parsed = JSON.parse(raw) as CacheEnvelope

      if (
        typeof parsed.fetchedAt !== 'string' ||
        parsed.series === undefined ||
        parsed.series === null
      ) {
        return null
      }

      return parsed
    } catch {
      return null
    }
  }

  async #writeCachedSeries(symbol: string, series: MarketSeries): Promise<void> {
    const cachePath = this.#cachePath(symbol)

    await mkdir(dirname(cachePath), { recursive: true })
    await writeFile(
      cachePath,
      JSON.stringify(
        {
          fetchedAt: new Date().toISOString(),
          series,
        } satisfies CacheEnvelope,
        null,
        2,
      ),
      'utf8',
    )
  }

  #cachePath(symbol: string): string {
    return join(this.#cacheDir, `${symbol.toLowerCase()}-weekly-adjusted.json`)
  }
}

export function parseAlphaVantageWeeklyAdjustedSeries(
  requestedSymbol: string,
  payload: AlphaVantageWeeklyAdjustedResponse,
): MarketSeries {
  const errorMessage = payload['Error Message'] ?? payload.Note ?? payload.Information
  if (errorMessage !== undefined) {
    throw new Error(errorMessage)
  }

  const rawSeries = payload['Weekly Adjusted Time Series']
  if (rawSeries === undefined) {
    throw new Error('Alpha Vantage response did not include weekly adjusted data')
  }

  const points = Object.entries(rawSeries)
    .map(([date, row]) => ({
      date,
      close: parseAdjustedClose(row),
    }))
    .filter((point): point is { date: string; close: number } => Number.isFinite(point.close))
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-COMPACT_POINT_LIMIT)

  if (points.length === 0) {
    throw new Error(`Alpha Vantage response for ${requestedSymbol} did not include valid points`)
  }

  const baseline = points[0].close
  const symbol = normalizeSymbol(payload['Meta Data']?.['2. Symbol'] ?? requestedSymbol)

  return {
    symbol,
    label: symbol === 'SPY' ? 'S&P 500 (SPY)' : symbol,
    source: DATA_SOURCE,
    asOfDate: payload['Meta Data']?.['3. Last Refreshed'] ?? points[points.length - 1]?.date ?? null,
    points: points.map((point) => ({
      date: point.date,
      close: point.close,
      normalizedClose: baseline === 0 ? 100 : (point.close / baseline) * 100,
    })),
  }
}

function parseAdjustedClose(row: AlphaVantageRow): number {
  const rawValue = row['5. adjusted close'] ?? row['4. close']
  return rawValue === undefined ? Number.NaN : Number.parseFloat(rawValue)
}

function normalizeApiKey(value: string | null): string | null {
  if (value === null) {
    return null
  }

  const nextValue = value.trim()
  return nextValue === '' ? null : nextValue
}

function normalizeSymbol(value: string): string {
  return value.trim().toUpperCase()
}
