import type {
  MarketSeries,
  OfficialTradeActivity,
  OverviewSnapshot,
  PortfolioPosition,
  TickerTradeActivity,
} from './api.ts'

export interface SeriesPoint {
  label: string
  value: number
  displayValue?: number
  hoverLabel?: string
}

export interface BreakdownSegment {
  label: string
  value: number
}

type TradeLike = OfficialTradeActivity | TickerTradeActivity

export function mergeTradeActivity<T extends TradeLike>(trades: T[]): T[] {
  const mergedTrades = new Map<string, T>()

  for (const trade of trades) {
    const mergeKey = buildTradeMergeKey(trade)
    const existingTrade = mergedTrades.get(mergeKey)

    if (existingTrade === undefined) {
      mergedTrades.set(mergeKey, { ...trade })
      continue
    }

    existingTrade.amountMin = sumNullableAmounts(existingTrade.amountMin, trade.amountMin)
    existingTrade.amountMax = sumNullableAmounts(existingTrade.amountMax, trade.amountMax)
    existingTrade.amountRangeLabel =
      formatAmountRangeLabel(existingTrade.amountMin, existingTrade.amountMax) ??
      existingTrade.amountRangeLabel
  }

  return [...mergedTrades.values()]
}

export function totalEstimatedTradeVolume(trades: TradeLike[]): number {
  return trades.reduce((total, trade) => total + midpoint(trade.amountMin, trade.amountMax), 0)
}

export function buildOverviewSeries(
  overview: OverviewSnapshot,
): SeriesPoint[] {
  const values = overview.monthlyActivity.map((bucket) => ({
    label: formatMonthLabel(bucket.monthStart),
    value: bucket.estimatedVolume > 0 ? bucket.estimatedVolume : bucket.tradeCount,
  }))

  return normalizeSeries(values)
}

export function buildOverviewBenchmarkSeries(
  overview: OverviewSnapshot,
): SeriesPoint[] | null {
  if (overview.benchmark === null) {
    return null
  }

  const monthValues = new Map<string, number>()
  for (const point of overview.benchmark.points) {
    monthValues.set(point.date.slice(0, 7), point.normalizedClose)
  }

  let lastKnownValue = monthValues.get(overview.monthlyActivity[0]?.monthStart.slice(0, 7) ?? '') ?? 100

  return overview.monthlyActivity.map((bucket) => {
    const monthKey = bucket.monthStart.slice(0, 7)
    lastKnownValue = monthValues.get(monthKey) ?? lastKnownValue

    return {
      label: formatMonthLabel(bucket.monthStart),
      value: lastKnownValue,
      displayValue: lastKnownValue,
      hoverLabel: formatMonthLabel(bucket.monthStart, true),
    }
  })
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
    hoverLabel: formatMonthLabel(`${monthStart}-01`, true),
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
    const label = normalizeTradeActionLabel(trade.transactionType)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value)
}

export function normalizeTradeActionLabel(value: string): string {
  const normalized = value.trim().toLowerCase().replaceAll('_', ' ')

  if (normalized.includes('buy') || normalized.includes('purchase')) {
    return 'buy'
  }

  if (normalized.includes('sell') || normalized.includes('sale')) {
    return 'sell'
  }

  return normalized
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

export function buildMarketSeries(
  series: MarketSeries | null,
  pointLimit = 12,
): SeriesPoint[] | null {
  if (series === null) {
    return null
  }

  return series.points.slice(-pointLimit).map((point) => ({
    label: formatMonthLabel(point.date, true),
    value: point.normalizedClose,
    displayValue: point.close,
    hoverLabel: formatHoverDate(point.date),
  }))
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

export function relativeMarketReturn(series: MarketSeries | null): number | null {
  if (series === null || series.points.length < 2) {
    return null
  }

  const firstValue = series.points[0]?.normalizedClose ?? 100
  const lastValue = series.points[series.points.length - 1]?.normalizedClose ?? 100

  return firstValue === 0 ? null : ((lastValue - firstValue) / firstValue) * 100
}

export function relativeMarketSpread(
  security: MarketSeries | null,
  benchmark: MarketSeries | null,
): number | null {
  const securityReturn = relativeMarketReturn(security)
  const benchmarkReturn = relativeMarketReturn(benchmark)

  if (securityReturn === null || benchmarkReturn === null) {
    return null
  }

  return securityReturn - benchmarkReturn
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

function buildTradeMergeKey(trade: TradeLike): string {
  return [
    trade.officialId,
    trade.filingId,
    trade.assetId ?? '',
    trade.ticker ?? '',
    trade.assetName.trim().toLowerCase(),
    trade.ownerType.trim().toLowerCase(),
    normalizeTradeActionLabel(trade.transactionType),
    trade.transactionDate ?? '',
    trade.notificationDate ?? '',
    trade.activityDate,
    trade.filingDate,
  ].join('|')
}

function sumNullableAmounts(left: number | null, right: number | null): number | null {
  if (left === null && right === null) {
    return null
  }

  return (left ?? 0) + (right ?? 0)
}

function formatAmountRangeLabel(
  amountMin: number | null,
  amountMax: number | null,
): string | null {
  if (amountMin === null && amountMax === null) {
    return null
  }

  if (amountMin !== null && amountMax !== null && amountMin === amountMax) {
    return formatFullCurrency(amountMin)
  }

  const lowerBound = amountMin ?? amountMax
  const upperBound = amountMax ?? amountMin

  if (lowerBound === null || upperBound === null) {
    return null
  }

  return `${formatFullCurrency(lowerBound)} - ${formatFullCurrency(upperBound)}`
}

function formatFullCurrency(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

function normalizeSeries(points: SeriesPoint[]): SeriesPoint[] {
  const baseline = points.find((point) => point.value > 0)?.value ?? 0

  if (baseline === 0) {
    return points
  }

  return points.map((point) => ({
    ...point,
    value: (point.value / baseline) * 100,
  }))
}

function formatMonthLabel(value: string, includeDay = false): string {
  const date = new Date(value)

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    ...(includeDay ? { day: 'numeric' } : {}),
  }).format(date)
}

function formatHoverDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}
