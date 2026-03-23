export interface OfficialSummary {
  officialId: string
  displayName: string
  sortName: string
  chamber: string
  officialType: string
  stateCode: string | null
  districtCode: string | null
  party: string | null
  isCurrent: boolean
  photoUrl: string | null
  aliases: string[]
  filingCount: number
  latestFilingDate: string | null
  latestPtrFilingDate: string | null
  transactionCount: number
  firstTransactionDate: string | null
  latestTransactionDate: string | null
  positionCount: number
  latestPositionFilingDate: string | null
}

export interface TickerSummary {
  ticker: string
  representativeAssetName: string
  representativeIssuerName: string | null
  representativeAssetType: string
  transactionCount: number
  tradingOfficialCount: number
  firstTransactionDate: string | null
  latestTransactionDate: string | null
  holdingCount: number
  holderCount: number
  latestPositionFilingDate: string | null
}

export interface PortfolioPosition {
  positionId: string
  officialId: string
  officialDisplayName: string
  chamber: string
  stateCode: string | null
  districtCode: string | null
  party: string | null
  assetId: string
  ticker: string | null
  assetName: string
  issuerName: string | null
  assetType: string
  isExchangeTraded: boolean | null
  ownerType: string
  positionStatus: string
  amountMin: number | null
  amountMax: number | null
  amountRangeLabel: string | null
  confidenceScore: number
  confidenceLabel: string
  rationale: string | null
  asOfFilingDate: string | null
  lastTransactionDate: string | null
  portfolioRank: number
}

export interface OfficialTradeActivity {
  transactionId: string
  officialId: string
  officialDisplayName: string
  photoUrl: string | null
  chamber: string
  stateCode: string | null
  districtCode: string | null
  party: string | null
  filingId: string
  reportType: string
  filingDate: string
  assetId: string | null
  ticker: string | null
  assetName: string
  issuerName: string | null
  assetType: string
  sourceRowNumber: number | null
  ownerType: string
  transactionType: string
  transactionDate: string | null
  notificationDate: string | null
  activityDate: string
  amountMin: number | null
  amountMax: number | null
  amountRangeLabel: string
  comment: string | null
  rawTicker: string | null
  rawAssetName: string
  activityRank: number
}

export interface TickerTradeActivity {
  ticker: string
  transactionId: string
  officialId: string
  officialDisplayName: string
  photoUrl: string | null
  chamber: string
  stateCode: string | null
  districtCode: string | null
  party: string | null
  filingId: string
  filingDate: string
  assetId: string
  assetName: string
  issuerName: string | null
  assetType: string
  ownerType: string
  transactionType: string
  transactionDate: string | null
  notificationDate: string | null
  activityDate: string
  amountMin: number | null
  amountMax: number | null
  amountRangeLabel: string
  tickerActivityRank: number
}

export interface TickerHolder {
  ticker: string
  positionId: string
  officialId: string
  officialDisplayName: string
  photoUrl: string | null
  chamber: string
  stateCode: string | null
  districtCode: string | null
  party: string | null
  assetId: string
  assetName: string
  issuerName: string | null
  assetType: string
  ownerType: string
  positionStatus: string
  amountMin: number | null
  amountMax: number | null
  amountRangeLabel: string | null
  confidenceScore: number
  confidenceLabel: string
  asOfFilingDate: string | null
  lastTransactionDate: string | null
  holderRank: number
}

export interface OverviewActivityBucket {
  monthStart: string
  tradeCount: number
  estimatedVolume: number
}

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

export interface OverviewSnapshot {
  trackedOfficials: number
  trackedFilings: number
  trackedTrades: number
  trackedAssets: number
  activeHolders: number
  latestTradeDate: string | null
  monthlyActivity: OverviewActivityBucket[]
  recentTrades: OfficialTradeActivity[]
  benchmark: MarketSeries | null
}

export interface OfficialSearchResult {
  officialId: string
  displayName: string
  chamber: string
  officialType: string
  stateCode: string | null
  districtCode: string | null
  party: string | null
  matchedAlias: string
  positionCount: number
  transactionCount: number
  score: number
}

export interface TickerSearchResult {
  ticker: string
  representativeAssetName: string
  representativeIssuerName: string | null
  representativeAssetType: string
  transactionCount: number
  holderCount: number
  matchedField: string
  score: number
}

export interface SearchState {
  query: string
  officials: OfficialSearchResult[]
  tickers: TickerSearchResult[]
}

export interface ApiState {
  apiVersion: string
  topOfficials: OfficialSummary[]
  topTickers: TickerSummary[]
}

