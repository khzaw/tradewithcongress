import type { Pool, PoolClient } from 'pg'

type DateLike = Date | string | null
type NumericLike = number | string | null

export interface Queryable {
  query: Pool['query'] | PoolClient['query']
}

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

export interface TickerTradeActivity {
  ticker: string
  transactionId: string
  officialId: string
  officialDisplayName: string
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

interface OfficialSummaryRow {
  official_id: NumericLike
  display_name: string
  sort_name: string
  chamber: string
  official_type: string
  state_code: string | null
  district_code: string | null
  party: string | null
  is_current: boolean
  aliases: string[]
  filing_count: NumericLike
  latest_filing_date: DateLike
  latest_ptr_filing_date: DateLike
  transaction_count: NumericLike
  first_transaction_date: DateLike
  latest_transaction_date: DateLike
  position_count: NumericLike
  latest_position_filing_date: DateLike
}

interface PortfolioPositionRow {
  position_id: NumericLike
  official_id: NumericLike
  official_display_name: string
  chamber: string
  state_code: string | null
  district_code: string | null
  party: string | null
  asset_id: NumericLike
  ticker: string | null
  asset_name: string
  issuer_name: string | null
  asset_type: string
  is_exchange_traded: boolean | null
  owner_type: string
  position_status: string
  amount_min: NumericLike
  amount_max: NumericLike
  amount_range_label: string | null
  confidence_score: NumericLike
  confidence_label: string
  rationale: string | null
  as_of_filing_date: DateLike
  last_transaction_date: DateLike
  portfolio_rank: NumericLike
}

interface OfficialTradeActivityRow {
  transaction_id: NumericLike
  official_id: NumericLike
  official_display_name: string
  chamber: string
  state_code: string | null
  district_code: string | null
  party: string | null
  filing_id: NumericLike
  report_type: string
  filing_date: DateLike
  asset_id: NumericLike
  ticker: string | null
  asset_name: string
  issuer_name: string | null
  asset_type: string
  source_row_number: number | null
  owner_type: string
  transaction_type: string
  transaction_date: DateLike
  notification_date: DateLike
  activity_date: DateLike
  amount_min: NumericLike
  amount_max: NumericLike
  amount_range_label: string
  comment: string | null
  raw_ticker: string | null
  raw_asset_name: string
  activity_rank: NumericLike
}

interface TickerSummaryRow {
  ticker: string
  representative_asset_name: string
  representative_issuer_name: string | null
  representative_asset_type: string
  transaction_count: NumericLike
  trading_official_count: NumericLike
  first_transaction_date: DateLike
  latest_transaction_date: DateLike
  holding_count: NumericLike
  holder_count: NumericLike
  latest_position_filing_date: DateLike
}

interface TickerTradeActivityRow {
  ticker: string
  transaction_id: NumericLike
  official_id: NumericLike
  official_display_name: string
  chamber: string
  state_code: string | null
  district_code: string | null
  party: string | null
  filing_id: NumericLike
  filing_date: DateLike
  asset_id: NumericLike
  asset_name: string
  issuer_name: string | null
  asset_type: string
  owner_type: string
  transaction_type: string
  transaction_date: DateLike
  notification_date: DateLike
  activity_date: DateLike
  amount_min: NumericLike
  amount_max: NumericLike
  amount_range_label: string
  ticker_activity_rank: NumericLike
}

interface TickerHolderRow {
  ticker: string
  position_id: NumericLike
  official_id: NumericLike
  official_display_name: string
  chamber: string
  state_code: string | null
  district_code: string | null
  party: string | null
  asset_id: NumericLike
  asset_name: string
  issuer_name: string | null
  asset_type: string
  owner_type: string
  position_status: string
  amount_min: NumericLike
  amount_max: NumericLike
  amount_range_label: string | null
  confidence_score: NumericLike
  confidence_label: string
  as_of_filing_date: DateLike
  last_transaction_date: DateLike
  holder_rank: NumericLike
}

export async function listOfficials(
  db: Queryable,
  limit: number,
): Promise<OfficialSummary[]> {
  const result = await db.query<OfficialSummaryRow>(
    `
      SELECT *
      FROM official_profile_summaries_vw
      ORDER BY position_count DESC, transaction_count DESC, display_name
      LIMIT $1
    `,
    [limit],
  )

  return result.rows.map(mapOfficialSummary)
}

export async function getOfficialSummary(
  db: Queryable,
  officialId: number,
): Promise<OfficialSummary | null> {
  const result = await db.query<OfficialSummaryRow>(
    `
      SELECT *
      FROM official_profile_summaries_vw
      WHERE official_id = $1
    `,
    [officialId],
  )

  return result.rowCount === 0 ? null : mapOfficialSummary(result.rows[0])
}

export async function getOfficialPortfolio(
  db: Queryable,
  officialId: number,
  limit: number,
): Promise<PortfolioPosition[]> {
  const result = await db.query<PortfolioPositionRow>(
    `
      SELECT *
      FROM official_portfolio_positions_vw
      WHERE official_id = $1
      ORDER BY portfolio_rank
      LIMIT $2
    `,
    [officialId, limit],
  )

  return result.rows.map(mapPortfolioPosition)
}

export async function getOfficialTrades(
  db: Queryable,
  officialId: number,
  limit: number,
): Promise<OfficialTradeActivity[]> {
  const result = await db.query<OfficialTradeActivityRow>(
    `
      SELECT *
      FROM official_trade_activity_vw
      WHERE official_id = $1
      ORDER BY activity_rank
      LIMIT $2
    `,
    [officialId, limit],
  )

  return result.rows.map(mapOfficialTradeActivity)
}

export async function listTickers(
  db: Queryable,
  limit: number,
): Promise<TickerSummary[]> {
  const result = await db.query<TickerSummaryRow>(
    `
      SELECT *
      FROM ticker_summaries_vw
      ORDER BY transaction_count DESC, ticker
      LIMIT $1
    `,
    [limit],
  )

  return result.rows.map(mapTickerSummary)
}

export async function getTickerSummary(
  db: Queryable,
  ticker: string,
): Promise<TickerSummary | null> {
  const result = await db.query<TickerSummaryRow>(
    `
      SELECT *
      FROM ticker_summaries_vw
      WHERE ticker = upper($1)
    `,
    [ticker],
  )

  return result.rowCount === 0 ? null : mapTickerSummary(result.rows[0])
}

export async function getTickerTrades(
  db: Queryable,
  ticker: string,
  limit: number,
): Promise<TickerTradeActivity[]> {
  const result = await db.query<TickerTradeActivityRow>(
    `
      SELECT *
      FROM ticker_trade_activity_vw
      WHERE ticker = upper($1)
      ORDER BY ticker_activity_rank
      LIMIT $2
    `,
    [ticker, limit],
  )

  return result.rows.map(mapTickerTradeActivity)
}

export async function getTickerHolders(
  db: Queryable,
  ticker: string,
  limit: number,
): Promise<TickerHolder[]> {
  const result = await db.query<TickerHolderRow>(
    `
      SELECT *
      FROM ticker_latest_holders_vw
      WHERE ticker = upper($1)
      ORDER BY holder_rank
      LIMIT $2
    `,
    [ticker, limit],
  )

  return result.rows.map(mapTickerHolder)
}

function mapOfficialSummary(row: OfficialSummaryRow): OfficialSummary {
  return {
    officialId: toIdentifier(row.official_id),
    displayName: row.display_name,
    sortName: row.sort_name,
    chamber: row.chamber,
    officialType: row.official_type,
    stateCode: row.state_code,
    districtCode: row.district_code,
    party: row.party,
    isCurrent: row.is_current,
    aliases: row.aliases,
    filingCount: toNumber(row.filing_count) ?? 0,
    latestFilingDate: formatDate(row.latest_filing_date),
    latestPtrFilingDate: formatDate(row.latest_ptr_filing_date),
    transactionCount: toNumber(row.transaction_count) ?? 0,
    firstTransactionDate: formatDate(row.first_transaction_date),
    latestTransactionDate: formatDate(row.latest_transaction_date),
    positionCount: toNumber(row.position_count) ?? 0,
    latestPositionFilingDate: formatDate(row.latest_position_filing_date),
  }
}

function mapPortfolioPosition(row: PortfolioPositionRow): PortfolioPosition {
  return {
    positionId: toIdentifier(row.position_id),
    officialId: toIdentifier(row.official_id),
    officialDisplayName: row.official_display_name,
    chamber: row.chamber,
    stateCode: row.state_code,
    districtCode: row.district_code,
    party: row.party,
    assetId: toIdentifier(row.asset_id),
    ticker: row.ticker,
    assetName: row.asset_name,
    issuerName: row.issuer_name,
    assetType: row.asset_type,
    isExchangeTraded: row.is_exchange_traded,
    ownerType: row.owner_type,
    positionStatus: row.position_status,
    amountMin: toNumber(row.amount_min),
    amountMax: toNumber(row.amount_max),
    amountRangeLabel: row.amount_range_label,
    confidenceScore: toNumber(row.confidence_score) ?? 0,
    confidenceLabel: row.confidence_label,
    rationale: row.rationale,
    asOfFilingDate: formatDate(row.as_of_filing_date),
    lastTransactionDate: formatDate(row.last_transaction_date),
    portfolioRank: toNumber(row.portfolio_rank) ?? 0,
  }
}

function mapOfficialTradeActivity(
  row: OfficialTradeActivityRow,
): OfficialTradeActivity {
  return {
    transactionId: toIdentifier(row.transaction_id),
    officialId: toIdentifier(row.official_id),
    officialDisplayName: row.official_display_name,
    chamber: row.chamber,
    stateCode: row.state_code,
    districtCode: row.district_code,
    party: row.party,
    filingId: toIdentifier(row.filing_id),
    reportType: row.report_type,
    filingDate: formatDate(row.filing_date) ?? '',
    assetId: row.asset_id === null ? null : toIdentifier(row.asset_id),
    ticker: row.ticker,
    assetName: row.asset_name,
    issuerName: row.issuer_name,
    assetType: row.asset_type,
    sourceRowNumber: row.source_row_number,
    ownerType: row.owner_type,
    transactionType: row.transaction_type,
    transactionDate: formatDate(row.transaction_date),
    notificationDate: formatDate(row.notification_date),
    activityDate: formatDate(row.activity_date) ?? '',
    amountMin: toNumber(row.amount_min),
    amountMax: toNumber(row.amount_max),
    amountRangeLabel: row.amount_range_label,
    comment: row.comment,
    rawTicker: row.raw_ticker,
    rawAssetName: row.raw_asset_name,
    activityRank: toNumber(row.activity_rank) ?? 0,
  }
}

function mapTickerSummary(row: TickerSummaryRow): TickerSummary {
  return {
    ticker: row.ticker,
    representativeAssetName: row.representative_asset_name,
    representativeIssuerName: row.representative_issuer_name,
    representativeAssetType: row.representative_asset_type,
    transactionCount: toNumber(row.transaction_count) ?? 0,
    tradingOfficialCount: toNumber(row.trading_official_count) ?? 0,
    firstTransactionDate: formatDate(row.first_transaction_date),
    latestTransactionDate: formatDate(row.latest_transaction_date),
    holdingCount: toNumber(row.holding_count) ?? 0,
    holderCount: toNumber(row.holder_count) ?? 0,
    latestPositionFilingDate: formatDate(row.latest_position_filing_date),
  }
}

function mapTickerTradeActivity(row: TickerTradeActivityRow): TickerTradeActivity {
  return {
    ticker: row.ticker,
    transactionId: toIdentifier(row.transaction_id),
    officialId: toIdentifier(row.official_id),
    officialDisplayName: row.official_display_name,
    chamber: row.chamber,
    stateCode: row.state_code,
    districtCode: row.district_code,
    party: row.party,
    filingId: toIdentifier(row.filing_id),
    filingDate: formatDate(row.filing_date) ?? '',
    assetId: toIdentifier(row.asset_id),
    assetName: row.asset_name,
    issuerName: row.issuer_name,
    assetType: row.asset_type,
    ownerType: row.owner_type,
    transactionType: row.transaction_type,
    transactionDate: formatDate(row.transaction_date),
    notificationDate: formatDate(row.notification_date),
    activityDate: formatDate(row.activity_date) ?? '',
    amountMin: toNumber(row.amount_min),
    amountMax: toNumber(row.amount_max),
    amountRangeLabel: row.amount_range_label,
    tickerActivityRank: toNumber(row.ticker_activity_rank) ?? 0,
  }
}

function mapTickerHolder(row: TickerHolderRow): TickerHolder {
  return {
    ticker: row.ticker,
    positionId: toIdentifier(row.position_id),
    officialId: toIdentifier(row.official_id),
    officialDisplayName: row.official_display_name,
    chamber: row.chamber,
    stateCode: row.state_code,
    districtCode: row.district_code,
    party: row.party,
    assetId: toIdentifier(row.asset_id),
    assetName: row.asset_name,
    issuerName: row.issuer_name,
    assetType: row.asset_type,
    ownerType: row.owner_type,
    positionStatus: row.position_status,
    amountMin: toNumber(row.amount_min),
    amountMax: toNumber(row.amount_max),
    amountRangeLabel: row.amount_range_label,
    confidenceScore: toNumber(row.confidence_score) ?? 0,
    confidenceLabel: row.confidence_label,
    asOfFilingDate: formatDate(row.as_of_filing_date),
    lastTransactionDate: formatDate(row.last_transaction_date),
    holderRank: toNumber(row.holder_rank) ?? 0,
  }
}

function formatDate(value: DateLike): string | null {
  if (value === null) {
    return null
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }

  return value
}

function toNumber(value: NumericLike): number | null {
  if (value === null) {
    return null
  }

  if (typeof value === 'number') {
    return value
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toIdentifier(value: NumericLike): string {
  if (value === null) {
    throw new Error('Identifier value cannot be null')
  }

  return String(value)
}
