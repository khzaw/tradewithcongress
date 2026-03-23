import { startTransition, useEffect, useState } from 'react'

import './App.css'
import {
  fetchHomepageData,
  fetchOfficialDetail,
  fetchSearchResults,
  fetchTickerDetail,
  type DashboardState,
  type OfficialDetail,
  type OfficialSummary,
  type OfficialTradeActivity,
  type PortfolioPosition,
  type SearchState,
  type TickerDetail,
} from './api.ts'
import { RingChart, TrendChart } from './charts.tsx'
import {
  averageFilingDelayDays,
  buildAssetTypeBreakdown,
  buildMarketSeries,
  buildMonthlyTradeSeries,
  buildOverviewBenchmarkSeries,
  buildOverviewSeries,
  buildPartyBreakdown,
  buildPortfolioExposure,
  buildTradeTypeBreakdown,
  latestActivityLabel,
  relativeMarketReturn,
  relativeMarketSpread,
  relativeOverviewReturn,
  totalEstimatedTradeVolume,
} from './insights.ts'
import { buildViewSearch, parseView, type AppView } from './navigation.ts'

const EMPTY_STATE: DashboardState = {
  apiVersion: 'v1',
  overview: {
    trackedOfficials: 0,
    trackedFilings: 0,
    trackedTrades: 0,
    trackedAssets: 0,
    activeHolders: 0,
    latestTradeDate: null,
    monthlyActivity: [],
    recentTrades: [],
    benchmark: null,
  },
  topOfficials: [],
  topTickers: [],
}

const EMPTY_SEARCH_STATE: SearchState = {
  query: '',
  officials: [],
  tickers: [],
}

const STATIC_SECTORS = [
  'Technology',
  'Healthcare',
  'Defense',
  'Finance',
  'Energy',
  'Industrials',
]

const STATIC_ASSET_TYPES = ['Stocks', 'ETFs', 'Options', 'Bonds', 'Funds']

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

type DetailState =
  | { status: 'idle' }
  | { status: 'loading'; view: Exclude<AppView, { kind: 'overview' }> }
  | {
      status: 'ready'
      view: Exclude<AppView, { kind: 'overview' }>
      data: OfficialDetail | TickerDetail
    }
  | { status: 'error'; view: Exclude<AppView, { kind: 'overview' }> }

