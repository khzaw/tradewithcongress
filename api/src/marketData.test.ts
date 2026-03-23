import { afterEach, describe, expect, mock, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  createMarketDataClient,
  type Fetcher,
  parseAlphaVantageWeeklyAdjustedSeries,
} from './marketData.ts'

describe('market data client', () => {
  test('parses weekly adjusted Alpha Vantage payloads into normalized series', () => {
    const series = parseAlphaVantageWeeklyAdjustedSeries('spy', {
      'Meta Data': {
        '2. Symbol': 'SPY',
        '3. Last Refreshed': '2026-01-16',
      },
      'Weekly Adjusted Time Series': {
        '2026-01-16': {
          '5. adjusted close': '109.00',
        },
        '2026-01-09': {
          '5. adjusted close': '104.00',
        },
        '2026-01-02': {
          '5. adjusted close': '100.00',
        },
      },
    })

    expect(series.symbol).toBe('SPY')
    expect(series.label).toBe('S&P 500 (SPY)')
    expect(series.points).toHaveLength(3)
    expect(series.points[0]).toEqual({
      date: '2026-01-02',
      close: 100,
      normalizedClose: 100,
    })
    expect(series.points[2]?.normalizedClose).toBeCloseTo(109)
  })

  test('uses the filesystem cache when no API key is configured after an initial fetch', async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'tradewithcongress-market-'))
    const fetchImpl = mock(async () => {
      return new Response(
        JSON.stringify({
          'Meta Data': {
            '2. Symbol': 'SPY',
            '3. Last Refreshed': '2026-01-16',
          },
          'Weekly Adjusted Time Series': {
            '2026-01-16': { '5. adjusted close': '109.00' },
            '2026-01-09': { '5. adjusted close': '104.00' },
            '2026-01-02': { '5. adjusted close': '100.00' },
          },
        }),
      )
    }) as ReturnType<typeof mock> & Fetcher

    const client = createMarketDataClient(
      {
        alphaVantageApiKey: 'test-key',
        benchmarkSymbol: 'SPY',
        cacheDir,
        cacheTtlHours: 1,
      },
      fetchImpl,
    )

    const initial = await client.getBenchmarkSeries()
    expect(initial?.points).toHaveLength(3)
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    const cachedFallback = createMarketDataClient(
      {
        alphaVantageApiKey: null,
        benchmarkSymbol: 'SPY',
        cacheDir,
        cacheTtlHours: 1,
      },
      fetchImpl,
    )

    const fallback = await cachedFallback.getBenchmarkSeries()
    expect(fallback?.points[2]?.close).toBe(109)
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    await rm(cacheDir, { recursive: true, force: true })
  })
})

afterEach(() => {
  mock.restore()
})
