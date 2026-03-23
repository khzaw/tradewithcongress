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
import { TrendChart } from './charts.tsx'
import {
  averageFilingDelayDays,
  buildMarketSeries,
  buildMonthlyTradeSeries,
  buildOverviewBenchmarkSeries,
  buildOverviewSeries,
  buildPortfolioExposure,
  buildTradeTypeBreakdown,
  latestActivityLabel,
  normalizeTradeActionLabel,
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
              <span className="topbar-link topbar-link-active">House live</span>
              <span className="topbar-link">Senate next</span>
            </nav>
          </div>

          <div className="brand-stack">
            {view.kind === 'overview' ? (
              <>
                <span className="section-kicker">Congressional trading desk</span>
                <h1 className="intro-headline">
                  Track congressional portfolios.
                </h1>
                <p className="brand-copy">
                  Follow senators, representatives, and candidates through disclosed trades, holding snapshots, filing lag, and market context tied back to the source filing.
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

          {view.kind === 'overview' ? (
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
          ) : null}
        </div>
      </header>

      <SearchResultsPanel
        searchState={searchState}
        searchStatus={searchStatus}
        onOfficialSelect={(officialId) => navigateToView({ kind: 'official', officialId })}
        onTickerSelect={(ticker) => navigateToView({ kind: 'ticker', ticker })}
      />

      {view.kind === 'overview' && status === 'loading' ? (
        <OverviewSkeleton />
      ) : view.kind === 'overview' ? (
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

      {searchStatus === 'loading' ? <SearchResultsSkeleton /> : null}
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

        <article className="surface-card rail-compact">
          <div className="surface-heading compact">
            <span className="section-kicker">Watchlist</span>
          </div>
          <ul className="leader-list">
            {dashboardState.topOfficials.map((official) => (
              <li key={official.officialId}>
                <button
                  className="leader-button"
                  type="button"
                  onClick={() => onOfficialSelect(official.officialId)}
                >
                  <span className="leader-identity">
                    <AvatarImage name={official.displayName} size="sm" />
                    <span>
                      <strong>{official.displayName}</strong>
                      <small>
                        {official.chamber} · {official.stateCode ?? 'n/a'}
                      </small>
                    </span>
                  </span>
                  <span className="metric-inline">{official.positionCount}</span>
                </button>
              </li>
            ))}
          </ul>
        </article>

        <article className="surface-card rail-compact">
          <div className="surface-heading compact">
            <span className="section-kicker">Most traded</span>
          </div>
          <ul className="ticker-list">
            {dashboardState.topTickers.map((ticker) => (
              <li key={ticker.ticker}>
                <button
                  className="ticker-list-button"
                  type="button"
                  onClick={() => onTickerSelect(ticker.ticker)}
                >
                  <span className="ticker-identity">
                    <AssetMark
                      ticker={ticker.ticker}
                      assetName={ticker.representativeAssetName}
                    />
                    <span>
                      <strong>{ticker.ticker}</strong>
                      <small>{ticker.representativeAssetName}</small>
                    </span>
                  </span>
                  <span className="metric-inline">{ticker.transactionCount}</span>
                </button>
              </li>
            ))}
          </ul>
        </article>
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
            label="Vs SPY"
            value={formatSignedPercent(benchmarkSpread)}
            tone="neutral"
            detail={
              benchmarkReturn === null
                ? 'Disclosure-weighted activity index'
                : `Activity index vs ${dashboardState.overview.benchmark?.symbol ?? 'SPY'}`
            }
          />
        </section>

        <article className="surface-card">
          <div className="surface-heading">
            <div>
              <span className="section-kicker">Benchmark surface</span>
              <h2>Disclosure activity vs S&amp;P 500</h2>
            </div>
            <span className="note-pill">
              {dashboardState.overview.benchmark?.source ?? 'Set ALPHA_VANTAGE_API_KEY'}
            </span>
          </div>
          <p className="muted-copy">
            {hasOverviewBenchmark
              ? 'Trade flow is rebased to the first visible month and compared against cached SPY weekly adjusted closes.'
              : 'The benchmark lane is wired and will activate once market data is configured.'}
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
      <DetailSkeleton viewKind={detailState.view.kind} />
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
  const topHoldings = buildPortfolioExposure(detail.portfolio, 6)
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

  return (
    <section className="detail-layout detail-layout-official">
      <aside className="profile-column">
        <article className="profile-card profile-card-official">
          <button className="text-button" type="button" onClick={onBack}>
            Back to overview
          </button>
          <AvatarImage name={detail.summary.displayName} size="lg" ariaLabel={`${detail.summary.displayName} avatar`} />
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
      </aside>

      <div className="detail-stage">
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

        <article className="surface-card">
          <div className="surface-heading">
            <div>
              <span className="section-kicker">Top disclosed positions</span>
              <h2>Largest current exposures</h2>
            </div>
            <span className="note-pill">{topHoldings.length} positions</span>
          </div>
          <CompactList segments={topHoldings} formatter={(value) => formatCompactCurrency(value)} />
        </article>

        <article className="surface-card">
          <div className="surface-heading">
            <div>
              <span className="section-kicker">
                {hasTradeHistory ? 'Trade cadence' : 'Portfolio concentration'}
              </span>
              <h2>
                {hasTradeHistory ? 'Disclosed trading flow over time' : 'Portfolio overview'}
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
            <p className="muted-copy">
              This profile currently resolves to holdings-only disclosure data. The table below is the latest disclosed snapshot, and PTR-backed trade history will appear once parsed transactions exist for this member.
            </p>
          )}
        </article>

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
  const tickerSubtitle = buildTickerSubtitle(
    detail.summary.representativeAssetName,
    detail.summary.representativeIssuerName,
    detail.summary.representativeAssetType,
  )

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
          {tickerSubtitle !== null ? <p className="profile-submeta">{tickerSubtitle}</p> : null}

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

        <article className="surface-card rail-compact">
          <div className="surface-heading compact">
            <span className="section-kicker">Action mix</span>
            <h3>{detail.trades.length}</h3>
          </div>
          <CompactList segments={tradeTypes} formatter={(value) => formatInteger(value)} />
        </article>
      </aside>

      <div className="detail-stage">
        <article className="surface-card">
          <div className="surface-heading">
            <div>
              <span className="section-kicker">Market performance</span>
              <h2>{detail.summary.ticker} vs S&amp;P 500</h2>
            </div>
            <span className="note-pill">
              {detail.market.security?.source ?? 'Set ALPHA_VANTAGE_API_KEY'}
            </span>
          </div>
          <div className="profile-rail-meta">
            <div>
              <span>Last close</span>
              <strong>{formatPrice(latestClose)}</strong>
            </div>
            <div>
              <span>Return</span>
              <strong>{formatSignedPercentOrPlaceholder(securityReturn)}</strong>
            </div>
            <div>
              <span>Vs SPY</span>
              <strong>{formatSignedPercentOrPlaceholder(benchmarkSpread)}</strong>
            </div>
            <div>
              <span>As of</span>
              <strong>{formatDate(detail.market.security?.asOfDate ?? null) ?? 'n/a'}</strong>
            </div>
          </div>
          <TrendChart
            points={securitySeries ?? tradeSeries}
            label={securitySeries === null ? 'Estimated disclosed volume' : detail.summary.ticker}
            tone="coral"
            comparisonPoints={hasTickerBenchmark ? benchmarkSeries : null}
            comparisonLabel={hasTickerBenchmark ? detail.market.benchmark?.label : undefined}
            comparisonTone="muted"
          />
        </article>

        <article className="surface-card">
          <div className="surface-heading">
            <div>
              <span className="section-kicker">Disclosure flow</span>
              <h2>{formatCompactCurrency(estimatedVolume)}</h2>
            </div>
            <span className="note-pill">
              {averageLag === null
                ? `${formatInteger(detail.summary.tradingOfficialCount)} officials`
                : `Avg lag ${averageLag}d`}
            </span>
          </div>
          <p className="muted-copy">
            Parsed trade rows span {formatDate(detail.summary.firstTransactionDate) ?? 'n/a'} to{' '}
            {formatDate(detail.summary.latestTransactionDate) ?? 'n/a'}.
          </p>
        </article>

        {detail.holders.length > 0 ? (
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
        ) : null}

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

interface AvatarImageProps {
  name: string
  size: 'sm' | 'lg'
  ariaLabel?: string
}

function AvatarImage({ name, size, ariaLabel }: AvatarImageProps) {
  return (
    <img
      className={size === 'lg' ? 'profile-avatar profile-avatar-image' : 'leader-avatar'}
      src={buildAvatarDataUrl(name)}
      alt={ariaLabel ?? ''}
      aria-hidden={ariaLabel === undefined}
    />
  )
}

interface AssetMarkProps {
  ticker: string
  assetName: string
}

function AssetMark({ ticker, assetName }: AssetMarkProps) {
  return (
    <img
      className="asset-mark"
      src={buildAssetMarkDataUrl(ticker, assetName)}
      alt=""
      aria-hidden="true"
    />
  )
}

interface DetailSkeletonProps {
  viewKind: 'official' | 'ticker'
}

function DetailSkeleton({ viewKind }: DetailSkeletonProps) {
  return (
    <section className="detail-layout" aria-label={`Loading ${viewKind} desk`}>
      <aside className="profile-column">
        <article className="profile-card profile-card-official skeleton-surface">
          <div className="skeleton-line skeleton-line-short" />
          <div className="skeleton-avatar" />
          <div className="skeleton-line skeleton-line-kicker" />
          <div className="skeleton-line skeleton-line-name" />
          <div className="skeleton-line skeleton-line-meta" />
          <div className="profile-stat-grid">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="metric-stat">
                <div className="skeleton-line skeleton-line-kicker" />
                <div className="skeleton-line skeleton-line-value" />
              </div>
            ))}
          </div>
        </article>
      </aside>

      <div className="detail-stage">
        <section className="metric-grid">
          {Array.from({ length: 4 }).map((_, index) => (
            <article key={index} className="metric-card skeleton-surface">
              <div className="skeleton-line skeleton-line-kicker" />
              <div className="skeleton-line skeleton-line-metric" />
              <div className="skeleton-line skeleton-line-meta" />
            </article>
          ))}
        </section>

        <article className="surface-card skeleton-surface">
          <div className="surface-heading">
            <div className="skeleton-stack">
              <div className="skeleton-line skeleton-line-kicker" />
              <div className="skeleton-line skeleton-line-title" />
            </div>
            <div className="skeleton-line skeleton-line-pill" />
          </div>
          <div className="skeleton-chart" />
        </article>

        <article className="surface-card skeleton-surface">
          <div className="surface-heading">
            <div className="skeleton-stack">
              <div className="skeleton-line skeleton-line-kicker" />
              <div className="skeleton-line skeleton-line-title" />
            </div>
            <div className="skeleton-line skeleton-line-pill" />
          </div>
          <TableSkeleton rows={6} columns={viewKind === 'official' ? 6 : 6} />
        </article>
      </div>
    </section>
  )
}

function OverviewSkeleton() {
  return (
    <section className="overview-layout" aria-label="Loading overview">
      <aside className="rail-column">
        <section className="hero-surface skeleton-surface">
          <div className="skeleton-line skeleton-line-kicker" />
          <div className="skeleton-line skeleton-line-hero" />
          <div className="skeleton-line skeleton-line-hero secondary" />
          <div className="skeleton-line skeleton-line-meta" />
        </section>

        <article className="surface-card skeleton-surface">
          <div className="surface-heading compact">
            <div className="skeleton-line skeleton-line-kicker" />
            <div className="skeleton-line skeleton-line-short" />
          </div>
          <ListSkeleton rows={5} />
        </article>

        <article className="surface-card skeleton-surface">
          <div className="surface-heading compact">
            <div className="skeleton-line skeleton-line-kicker" />
            <div className="skeleton-line skeleton-line-short" />
          </div>
          <ListSkeleton rows={5} />
        </article>
      </aside>

      <div className="overview-stage">
        <section className="metric-grid">
          {Array.from({ length: 4 }).map((_, index) => (
            <article key={index} className="metric-card skeleton-surface">
              <div className="skeleton-line skeleton-line-kicker" />
              <div className="skeleton-line skeleton-line-metric" />
              <div className="skeleton-line skeleton-line-meta" />
            </article>
          ))}
        </section>

        <article className="surface-card skeleton-surface">
          <div className="surface-heading">
            <div className="skeleton-stack">
              <div className="skeleton-line skeleton-line-kicker" />
              <div className="skeleton-line skeleton-line-title" />
            </div>
            <div className="skeleton-line skeleton-line-pill" />
          </div>
          <div className="skeleton-chart" />
        </article>

        <article className="surface-card skeleton-surface">
          <div className="surface-heading">
            <div className="skeleton-stack">
              <div className="skeleton-line skeleton-line-kicker" />
              <div className="skeleton-line skeleton-line-title" />
            </div>
          </div>
          <TableSkeleton rows={6} columns={5} />
        </article>
      </div>
    </section>
  )
}

function SearchResultsSkeleton() {
  return (
    <div className="search-grid" aria-label="Searching disclosure graph">
      <article className="surface-card skeleton-surface">
        <div className="surface-heading compact">
          <div className="skeleton-line skeleton-line-kicker" />
          <div className="skeleton-line skeleton-line-short" />
        </div>
        <ListSkeleton rows={4} />
      </article>
      <article className="surface-card skeleton-surface">
        <div className="surface-heading compact">
          <div className="skeleton-line skeleton-line-kicker" />
          <div className="skeleton-line skeleton-line-short" />
        </div>
        <ListSkeleton rows={4} />
      </article>
    </div>
  )
}

interface ListSkeletonProps {
  rows: number
}

function ListSkeleton({ rows }: ListSkeletonProps) {
  return (
    <div className="skeleton-list">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="skeleton-list-row">
          <div className="skeleton-stack">
            <div className="skeleton-line skeleton-line-item" />
            <div className="skeleton-line skeleton-line-item-meta" />
          </div>
          <div className="skeleton-line skeleton-line-inline" />
        </div>
      ))}
    </div>
  )
}