function App() {
  const [dashboardState, setDashboardState] = useState<DashboardState>(EMPTY_STATE)
  const [status, setStatus] = useState<LoadStatus>('idle')
  const [view, setView] = useState<AppView>(() => parseView(window.location.search))
  const [detailState, setDetailState] = useState<DetailState>(() =>
    createDetailStateForView(parseView(window.location.search)),
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [searchState, setSearchState] = useState<SearchState>(EMPTY_SEARCH_STATE)
  const [searchStatus, setSearchStatus] = useState<LoadStatus>('idle')

  useEffect(() => {
    const abortController = new AbortController()

    async function load(): Promise<void> {
      setStatus('loading')

      try {
        const nextState = await fetchHomepageData({
          signal: abortController.signal,
        })

        if (abortController.signal.aborted) {
          return
        }

        startTransition(() => {
          setDashboardState(nextState)
          setStatus('ready')
        })
      } catch (error) {
        if (isAbortError(error)) {
          return
        }

        setStatus('error')
      }
    }

    void load()

    return () => {
      abortController.abort()
    }
  }, [])

  useEffect(() => {
    function handlePopState(): void {
      const nextView = parseView(window.location.search)
      startTransition(() => {
        setView(nextView)
        setDetailState(createDetailStateForView(nextView))
      })
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  useEffect(() => {
    if (view.kind === 'overview') {
      return
    }

    const activeView: Exclude<AppView, { kind: 'overview' }> = view
    const abortController = new AbortController()

    async function loadDetail(): Promise<void> {
      try {
        const data =
          activeView.kind === 'official'
            ? await fetchOfficialDetail(activeView.officialId, {
                signal: abortController.signal,
              })
            : await fetchTickerDetail(activeView.ticker, {
                signal: abortController.signal,
              })

        if (abortController.signal.aborted) {
          return
        }

        startTransition(() => {
          setDetailState({
            status: 'ready',
            view: activeView,
            data,
          })
        })
      } catch (error) {
        if (isAbortError(error)) {
          return
        }

        setDetailState({
          status: 'error',
          view: activeView,
        })
      }
    }

    void loadDetail()

    return () => {
      abortController.abort()
    }
  }, [view])

  async function handleSearchSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault()

    const query = searchQuery.trim()
    if (query.length < 2) {
      setSearchStatus('error')
      return
    }

    setSearchStatus('loading')

    try {
      const body = await fetchSearchResults(query)

      startTransition(() => {
        setSearchState(body.data)
        setSearchStatus('ready')
      })
    } catch {
      setSearchStatus('error')
    }
  }

  function navigateToView(nextView: AppView): void {
    const nextSearch = buildViewSearch(nextView)
    const nextUrl = `${window.location.pathname}${nextSearch}`
    window.history.pushState(null, '', nextUrl)

    startTransition(() => {
      setView(nextView)
      setDetailState(createDetailStateForView(nextView))
    })
  }

  return (
    <main className="studio-shell">
      <header className={view.kind === 'overview' ? 'topbar' : 'topbar topbar-detail'}>
        <div className="topbar-headline">
          <div className="topbar-row">
            <div className="brand-wordmark">tradewithcongress</div>
            <nav className="topbar-links" aria-label="Project status">
              <span className="topbar-link">Docs</span>
              <span className="topbar-link">Search</span>
              <span className="topbar-link topbar-link-active">House live</span>
            </nav>
          </div>

          <div className="brand-stack">
            {view.kind === 'overview' ? (
              <>
                <span className="section-kicker">Congressional trading desk</span>
                <h1 className="intro-headline">
                  Track portfolios, trade flow, and filing lag from public congressional disclosures.
                </h1>
                <p className="brand-copy">
                  Search members or tickers, inspect latest disclosed holdings, benchmark activity against the market, and keep every claim tied to the source filing.
                </p>
              </>
            ) : (
              <>
                <span className="section-kicker">Trading desk</span>
                <h1 className="detail-headline">
                  {view.kind === 'official' ? 'Official profile' : 'Ticker profile'}
                </h1>
                <p className="brand-copy">
                  Move between members, issuers, and the underlying disclosure ledger without losing the market or filing context.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="topbar-meta">
          <nav className="pill-row" aria-label="Primary views">
            <button
              className={view.kind === 'overview' ? 'pill pill-active' : 'pill'}
              type="button"
              onClick={() => navigateToView({ kind: 'overview' })}
            >
              Overview
            </button>
            <span className="pill pill-muted">House live</span>
            <span className="pill pill-muted">Senate next</span>
            <span className="pill pill-muted">API {dashboardState.apiVersion}</span>
          </nav>

          <form className="command-form" onSubmit={(event) => void handleSearchSubmit(event)}>
            <input
              className="command-input"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search Pelosi, NVDA, Microsoft, House..."
              aria-label="Search officials or tickers"
            />
            <button className="command-button" type="submit">Search</button>
          </form>

          <div className="topbar-ledger" aria-label="Coverage summary">
            <LedgerItem
              label="Coverage"
              value={`${formatInteger(dashboardState.overview.trackedOfficials)} officials`}
              detail={`${formatInteger(dashboardState.overview.trackedFilings)} filings indexed`}
            />
            <LedgerItem
              label="Trade flow"
              value={`${formatInteger(dashboardState.overview.trackedTrades)} parsed trades`}
              detail={latestActivityLabel(dashboardState.overview)}
            />
            <LedgerItem
              label="Benchmark"
              value={
                dashboardState.overview.benchmark === null
                  ? 'SPY lane ready'
                  : `${dashboardState.overview.benchmark.symbol} cached`
              }
              detail={
                dashboardState.overview.benchmark === null
                  ? 'Set market data env to activate'
                  : `As of ${formatDate(dashboardState.overview.benchmark.asOfDate) ?? 'n/a'}`
              }
            />
          </div>
        </div>
      </header>

      <SearchResultsPanel
        searchState={searchState}
        searchStatus={searchStatus}
        onOfficialSelect={(officialId) => navigateToView({ kind: 'official', officialId })}
        onTickerSelect={(ticker) => navigateToView({ kind: 'ticker', ticker })}
      />

      {view.kind === 'overview' ? (
        <OverviewView
          dashboardState={dashboardState}
          status={status}
          onOfficialSelect={(officialId) => navigateToView({ kind: 'official', officialId })}
          onTickerSelect={(ticker) => navigateToView({ kind: 'ticker', ticker })}
        />
      ) : (
        <DetailSurface
          detailState={detailState}
          onBack={() => navigateToView({ kind: 'overview' })}
          onOfficialSelect={(officialId) => navigateToView({ kind: 'official', officialId })}
          onTickerSelect={(ticker) => navigateToView({ kind: 'ticker', ticker })}
        />
      )}
    </main>
  )
}

interface SearchResultsPanelProps {
  searchState: SearchState
  searchStatus: LoadStatus
  onOfficialSelect: (officialId: string) => void
  onTickerSelect: (ticker: string) => void
}

function SearchResultsPanel({
  searchState,
  searchStatus,
  onOfficialSelect,
  onTickerSelect,
}: SearchResultsPanelProps) {
  const shouldRender = searchStatus !== 'idle' || searchState.query !== ''
  if (!shouldRender) {
    return null
  }

  return (
    <section className="search-surface">
      <div className="surface-heading">
        <span className="section-kicker">Universal search</span>
        <h2>{searchState.query === '' ? 'Search the disclosure graph' : searchState.query}</h2>
      </div>

      {searchStatus === 'loading' ? <p className="muted-copy">Searching officials and issuers…</p> : null}
      {searchStatus === 'error' ? (
        <p className="muted-copy">Enter at least two characters to search officials and tickers.</p>
      ) : null}

      {searchStatus === 'ready' ? (
        <div className="search-grid">
          <article className="surface-card">
            <div className="surface-heading compact">
              <span className="section-kicker">Officials</span>
              <h3>{searchState.officials.length}</h3>
            </div>
            <ul className="command-list">
              {searchState.officials.map((official) => (
                <li key={official.officialId}>
                  <button
                    className="command-list-button"
                    type="button"
                    onClick={() => onOfficialSelect(official.officialId)}
                  >
                    <span>
                      <strong>{official.displayName}</strong>
                      <small>
                        {official.chamber} · {official.stateCode ?? 'n/a'} · alias {official.matchedAlias}
                      </small>
                    </span>
                    <span className="metric-inline">
                      {official.positionCount} holdings · {official.transactionCount} trades
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </article>

          <article className="surface-card">
            <div className="surface-heading compact">
              <span className="section-kicker">Tickers</span>
              <h3>{searchState.tickers.length}</h3>
            </div>
            <ul className="command-list">
              {searchState.tickers.map((ticker) => (
                <li key={ticker.ticker}>
                  <button
                    className="command-list-button"
                    type="button"
                    onClick={() => onTickerSelect(ticker.ticker)}
                  >
                    <span>
                      <strong>{ticker.ticker}</strong>
                      <small>
                        {ticker.representativeAssetName} · match {ticker.matchedField}
                      </small>
                    </span>
                    <span className="metric-inline">
                      {ticker.transactionCount} trades · {ticker.holderCount} holders
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </article>
        </div>
      ) : null}
    </section>
  )
}

interface OverviewViewProps {
  dashboardState: DashboardState
  status: LoadStatus
  onOfficialSelect: (officialId: string) => void
  onTickerSelect: (ticker: string) => void
}

function OverviewView({
  dashboardState,
  status,
  onOfficialSelect,
  onTickerSelect,
}: OverviewViewProps) {
  const overviewSeries = buildOverviewSeries(dashboardState.overview)
  const overviewBenchmarkSeries = buildOverviewBenchmarkSeries(dashboardState.overview)
  const hasOverviewBenchmark = dashboardState.overview.benchmark !== null
  const momentum = relativeOverviewReturn(dashboardState.overview)
  const benchmarkReturn = relativeMarketReturn(dashboardState.overview.benchmark)
  const benchmarkSpread =
    benchmarkReturn === null ? momentum : momentum - benchmarkReturn

  return (
    <section className="overview-layout">
      <aside className="rail-column">
        <section className="hero-surface">
          <span className="section-kicker">Current coverage</span>
          <h1>House disclosures are live now. Senate is the next ingest lane.</h1>
          <p className="muted-copy">
            Every table and chart here is rebuilt from parsed House filings, with timing, source provenance, and confidence preserved.
          </p>
        </section>

        <SurfaceCard
          kicker="Market surface"
          title={latestActivityLabel(dashboardState.overview)}
          description="Benchmark panels are already part of the layout. Live S&P price history is the next data feed."
        />

        <SurfaceCard kicker="Sectors" title="Explore by thesis">
          <div className="pill-cloud">
            {STATIC_SECTORS.map((sector) => (
              <span key={sector} className="pill pill-muted">
                {sector}
              </span>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard kicker="Asset types" title="Filter surface">
          <div className="pill-cloud">
            {STATIC_ASSET_TYPES.map((assetType) => (
              <span key={assetType} className="pill pill-muted">
                {assetType}
              </span>
            ))}
          </div>
        </SurfaceCard>
      </aside>

      <div className="overview-stage">
        <section className="metric-grid">
          <MetricCard
            label="Tracked officials"
            value={formatInteger(dashboardState.overview.trackedOfficials)}
            tone="lime"
            detail="House disclosures indexed"
          />
          <MetricCard
            label="Parsed trades"
            value={formatInteger(dashboardState.overview.trackedTrades)}
            tone="coral"
            detail={`${formatInteger(dashboardState.overview.trackedFilings)} filings across the graph`}
          />
          <MetricCard
            label="Active holders"
            value={formatInteger(dashboardState.overview.activeHolders)}
            tone="violet"
            detail={`${formatInteger(dashboardState.overview.trackedAssets)} canonical assets`}
          />
          <MetricCard
            label="Flow delta"
            value={formatSignedPercent(benchmarkSpread)}
            tone="neutral"
            detail={
              benchmarkReturn === null
                ? 'Disclosure-weighted activity index'
                : `Activity index vs ${dashboardState.overview.benchmark?.symbol ?? 'SPY'}`
            }
          />
        </section>

        <section className="showcase-grid">
          <article className="surface-card showcase-primary">
            <div className="surface-heading">
              <div>
                <span className="section-kicker">Performance surface</span>
                <h2>Disclosure activity index vs S&amp;P 500 proxy</h2>
              </div>
              <span className="note-pill">
                {dashboardState.overview.benchmark?.source ?? 'Set ALPHA_VANTAGE_API_KEY'}
              </span>
            </div>
            <p className="muted-copy">
              {hasOverviewBenchmark
                ? 'Trade flow is rebased to the first visible month so it can be compared against cached SPY weekly adjusted closes without pretending the two series are the same instrument.'
                : 'The comparison lane is wired to cached SPY weekly adjusted closes and will activate once a market-data key is configured.'}
            </p>
            <TrendChart
              points={overviewSeries}
              label="Disclosure activity index"
              tone="coral"
              comparisonPoints={hasOverviewBenchmark ? overviewBenchmarkSeries : null}
              comparisonLabel={hasOverviewBenchmark ? dashboardState.overview.benchmark?.label : undefined}
              comparisonTone="muted"
            />
          </article>

          <div className="showcase-side">
            <article className="surface-card">
              <div className="surface-heading compact">
                <span className="section-kicker">Portfolio leaders</span>
                <h3>Watchlist</h3>
              </div>
              <ul className="leader-list">
                {dashboardState.topOfficials.map((official, index) => (
                  <li key={official.officialId}>
                    <button
                      className="leader-button"
                      type="button"
                      onClick={() => onOfficialSelect(official.officialId)}
                    >
                      <span className="leader-rank">{String(index + 1).padStart(2, '0')}</span>
                      <span>
                        <strong>{official.displayName}</strong>
                        <small>
                          {official.party ?? 'N/A'} · {official.chamber} · {official.stateCode ?? 'n/a'}
                        </small>
                      </span>
                      <span className="metric-inline">
                        {official.positionCount} holdings
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </article>

            <article className="surface-card">
              <div className="surface-heading compact">
                <span className="section-kicker">Most traded issuers</span>
                <h3>Ticker flow</h3>
              </div>
              <ul className="ticker-list">
                {dashboardState.topTickers.map((ticker) => (
                  <li key={ticker.ticker}>
                    <button
                      className="ticker-list-button"
                      type="button"
                      onClick={() => onTickerSelect(ticker.ticker)}
                    >
                      <span>
                        <strong>{ticker.ticker}</strong>
                        <small>{ticker.representativeAssetName}</small>
                      </span>
                      <span className="metric-inline">
                        {ticker.transactionCount} trades
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </section>

        <article className="surface-card">
          <div className="surface-heading">
            <div>
              <span className="section-kicker">Recent disclosures</span>
              <h2>Latest parsed trade flow</h2>
            </div>
            {status === 'error' ? <span className="note-pill note-pill-error">API offline</span> : null}
          </div>
          <RecentTradeTable
            trades={dashboardState.overview.recentTrades}
            onOfficialSelect={onOfficialSelect}
            onTickerSelect={onTickerSelect}
          />
        </article>
      </div>
    </section>
  )
}

interface DetailSurfaceProps {
  detailState: DetailState
  onBack: () => void
  onOfficialSelect: (officialId: string) => void
  onTickerSelect: (ticker: string) => void
}

function DetailSurface({
  detailState,
  onBack,
  onOfficialSelect,
  onTickerSelect,
}: DetailSurfaceProps) {
  if (detailState.status === 'loading') {
    return (
      <section className="detail-layout">
        <SurfaceCard kicker="Loading" title={`Opening ${detailState.view.kind} desk`}>
          <p className="muted-copy">Pulling holdings, trades, and visual state from the read API.</p>
        </SurfaceCard>
      </section>
    )
  }

  if (detailState.status === 'error') {
    return (
      <section className="detail-layout">
        <SurfaceCard kicker="Unavailable" title="This view could not be loaded">
          <button className="text-button" type="button" onClick={onBack}>
            Back to overview
          </button>
        </SurfaceCard>
      </section>
    )
  }

  if (detailState.status !== 'ready') {
    return null
  }

  return detailState.view.kind === 'official' ? (
    <OfficialDetailView
      detail={detailState.data as OfficialDetail}
      onBack={onBack}
      onTickerSelect={onTickerSelect}
    />
  ) : (
    <TickerDetailView
      detail={detailState.data as TickerDetail}
      onBack={onBack}
      onOfficialSelect={onOfficialSelect}
    />
  )
}

interface OfficialDetailViewProps {
  detail: OfficialDetail
  onBack: () => void
  onTickerSelect: (ticker: string) => void
}

function OfficialDetailView({
  detail,
  onBack,
  onTickerSelect,
}: OfficialDetailViewProps) {
  const tradeSeries = buildMonthlyTradeSeries(detail.trades)
  const portfolioExposure = buildPortfolioExposure(detail.portfolio)
  const topHoldings = buildPortfolioExposure(detail.portfolio, 6)
  const assetTypeBreakdown = buildAssetTypeBreakdown(detail.portfolio)
  const tradeTypes = buildTradeTypeBreakdown(detail.trades)
  const delayDays = averageFilingDelayDays(detail.trades)
  const estimatedVolume = totalEstimatedTradeVolume(detail.trades)
  const hasTradeHistory = detail.trades.length > 0
  const issuerCount = countDistinct(
    detail.portfolio.map((position) => position.issuerName ?? position.ticker ?? position.assetName),
  )
  const latestProfileDate =
    detail.summary.latestTransactionDate ??
    detail.summary.latestPositionFilingDate ??
    detail.summary.latestFilingDate
  const profileInitials = buildInitials(detail.summary.displayName)

  return (
    <section className="detail-layout detail-layout-official">
      <aside className="profile-column">
        <article className="profile-card profile-card-official">
          <button className="text-button" type="button" onClick={onBack}>
            Back to overview
          </button>
          <div className="profile-avatar" aria-hidden="true">
            <span>{profileInitials}</span>
          </div>
          <span className="section-kicker">Selected member</span>
          <h1 className="profile-name">{detail.summary.displayName}</h1>
          <p className="profile-meta">{formatOfficialMeta(detail.summary)}</p>

          <div className="profile-stat-grid">
            <MetricStat label="Holdings" value={formatInteger(detail.summary.positionCount)} />
            <MetricStat label="Trades" value={formatInteger(detail.summary.transactionCount)} />
            <MetricStat
              label="Est. volume"
              value={formatCompactCurrency(estimatedVolume)}
            />
            <MetricStat
              label="Last activity"
              value={formatDate(latestProfileDate) ?? 'n/a'}
            />
          </div>

          <div className="profile-rail-meta">
            <div>
              <span>Profile type</span>
              <strong>{detail.summary.officialType}</strong>
            </div>
            <div>
              <span>Latest filing</span>
              <strong>{formatDate(detail.summary.latestFilingDate) ?? 'n/a'}</strong>
            </div>
          </div>
        </article>

        <article className="surface-card rail-compact">
          <div className="surface-heading compact">
            <span className="section-kicker">Top disclosed positions</span>
            <h3>{topHoldings.length}</h3>
          </div>
          <BreakdownBarList
            segments={topHoldings}
            formatter={(value) => formatCompactCurrency(value)}
          />
        </article>
      </aside>

      <div className="detail-stage">
        <div className="detail-toolbar">
          <div className="detail-toolbar-copy">
            <span className="section-kicker">Official desk</span>
            <h2>{detail.summary.displayName}</h2>
          </div>
          <div className="detail-toolbar-meta">
            <span className="pill pill-muted">{formatInteger(detail.summary.positionCount)} positions</span>
            <span className="pill pill-muted">{formatInteger(issuerCount)} issuers</span>
            <span className="pill pill-muted">Benchmark next</span>
          </div>
        </div>

        <section className="metric-grid">
          <MetricCard
            label="Trades"
            value={formatInteger(detail.summary.transactionCount)}
            tone="neutral"
            detail="Parsed transaction rows"
          />
          <MetricCard
            label="Filings"
            value={formatInteger(detail.summary.filingCount)}
            tone="coral"
            detail="Indexed disclosure filings"
          />
          <MetricCard
            label="Est. volume"
            value={formatCompactCurrency(estimatedVolume)}
            tone="violet"
            detail="Midpoint estimate from trades"
          />
          <MetricCard
            label="Issuers"
            value={formatInteger(issuerCount)}
            tone="lime"
            detail="Distinct holdings or traded issuers"
          />
        </section>

        <section className="showcase-grid official-showcase-grid">
          <article className="surface-card showcase-primary">
            <div className="surface-heading">
              <div>
                <span className="section-kicker">
                  {hasTradeHistory ? 'Trade cadence' : 'Portfolio concentration'}
                </span>
                <h2>
                  {hasTradeHistory
                    ? 'Disclosed trading flow over time'
                    : 'Largest disclosed positions'}
                </h2>
              </div>
              <span className="note-pill">
                {hasTradeHistory
                  ? `Avg lag ${delayDays === null ? 'n/a' : `${delayDays}d`}`
                  : `${detail.portfolio.length} disclosed rows`}
              </span>
            </div>
            {hasTradeHistory ? (
              <TrendChart points={tradeSeries} label="Estimated disclosed volume" tone="lime" />
            ) : (
              <BreakdownBarList
                segments={topHoldings}
                formatter={(value) => formatCompactCurrency(value)}
              />
            )}
          </article>

          <div className="showcase-side">
            <article className="surface-card">
              <div className="surface-heading compact">
                <span className="section-kicker">Portfolio mix</span>
                <h3>{detail.portfolio.length} rows</h3>
              </div>
              <RingChart segments={portfolioExposure} centerLabel="positions" />
            </article>

            <article className="surface-card">
              <div className="surface-heading compact">
                <span className="section-kicker">
                  {hasTradeHistory ? 'Trade mix' : 'Asset classes'}
                </span>
                <h3>{hasTradeHistory ? detail.trades.length : detail.portfolio.length}</h3>
              </div>
              <RingChart
                segments={hasTradeHistory ? tradeTypes : assetTypeBreakdown}
                centerLabel={hasTradeHistory ? 'trades' : 'classes'}
              />
            </article>
          </div>
        </section>

        <article className="surface-card">
          <div className="surface-heading">
            <div>
              <span className="section-kicker">Portfolio</span>
              <h2>Latest disclosed holdings</h2>
            </div>
            <span className="note-pill">{detail.portfolio.length} positions</span>
          </div>
          <HoldingsTable positions={detail.portfolio} onTickerSelect={onTickerSelect} />
        </article>

        {hasTradeHistory ? (
          <article className="surface-card">
            <div className="surface-heading">
              <div>
                <span className="section-kicker">Recent trades</span>
                <h2>Parsed transaction timeline</h2>
              </div>
              <span className="note-pill">
                {delayDays === null ? 'Lag unavailable' : `Avg lag ${delayDays}d`}
              </span>
            </div>
            <TradeTable trades={detail.trades} onTickerSelect={onTickerSelect} />
          </article>
        ) : (
          <SurfaceCard kicker="Recent trades" title="No parsed transaction rows yet">
            <p className="muted-copy">
              This profile currently resolves to holdings-only disclosure data. PTR-backed trade history will appear here once parsed transactions exist for this member.
            </p>
          </SurfaceCard>
        )}
      </div>
    </section>
  )
}

interface TickerDetailViewProps {
  detail: TickerDetail
  onBack: () => void
  onOfficialSelect: (officialId: string) => void
}

function TickerDetailView({
  detail,
  onBack,
  onOfficialSelect,
}: TickerDetailViewProps) {
  const tradeSeries = buildMonthlyTradeSeries(detail.trades)
  const securitySeries = buildMarketSeries(detail.market.security, 14)
  const benchmarkSeries = buildMarketSeries(detail.market.benchmark, 14)
  const partyBreakdown = buildPartyBreakdown(detail.trades)
  const tradeTypes = buildTradeTypeBreakdown(detail.trades)
  const estimatedVolume = totalEstimatedTradeVolume(detail.trades)
  const averageLag = averageFilingDelayDays(detail.trades)
  const securityReturn = relativeMarketReturn(detail.market.security)
  const benchmarkSpread = relativeMarketSpread(
    detail.market.security,
    detail.market.benchmark,
  )
  const hasTickerBenchmark =
    detail.market.security !== null && detail.market.benchmark !== null
  const latestClose = detail.market.security?.points[detail.market.security.points.length - 1]?.close ?? null

  return (
    <section className="detail-layout detail-layout-ticker">
      <aside className="profile-column">
        <article className="profile-card">
          <button className="text-button" type="button" onClick={onBack}>
            Back to overview
          </button>
          <span className="section-kicker">Ticker intelligence</span>
          <h1 className="profile-name">{detail.summary.ticker}</h1>
          <p className="profile-meta">{detail.summary.representativeAssetName}</p>
          <p className="profile-submeta">
            {detail.summary.representativeIssuerName ?? detail.summary.representativeAssetType}
          </p>

          <div className="profile-stat-grid">
            <MetricStat label="Trades" value={formatInteger(detail.summary.transactionCount)} />
            <MetricStat label="Officials" value={formatInteger(detail.summary.tradingOfficialCount)} />
            <MetricStat label="Holders" value={formatInteger(detail.summary.holderCount)} />
            <MetricStat
              label="Ticker return"
              value={formatSignedPercentOrPlaceholder(securityReturn)}
            />
          </div>
        </article>

        <SurfaceCard kicker="Market overlay" title="Benchmark lane">
          <p className="muted-copy">
            {hasTickerBenchmark
              ? `Weekly adjusted price history is cached from ${detail.market.benchmark?.source ?? 'the market provider'} so this ticker can be read against a live SPY benchmark instead of a placeholder.`
              : 'The benchmark lane is fully wired, but local market data is inactive until ALPHA_VANTAGE_API_KEY is configured.'}
          </p>
          <div className="profile-rail-meta">
            <div>
              <span>Last close</span>
              <strong>{formatPrice(latestClose)}</strong>
            </div>
            <div>
              <span>Vs SPY</span>
              <strong>{formatSignedPercentOrPlaceholder(benchmarkSpread)}</strong>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard kicker="Party split" title="Who is trading it">
          <RingChart segments={partyBreakdown} centerLabel="filers" />
        </SurfaceCard>
      </aside>

      <div className="detail-stage">
        <section className="metric-grid">
          <MetricCard
            label="Last close"
            value={formatPrice(latestClose)}
            tone="neutral"
            detail={detail.market.security?.asOfDate === null || detail.market.security === null
              ? 'Market series unavailable'
              : `As of ${formatDate(detail.market.security.asOfDate) ?? 'n/a'}`}
          />
          <MetricCard
            label="Ticker return"
            value={formatSignedPercentOrPlaceholder(securityReturn)}
            tone="coral"
            detail={`${detail.summary.ticker} normalized performance`}
          />
          <MetricCard
            label="Vs SPY"
            value={formatSignedPercentOrPlaceholder(benchmarkSpread)}
            tone="violet"
            detail="Relative performance spread"
          />
          <MetricCard
            label="Avg. filing lag"
            value={averageLag === null ? 'n/a' : `${averageLag}d`}
            tone="lime"
            detail="Trade date to filed date"
          />
        </section>

        <section className="showcase-grid">
          <article className="surface-card showcase-primary">
            <div className="surface-heading">
              <div>
                <span className="section-kicker">Market performance</span>
                <h2>{detail.summary.ticker} vs S&amp;P 500 proxy</h2>
              </div>
              <span className="note-pill">
                {detail.market.security?.source ?? 'Set ALPHA_VANTAGE_API_KEY'}
              </span>
            </div>
            <p className="muted-copy">
              {hasTickerBenchmark
                ? 'The price lane is real market data. The trade ledger below remains disclosure-derived, so you can compare what the security did against when officials reported touching it.'
                : 'Once market data is configured, this lane will compare normalized issuer performance against SPY while keeping the disclosure ledger below unchanged.'}
            </p>
            <TrendChart
              points={securitySeries ?? tradeSeries}
              label={securitySeries === null ? 'Estimated disclosed volume' : detail.summary.ticker}
              tone="coral"
              comparisonPoints={hasTickerBenchmark ? benchmarkSeries : null}
              comparisonLabel={hasTickerBenchmark ? detail.market.benchmark?.label : undefined}
              comparisonTone="muted"
            />
          </article>

          <div className="showcase-side">
            <article className="surface-card">
              <div className="surface-heading compact">
                <span className="section-kicker">Action mix</span>
                <h3>{detail.trades.length} rows</h3>
              </div>
              <RingChart segments={tradeTypes} centerLabel="actions" />
            </article>

            <article className="surface-card">
              <div className="surface-heading compact">
                <span className="section-kicker">Disclosure flow</span>
                <h3>{formatCompactCurrency(estimatedVolume)}</h3>
              </div>
              <p className="muted-copy">
                Parsed trade rows span {formatDate(detail.summary.firstTransactionDate) ?? 'n/a'} to{' '}
                {formatDate(detail.summary.latestTransactionDate) ?? 'n/a'} across{' '}
                {formatInteger(detail.summary.tradingOfficialCount)} officials.
              </p>
            </article>
          </div>
        </section>

        <article className="surface-card">
          <div className="surface-heading">
            <div>
              <span className="section-kicker">Latest holders</span>
              <h2>Who still appears exposed</h2>
            </div>
            <span className="note-pill">{detail.holders.length} holders</span>
          </div>
          <HolderTable holders={detail.holders} onOfficialSelect={onOfficialSelect} />
        </article>

        <article className="surface-card">
          <div className="surface-heading">
            <div>
              <span className="section-kicker">Trade ledger</span>
              <h2>Every parsed ticker-level trade row</h2>
            </div>
            <span className="note-pill">{detail.summary.ticker}</span>
          </div>
          <TickerTradeTable trades={detail.trades} onOfficialSelect={onOfficialSelect} />
        </article>
      </div>
    </section>
  )
}

interface SurfaceCardProps {
  kicker: string
  title: string
  description?: string
  children?: React.ReactNode
}

function SurfaceCard({ kicker, title, description, children }: SurfaceCardProps) {
  return (
    <article className="surface-card">
      <div className="surface-heading">
        <div>
          <span className="section-kicker">{kicker}</span>
          <h2>{title}</h2>
        </div>
      </div>
      {description !== undefined ? <p className="muted-copy">{description}</p> : null}
      {children}
    </article>
  )
}

interface MetricCardProps {
  label: string
  value: string
  detail: string
  tone: 'lime' | 'coral' | 'violet' | 'neutral'
}

function MetricCard({ label, value, detail, tone }: MetricCardProps) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  )
}

interface MetricStatProps {
  label: string
  value: string
}

function MetricStat({ label, value }: MetricStatProps) {
  return (
    <div className="metric-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

interface LedgerItemProps {
  label: string
  value: string
  detail: string
}

function LedgerItem({ label, value, detail }: LedgerItemProps) {
  return (
    <div className="topbar-ledger-row">
      <span className="topbar-ledger-label">{label}</span>
      <strong className="topbar-ledger-value">{value}</strong>
      <small className="topbar-ledger-detail">{detail}</small>
    </div>
  )
}

interface BreakdownBarListProps {
  segments: Array<{ label: string; value: number }>
  formatter: (value: number) => string
}

function BreakdownBarList({ segments, formatter }: BreakdownBarListProps) {
  const values = segments.length > 0 ? segments : [{ label: 'No data', value: 0 }]
  const maxValue = Math.max(...values.map((segment) => segment.value), 1)

  return (
    <ul className="bar-list">
      {values.map((segment) => (
        <li key={segment.label} className="bar-list-row">
          <div className="bar-list-copy">
            <strong>{segment.label}</strong>
            <span>{formatter(segment.value)}</span>
          </div>
          <div className="bar-track" aria-hidden="true">
            <span
              className="bar-fill"
              style={{ width: `${Math.max((segment.value / maxValue) * 100, 4)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

interface RecentTradeTableProps {
  trades: OfficialTradeActivity[]
  onOfficialSelect: (officialId: string) => void
  onTickerSelect: (ticker: string) => void
}

function RecentTradeTable({
  trades,
  onOfficialSelect,
  onTickerSelect,
}: RecentTradeTableProps) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Filed</th>
          <th>Official</th>
          <th>Asset</th>
          <th>Action</th>
          <th>Est. amount</th>
        </tr>
      </thead>
      <tbody>
        {trades.map((trade) => (
          <tr key={trade.transactionId}>
            <td>{formatDate(trade.filingDate) ?? 'n/a'}</td>
            <td>
              <button
                className="table-link"
                type="button"
                onClick={() => onOfficialSelect(trade.officialId)}
              >
                {trade.officialDisplayName}
              </button>
            </td>
            <td>
              {trade.ticker !== null ? (
                <button
                  className="ticker-pill"
                  type="button"
                  onClick={() => onTickerSelect(trade.ticker!)}
                >
                  {trade.ticker}
                </button>
              ) : (
                <span className="ticker-pill muted">{trade.assetType}</span>
              )}{' '}
              {trade.assetName}
            </td>
            <td>
              <span className={`action-tag action-${normalizeActionTone(trade.transactionType)}`}>
                {formatTradeAction(trade.transactionType)}
              </span>
            </td>
            <td>{trade.amountRangeLabel}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

interface HoldingsTableProps {
  positions: PortfolioPosition[]
  onTickerSelect: (ticker: string) => void
}

function HoldingsTable({ positions, onTickerSelect }: HoldingsTableProps) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Asset</th>
          <th>Owner</th>
          <th>Est. amount</th>
          <th>Confidence</th>
          <th>As of</th>
        </tr>
      </thead>
      <tbody>
        {positions.map((position) => (
          <tr key={position.positionId}>
            <td>
              <div className="table-primary">
                <strong>{position.assetName}</strong>
                {position.ticker !== null ? (
                  <button
                    className="ticker-pill"
                    type="button"
                    onClick={() => onTickerSelect(position.ticker!)}
                  >
                    {position.ticker}
                  </button>
                ) : (
                  <span className="ticker-pill muted">{position.assetType}</span>
                )}
              </div>
            </td>
            <td>{position.ownerType}</td>
            <td>{position.amountRangeLabel ?? 'n/a'}</td>
            <td>{position.confidenceLabel}</td>
            <td>{formatDate(position.asOfFilingDate) ?? 'n/a'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

interface TradeTableProps {
  trades: OfficialTradeActivity[]
  onTickerSelect: (ticker: string) => void
}

function TradeTable({ trades, onTickerSelect }: TradeTableProps) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Asset</th>
          <th>Action</th>
          <th>Traded</th>
          <th>Filed</th>
          <th>Delay</th>
          <th>Est. amount</th>
        </tr>
      </thead>
      <tbody>
        {trades.map((trade) => (
          <tr key={trade.transactionId}>
            <td>
              <div className="table-primary">
                <strong>{trade.assetName}</strong>
                {trade.ticker !== null ? (
                  <button
                    className="ticker-pill"
                    type="button"
                    onClick={() => onTickerSelect(trade.ticker!)}
                  >
                    {trade.ticker}
                  </button>
                ) : (
                  <span className="ticker-pill muted">{trade.assetType}</span>
                )}
              </div>
            </td>
            <td>
              <span className={`action-tag action-${normalizeActionTone(trade.transactionType)}`}>
                {formatTradeAction(trade.transactionType)}
              </span>
            </td>
            <td>{formatDate(trade.transactionDate) ?? 'n/a'}</td>
            <td>{formatDate(trade.filingDate) ?? 'n/a'}</td>
            <td>{formatDelay(trade.transactionDate, trade.filingDate)}</td>
            <td>{trade.amountRangeLabel}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

interface HolderTableProps {
  holders: TickerDetail['holders']
  onOfficialSelect: (officialId: string) => void
}

function HolderTable({ holders, onOfficialSelect }: HolderTableProps) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Official</th>
          <th>Owner</th>
          <th>Est. amount</th>
          <th>Confidence</th>
          <th>Snapshot</th>
        </tr>
      </thead>
      <tbody>
        {holders.map((holder) => (
          <tr key={holder.positionId}>
            <td>
              <button
                className="table-link"
                type="button"
                onClick={() => onOfficialSelect(holder.officialId)}
              >
                {holder.officialDisplayName}
              </button>
            </td>
            <td>{holder.ownerType}</td>
            <td>{holder.amountRangeLabel ?? 'n/a'}</td>
            <td>{holder.confidenceLabel}</td>
            <td>{formatDate(holder.asOfFilingDate) ?? 'n/a'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

interface TickerTradeTableProps {
  trades: TickerDetail['trades']
  onOfficialSelect: (officialId: string) => void
}

function TickerTradeTable({ trades, onOfficialSelect }: TickerTradeTableProps) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Official</th>
          <th>Action</th>
          <th>Traded</th>
          <th>Filed</th>
          <th>Delay</th>
          <th>Est. amount</th>
        </tr>
      </thead>
      <tbody>
        {trades.map((trade) => (
          <tr key={trade.transactionId}>
            <td>
              <button
                className="table-link"
                type="button"
                onClick={() => onOfficialSelect(trade.officialId)}
              >
                {trade.officialDisplayName}
              </button>
            </td>
            <td>
              <span className={`action-tag action-${normalizeActionTone(trade.transactionType)}`}>
                {formatTradeAction(trade.transactionType)}
              </span>
            </td>
            <td>{formatDate(trade.transactionDate) ?? 'n/a'}</td>
            <td>{formatDate(trade.filingDate) ?? 'n/a'}</td>
            <td>{formatDelay(trade.transactionDate, trade.filingDate)}</td>
            <td>{trade.amountRangeLabel}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function createDetailStateForView(view: AppView): DetailState {
  return view.kind === 'overview' ? { status: 'idle' } : { status: 'loading', view }
}

function buildInitials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function countDistinct(values: Array<string | null>): number {
  return new Set(values.filter((value): value is string => value !== null && value.trim() !== '')).size
}

function formatOfficialMeta(summary: OfficialSummary): string {
  const parts = [
    summary.party,
    summary.chamber,
    summary.stateCode,
    summary.districtCode,
  ].filter((value): value is string => value !== null && value !== '')

  return parts.join(' / ')
}

function formatCompactCurrency(value: number): string {
  if (value === 0) {
    return '$0'
  }

  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function formatPrice(value: number | null): string {
  if (value === null) {
    return 'n/a'
  }

  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 100 ? 2 : 3,
  }).format(value)
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat().format(value)
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

function formatSignedPercentOrPlaceholder(value: number | null): string {
  return value === null ? 'n/a' : formatSignedPercent(value)
}

function formatDate(value: string | null): string | null {
  if (value === null) {
    return null
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

function formatTradeAction(value: string): string {
  return value.replaceAll('_', ' ')
}

function normalizeActionTone(value: string): 'buy' | 'sell' | 'neutral' {
  const normalized = value.toLowerCase()
  if (normalized.includes('buy') || normalized.includes('purchase')) {
    return 'buy'
  }
  if (normalized.includes('sell') || normalized.includes('sale')) {
    return 'sell'
  }
  return 'neutral'
}

function formatDelay(transactionDate: string | null, filingDate: string): string {
  if (transactionDate === null) {
    return 'n/a'
  }

  const tradedAt = new Date(transactionDate)
  const filedAt = new Date(filingDate)
  const days = Math.round((filedAt.getTime() - tradedAt.getTime()) / (1000 * 60 * 60 * 24))
  return days < 0 ? 'n/a' : `${days}d`
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export default App
