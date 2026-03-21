const DEFAULT_DATABASE_URL =
  'postgresql://tradewithcongress:tradewithcongress@localhost:5432/tradewithcongress'
const DEFAULT_API_PORT = 8787
const DEFAULT_BENCHMARK_SYMBOL = 'SPY'
const DEFAULT_MARKET_DATA_CACHE_DIR = '../data/market-data'
const DEFAULT_MARKET_DATA_CACHE_TTL_HOURS = 12

export interface ApiConfig {
  databaseUrl: string
  apiPort: number
  alphaVantageApiKey: string | null
  benchmarkSymbol: string
  marketDataCacheDir: string
  marketDataCacheTtlHours: number
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const databaseUrl = env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL
  const apiPort = parsePort(env.API_PORT)

  return {
    databaseUrl,
    apiPort,
    alphaVantageApiKey: normalizeOptionalValue(env.ALPHA_VANTAGE_API_KEY),
    benchmarkSymbol: normalizeOptionalValue(env.MARKET_BENCHMARK_SYMBOL) ?? DEFAULT_BENCHMARK_SYMBOL,
    marketDataCacheDir:
      normalizeOptionalValue(env.MARKET_DATA_CACHE_DIR) ?? DEFAULT_MARKET_DATA_CACHE_DIR,
    marketDataCacheTtlHours: parsePositiveInteger(
      env.MARKET_DATA_CACHE_TTL_HOURS,
      DEFAULT_MARKET_DATA_CACHE_TTL_HOURS,
      'MARKET_DATA_CACHE_TTL_HOURS',
    ),
  }
}

function parsePort(rawValue: string | undefined): number {
  if (rawValue === undefined || rawValue.trim() === '') {
    return DEFAULT_API_PORT
  }

  const port = Number.parseInt(rawValue, 10)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid API_PORT value: ${rawValue}`)
  }

  return port
}

function normalizeOptionalValue(rawValue: string | undefined): string | null {
  if (rawValue === undefined) {
    return null
  }

  const value = rawValue.trim()
  return value === '' ? null : value
}

function parsePositiveInteger(
  rawValue: string | undefined,
  defaultValue: number,
  fieldName: string,
): number {
  if (rawValue === undefined || rawValue.trim() === '') {
    return defaultValue
  }

  const parsed = Number.parseInt(rawValue, 10)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Invalid ${fieldName} value: ${rawValue}`)
  }

  return parsed
}
