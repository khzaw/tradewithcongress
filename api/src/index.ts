import { createPool } from './db.ts'
import { loadConfig } from './config.ts'
import { createApp } from './app.ts'
import { createMarketDataClient } from './marketData.ts'
import { API_BASE_PATH } from './version.ts'

const config = loadConfig()
const pool = createPool(config.databaseUrl)
const marketData = createMarketDataClient({
  alphaVantageApiKey: config.alphaVantageApiKey,
  benchmarkSymbol: config.benchmarkSymbol,
  cacheDir: config.marketDataCacheDir,
  cacheTtlHours: config.marketDataCacheTtlHours,
})
const app = createApp({ db: pool, marketData })

const server = Bun.serve({
  port: config.apiPort,
  fetch: app.fetch,
})

console.log(
  `tradewithcongress api listening on http://localhost:${server.port}${API_BASE_PATH}`,
)

async function shutdown(signal: string): Promise<void> {
  console.log(`shutting down api after ${signal}`)
  await pool.end()
  server.stop()
}

process.on('SIGINT', () => {
  void shutdown('SIGINT')
})

process.on('SIGTERM', () => {
  void shutdown('SIGTERM')
})