interface TableSkeletonProps {
  rows: number
  columns: number
}

function TableSkeleton({ rows, columns }: TableSkeletonProps) {
  return (
    <div
      className="skeleton-table"
      aria-hidden="true"
      style={{ ['--skeleton-columns' as string]: columns }}
    >
      <div className="skeleton-table-head">
        {Array.from({ length: columns }).map((_, index) => (
          <div key={index} className="skeleton-line skeleton-line-header" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="skeleton-table-row">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <div
              key={`${rowIndex}-${colIndex}`}
              className={`skeleton-line ${colIndex === 0 ? 'skeleton-line-item' : 'skeleton-line-cell'}`}
            />
          ))}
        </div>
      ))}
    </div>
  )
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

interface CompactListProps {
  segments: Array<{ label: string; value: number }>
  formatter: (value: number) => string
}

function CompactList({ segments, formatter }: CompactListProps) {
  const values = segments.length > 0 ? segments : [{ label: 'No data', value: 0 }]

  return (
    <ul className="compact-list">
      {values.map((segment) => (
        <li key={segment.label} className="compact-list-row">
          <strong>{segment.label}</strong>
          <span>{formatter(segment.value)}</span>
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
          <th className="table-col-ticker">Ticker</th>
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
            <td className="table-col-ticker">
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
            </td>
            <td>
              {trade.ticker !== null ? (
                formatAssetLabel(trade.assetName, trade.ticker)
              ) : (
                formatAssetLabel(trade.assetName, null)
              )}
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
          <th className="table-col-ticker">Ticker</th>
          <th>Asset</th>
          <th className="table-col-owner">Owner</th>
          <th>Est. amount</th>
          <th>Confidence</th>
          <th>As of</th>
        </tr>
      </thead>
      <tbody>
        {positions.map((position) => (
          <tr key={position.positionId}>
            <td className="table-col-ticker">
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
            </td>
            <td>
              <div className="table-primary">
                <strong>{formatAssetLabel(position.assetName, position.ticker)}</strong>
              </div>
            </td>
            <td className="table-col-owner">{position.ownerType}</td>
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
          <th className="table-col-ticker">Ticker</th>
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
            <td className="table-col-ticker">
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
            </td>
            <td>
              <div className="table-primary">
                <strong>{formatAssetLabel(trade.assetName, trade.ticker)}</strong>
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
          <th className="table-col-owner">Owner</th>
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
            <td className="table-col-owner">{holder.ownerType}</td>
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
  return normalizeTradeActionLabel(value)
}

function formatAssetLabel(value: string, ticker: string | null): string {
  const withoutAssetType = value.replace(/\s+\[[A-Z]{2,}\]$/, '')
  if (ticker === null) {
    return withoutAssetType
  }

  const tickerPattern = new RegExp(`\\s*\\(${escapeRegExp(ticker)}\\)$`)
  return withoutAssetType.replace(tickerPattern, '')
}

function buildTickerSubtitle(
  assetName: string,
  issuerName: string | null,
  assetType: string,
): string | null {
  if (issuerName !== null) {
    const normalizedAsset = assetName.trim().toLowerCase()
    const normalizedIssuer = issuerName.trim().toLowerCase()

    if (normalizedAsset === normalizedIssuer || normalizedAsset.startsWith(`${normalizedIssuer} -`)) {
      return assetType.trim() === '' ? null : assetType
    }

    return issuerName
  }

  return assetType.trim() === '' ? null : assetType
}

function normalizeActionTone(value: string): 'buy' | 'sell' | 'neutral' {
  const normalized = normalizeTradeActionLabel(value)
  if (normalized === 'buy') {
    return 'buy'
  }
  if (normalized === 'sell') {
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildAvatarDataUrl(name: string): string {
  const initials = buildInitials(name)
  const hue = hashString(name) % 360
  const accentHue = (hue + 48) % 360
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" role="img" aria-label="${escapeHtml(name)}">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="hsl(${hue} 42% 18%)" />
          <stop offset="100%" stop-color="hsl(${accentHue} 36% 10%)" />
        </linearGradient>
        <radialGradient id="glow" cx="24%" cy="22%" r="72%">
          <stop offset="0%" stop-color="hsla(${accentHue} 88% 72% / 0.34)" />
          <stop offset="100%" stop-color="hsla(${accentHue} 88% 72% / 0)" />
        </radialGradient>
      </defs>
      <rect width="160" height="160" rx="34" fill="url(#bg)" />
      <rect width="160" height="160" rx="34" fill="url(#glow)" />
      <rect x="1.5" y="1.5" width="157" height="157" rx="32.5" fill="none" stroke="rgba(255,255,255,0.12)" />
      <text x="80" y="92" fill="rgba(244,248,251,0.96)" font-family="IBM Plex Mono, monospace" font-size="42" letter-spacing="5" text-anchor="middle">${escapeHtml(initials)}</text>
    </svg>
  `.trim()

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

function hashString(value: string): number {
  let hash = 0

  for (const character of value) {
    hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0
  }

  return Math.abs(hash)
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function buildAssetMarkDataUrl(ticker: string, assetName: string): string {
  const seed = `${ticker}:${assetName}`
  const hue = hashString(seed) % 360
  const accentHue = (hue + 26) % 360
  const glyph = ticker.slice(0, Math.min(3, ticker.length)).toUpperCase()
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72" role="img" aria-label="${escapeHtml(assetName)}">
      <defs>
        <linearGradient id="assetBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="hsl(${hue} 30% 16%)" />
          <stop offset="100%" stop-color="hsl(${accentHue} 28% 10%)" />
        </linearGradient>
        <radialGradient id="assetGlow" cx="22%" cy="20%" r="76%">
          <stop offset="0%" stop-color="hsla(${accentHue} 90% 72% / 0.22)" />
          <stop offset="100%" stop-color="hsla(${accentHue} 90% 72% / 0)" />
        </radialGradient>
      </defs>
      <rect width="72" height="72" rx="18" fill="url(#assetBg)" />
      <rect width="72" height="72" rx="18" fill="url(#assetGlow)" />
      <rect x="1" y="1" width="70" height="70" rx="17" fill="none" stroke="rgba(255,255,255,0.1)" />
      <text x="36" y="42" fill="rgba(244,248,251,0.96)" font-family="IBM Plex Mono, monospace" font-size="19" letter-spacing="1.5" text-anchor="middle">${escapeHtml(glyph)}</text>
    </svg>
  `.trim()

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

export default App