export interface DashboardState extends ApiState {
  overview: OverviewSnapshot
}

export interface OfficialDetail {
  summary: OfficialSummary
  portfolio: PortfolioPosition[]
  trades: OfficialTradeActivity[]
}

export interface TickerDetail {
  summary: TickerSummary
  holders: TickerHolder[]
  trades: TickerTradeActivity[]
  market: TickerMarketSnapshot
}

interface ResponseEnvelope<TData> {
  data: TData
}

interface MetaResponse {
  apiVersion: string
}

interface RequestOptions {
  signal?: AbortSignal
}

const HOMEPAGE_OFFICIAL_FETCH_LIMIT = 12
const HOMEPAGE_FEATURED_OFFICIAL_COUNT = 12
const HOMEPAGE_TICKER_FETCH_LIMIT = 12

export async function fetchHomepageData(
  options: RequestOptions = {},
): Promise<DashboardState> {
  const [metaBody, overviewBody, officialsBody, tickersBody] = await Promise.all([
    getJson<MetaResponse>('/api/v1/meta', options),
    getJson<ResponseEnvelope<OverviewSnapshot>>('/api/v1/overview?limit=12', options),
    getJson<ResponseEnvelope<OfficialSummary[]>>(
      `/api/v1/officials?limit=${HOMEPAGE_OFFICIAL_FETCH_LIMIT}`,
      options,
    ),
    getJson<ResponseEnvelope<TickerSummary[]>>(
      `/api/v1/tickers?limit=${HOMEPAGE_TICKER_FETCH_LIMIT}`,
      options,
    ),
  ])

  return {
    apiVersion: metaBody.apiVersion,
    overview: overviewBody.data,
    topOfficials: pickFeaturedOfficials(
      officialsBody.data,
      HOMEPAGE_FEATURED_OFFICIAL_COUNT,
    ),
    topTickers: tickersBody.data,
  }
}

export function fetchSearchResults(
  query: string,
  options: RequestOptions = {},
): Promise<ResponseEnvelope<SearchState>> {
  return getJson<ResponseEnvelope<SearchState>>(
    `/api/v1/search?q=${encodeURIComponent(query)}&limit=5`,
    options,
  )
}

export async function fetchOfficialDetail(
  officialId: string,
  options: RequestOptions = {},
): Promise<OfficialDetail> {
  const [summary, portfolio, trades] = await Promise.all([
    getJson<ResponseEnvelope<OfficialSummary>>(`/api/v1/officials/${officialId}`, options),
    getJson<ResponseEnvelope<PortfolioPosition[]>>(
      `/api/v1/officials/${officialId}/portfolio?limit=20`,
      options,
    ),
    getJson<ResponseEnvelope<OfficialTradeActivity[]>>(
      `/api/v1/officials/${officialId}/trades?limit=20`,
      options,
    ),
  ])

  return {
    summary: summary.data,
    portfolio: portfolio.data,
    trades: trades.data,
  }
}

export async function fetchTickerDetail(
  ticker: string,
  options: RequestOptions = {},
): Promise<TickerDetail> {
  const normalizedTicker = ticker.trim().toUpperCase()
  const [summary, holders, trades, market] = await Promise.all([
    getJson<ResponseEnvelope<TickerSummary>>(`/api/v1/tickers/${normalizedTicker}`, options),
    getJson<ResponseEnvelope<TickerHolder[]>>(
      `/api/v1/tickers/${normalizedTicker}/holders?limit=20`,
      options,
    ),
    getJson<ResponseEnvelope<TickerTradeActivity[]>>(
      `/api/v1/tickers/${normalizedTicker}/trades?limit=20`,
      options,
    ),
    getJson<ResponseEnvelope<TickerMarketSnapshot>>(
      `/api/v1/tickers/${normalizedTicker}/market`,
      options,
    ),
  ])

  return {
    summary: summary.data,
    holders: holders.data,
    trades: trades.data,
    market: market.data,
  }
}

async function getJson<TData>(
  input: string,
  { signal }: RequestOptions,
): Promise<TData> {
  const response = await fetch(input, { signal })
  if (!response.ok) {
    throw new Error(`Request failed for ${input}`)
  }

  return (await response.json()) as TData
}

function pickFeaturedOfficials(
  officials: OfficialSummary[],
  count: number,
): OfficialSummary[] {
  const withPhotos = officials.filter((official) => official.photoUrl !== null)
  const withoutPhotos = officials.filter((official) => official.photoUrl === null)

  return [...withPhotos, ...withoutPhotos].slice(0, count)
}
