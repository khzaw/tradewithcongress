import { describe, expect, test } from 'bun:test'

import type { OverviewSnapshot, PortfolioPosition, TickerTradeActivity } from './api.ts'
import {
  averageFilingDelayDays,
  buildAssetTypeBreakdown,
  buildMonthlyTradeSeries,
  buildPortfolioExposure,
  buildTradeTypeBreakdown,
  relativeOverviewReturn,
} from './insights.ts'

const EXAMPLE_TRADES: TickerTradeActivity[] = [
  {
    ticker: 'NVDA',
    transactionId: '1',
    officialId: '10',
    officialDisplayName: 'Nancy Pelosi',
    chamber: 'house',
    stateCode: 'CA',
    districtCode: '11',
    party: 'D',
    filingId: '100',
    filingDate: '2026-03-10',
    assetId: '11',
    assetName: 'NVIDIA Corporation',
    issuerName: 'NVIDIA Corporation',
    assetType: 'equity',
    ownerType: 'self',
    transactionType: 'purchase',
    transactionDate: '2026-03-01',
    notificationDate: null,
    activityDate: '2026-03-01',
    amountMin: 1000,
    amountMax: 15000,
    amountRangeLabel: '$1K-$15K',
    tickerActivityRank: 1,
  },
  {
    ticker: 'NVDA',
    transactionId: '2',
    officialId: '12',
    officialDisplayName: 'Ro Khanna',
    chamber: 'house',
    stateCode: 'CA',
    districtCode: '17',
    party: 'D',
    filingId: '101',
    filingDate: '2026-03-18',
    assetId: '11',
    assetName: 'NVIDIA Corporation',
    issuerName: 'NVIDIA Corporation',
    assetType: 'equity',
    ownerType: 'joint',
    transactionType: 'sale',
    transactionDate: '2026-02-20',
    notificationDate: null,
    activityDate: '2026-02-20',
    amountMin: 50000,
    amountMax: 100000,
    amountRangeLabel: '$50K-$100K',
    tickerActivityRank: 2,
  },
]

describe('insights helpers', () => {
  test('builds monthly trade series from activity dates and amount midpoints', () => {
    expect(buildMonthlyTradeSeries(EXAMPLE_TRADES, 6)).toEqual([
      { label: 'Feb', value: 75000 },
      { label: 'Mar', value: 8000 },
    ])
  })

  test('builds portfolio exposure slices sorted by descending weight', () => {
    const positions: PortfolioPosition[] = [
      {
        positionId: '1',
        officialId: '10',
        officialDisplayName: 'Nancy Pelosi',
        chamber: 'house',
        stateCode: 'CA',
        districtCode: '11',
        party: 'D',
        assetId: '1',
        ticker: 'NVDA',
        assetName: 'NVIDIA Corporation',
        issuerName: 'NVIDIA Corporation',
        assetType: 'equity',
        isExchangeTraded: true,
        ownerType: 'self',
        positionStatus: 'held',
        amountMin: 1000,
        amountMax: 15000,
        amountRangeLabel: '$1K-$15K',
        confidenceScore: 0.9,
        confidenceLabel: 'high',
        rationale: null,
        asOfFilingDate: '2026-03-10',
        lastTransactionDate: '2026-03-01',
        portfolioRank: 1,
      },
      {
        positionId: '2',
        officialId: '10',
        officialDisplayName: 'Nancy Pelosi',
        chamber: 'house',
        stateCode: 'CA',
        districtCode: '11',
        party: 'D',
        assetId: '2',
        ticker: 'AAPL',
        assetName: 'Apple Inc.',
        issuerName: 'Apple Inc.',
        assetType: 'equity',
        isExchangeTraded: true,
        ownerType: 'self',
        positionStatus: 'held',
        amountMin: 50000,
        amountMax: 100000,
        amountRangeLabel: '$50K-$100K',
        confidenceScore: 0.9,
        confidenceLabel: 'high',
        rationale: null,
        asOfFilingDate: '2026-03-10',
        lastTransactionDate: '2026-03-01',
        portfolioRank: 2,
      },
    ]

    expect(buildPortfolioExposure(positions, 2)).toEqual([
      { label: 'AAPL', value: 75000 },
      { label: 'NVDA', value: 8000 },
    ])

    expect(buildAssetTypeBreakdown(positions)).toEqual([{ label: 'equity', value: 2 }])
  })

  test('computes type and delay aggregates', () => {
    expect(buildTradeTypeBreakdown(EXAMPLE_TRADES)).toEqual([
      { label: 'purchase', value: 1 },
      { label: 'sale', value: 1 },
    ])
    expect(averageFilingDelayDays(EXAMPLE_TRADES)).toBe(18)
  })

  test('derives a relative overview return from monthly activity', () => {
    const overview: OverviewSnapshot = {
      trackedOfficials: 10,
      trackedFilings: 20,
      trackedTrades: 30,
      trackedAssets: 40,
      activeHolders: 5,
      latestTradeDate: '2026-03-10',
      recentTrades: [],
      monthlyActivity: [
        { monthStart: '2026-01-01', tradeCount: 10, estimatedVolume: 1000 },
        { monthStart: '2026-02-01', tradeCount: 12, estimatedVolume: 1500 },
        { monthStart: '2026-03-01', tradeCount: 18, estimatedVolume: 1800 },
      ],
    }

    expect(relativeOverviewReturn(overview)).toBe(80)
  })
})
