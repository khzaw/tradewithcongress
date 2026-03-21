import type {
  OfficialTradeActivity,
  OverviewSnapshot,
  PortfolioPosition,
  TickerTradeActivity,
} from './api.ts'

export interface SeriesPoint {
  label: string
  value: number
}

export interface BreakdownSegment {
  label: string
  value: number
}

type TradeLike = OfficialTradeActivity | TickerTradeActivity

export function totalEstimatedTradeVolume(trades: TradeLike[]): number {
  return trades.reduce((total, trade) => total + midpoint(trade.amountMin, trade.amountMax), 0)
}

export function buildOverviewSeries(
  overview: OverviewSnapshot,
): SeriesPoint[] {
  return overview.monthlyActivity.map((bucket) => ({
    label: formatMonthLabel(bucket.monthStart),
    value: bucket.estimatedVolume > 0 ? bucket.estimatedVolume : bucket.tradeCount,
  }))
}

export function buildMonthlyTradeSeries(
  trades: TradeLike[],
  bucketCount = 6,
): SeriesPoint[] {
  const monthlyBuckets = new Map<string, number>()

  for (const trade of trades) {
    const monthStart = trade.activityDate.slice(0, 7)
    const nextValue = (monthlyBuckets.get(monthStart) ?? 0) + midpoint(trade.amountMin, trade.amountMax)
    monthlyBuckets.set(monthStart, nextValue)
  }

  const sortedMonths = [...monthlyBuckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-bucketCount)

  return sortedMonths.map(([monthStart, value]) => ({
    label: formatMonthLabel(`${monthStart}-01`),
    value,
  }))
}

export function buildPortfolioExposure(
  positions: PortfolioPosition[],
  limit = 5,
): BreakdownSegment[] {
  return positions
    .map((position) => ({
      label: position.ticker ?? position.assetName,
      value: midpoint(position.amountMin, position.amountMax),
    }))
    .sort((left, right) => right.value - left.value)
    .slice(0, limit)
}

export function buildAssetTypeBreakdown(
  positions: PortfolioPosition[],
): BreakdownSegment[] {
  const counts = new Map<string, number>()

  for (const position of positions) {
    const label = position.assetType.trim() === '' ? 'unknown' : position.assetType
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value)
}

export function buildTradeTypeBreakdown(
  trades: TradeLike[],
): BreakdownSegment[] {
  const counts = new Map<string, number>()

  for (const trade of trades) {
    counts.set(trade.transactionType, (counts.get(trade.transactionType) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value)
}

export function buildPartyBreakdown(
  trades: TradeLike[],
): BreakdownSegment[] {
  const counts = new Map<string, number>()

  for (const trade of trades) {
    const label = trade.party ?? 'Unknown'
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value)
}

export function averageFilingDelayDays(trades: TradeLike[]): number | null {
  const delays = trades
    .map((trade) => calculateDelayDays(trade.transactionDate, trade.filingDate))
    .filter((value): value is number => value !== null)

  if (delays.length === 0) {
    return null
  }

  return Math.round(delays.reduce((total, value) => total + value, 0) / delays.length)
}

export function relativeOverviewReturn(overview: OverviewSnapshot): number {
  const series = buildOverviewSeries(overview)
  if (series.length < 2) {
    return 0
  }

  const firstValue = series[0].value
  const lastValue = series[series.length - 1].value
  if (firstValue === 0 || lastValue === 0) {
    return 0
  }

  return ((lastValue - firstValue) / firstValue) * 100
}

export function latestActivityLabel(
  overview: OverviewSnapshot,
): string {
  return overview.latestTradeDate === null
    ? 'No parsed trade activity yet'
    : `Latest parsed trade ${formatMonthLabel(overview.latestTradeDate, true)}`
}

function calculateDelayDays(
  transactionDate: string | null,
  filingDate: string,
): number | null {
  if (transactionDate === null) {
    return null
  }

  const tradedAt = new Date(transactionDate)
  const filedAt = new Date(filingDate)
  const difference = filedAt.getTime() - tradedAt.getTime()

  return difference < 0 ? null : Math.round(difference / (1000 * 60 * 60 * 24))
}

function midpoint(
  amountMin: number | null,
  amountMax: number | null,
): number {
  const floor = amountMin ?? amountMax ?? 0
  const ceiling = amountMax ?? amountMin ?? 0
  return (floor + ceiling) / 2
}

function formatMonthLabel(value: string, includeDay = false): string {
  const date = new Date(value)

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    ...(includeDay ? { day: 'numeric' } : {}),
  }).format(date)
}
