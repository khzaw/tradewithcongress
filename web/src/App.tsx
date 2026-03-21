import { startTransition, useEffect, useState } from 'react'

import './App.css'
import {
  fetchHomepageData,
  fetchOfficialDetail,
  fetchSearchResults,
  fetchTickerDetail,
  type ApiState,
  type OfficialDetail,
  type OfficialSummary,
  type SearchState,
  type TickerDetail,
} from './api.ts'
import { buildViewSearch, parseView, type AppView } from './navigation.ts'

const EMPTY_STATE: ApiState = {
  apiVersion: 'v1',
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
  const [apiState, setApiState] = useState<ApiState>(EMPTY_STATE)
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
          setApiState(nextState)
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
    <main className="app-shell">
      <section className="hero">
        <div className="eyebrow">
          Congressional disclosure intelligence · API {apiState.apiVersion}
        </div>
        <h1>Trade With Congress</h1>
        <p className="lede">
          Search government officials, filings, and securities from one place.
          This is now the start of the real official-first and ticker-first
          browsing flow, not just a landing-page scaffold.
        </p>
        <form className="search-shell" onSubmit={(event) => void handleSearchSubmit(event)}>
          <input
            className="search-input"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search Nancy Pelosi, NVDA, or Wells Fargo"
            aria-label="Search filings, officials, or securities"
          />
          <button className="search-button" type="submit">
            Search
          </button>
        </form>
        <p className="search-caption">
          Universal lookup is versioned under <code>/api/v1/search</code>.
          Official and ticker views are now shareable via URL query state.
        </p>
      </section>

      <SearchResultsPanel
        searchState={searchState}
        searchStatus={searchStatus}
        onOfficialSelect={(officialId) => navigateToView({ kind: 'official', officialId })}
        onTickerSelect={(ticker) => navigateToView({ kind: 'ticker', ticker })}
      />

      <DetailPanel
        detailState={detailState}
        onBack={() => navigateToView({ kind: 'overview' })}
        onOfficialSelect={(officialId) => navigateToView({ kind: 'official', officialId })}
        onTickerSelect={(ticker) => navigateToView({ kind: 'ticker', ticker })}
      />

      {view.kind === 'overview' ? (
        <OverviewGrid
          apiState={apiState}
          status={status}
          onOfficialSelect={(officialId) => navigateToView({ kind: 'official', officialId })}
          onTickerSelect={(ticker) => navigateToView({ kind: 'ticker', ticker })}
        />
      ) : null}
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

  const isEmpty =
    searchStatus === 'ready' &&
    searchState.officials.length === 0 &&
    searchState.tickers.length === 0

  return (
    <section className="panel search-results">
      <div className="panel-header">
        <h2>Search results</h2>
        {searchState.query !== '' ? <span>{searchState.query}</span> : null}
      </div>

      {searchStatus === 'loading' ? <p>Searching officials and securities…</p> : null}

      {searchStatus === 'error' ? (
        <p>Enter at least two characters and make sure the read API is running.</p>
      ) : null}

      {isEmpty ? <p>No matches found for that query.</p> : null}

      {searchStatus === 'ready' && searchState.officials.length > 0 ? (
        <div className="search-group">
          <h3>Officials</h3>
          <ul className="summary-list">
            {searchState.officials.map((official) => (
              <ResultRow
                key={official.officialId}
                title={official.displayName}
                subtitle={`${official.chamber} · ${official.stateCode ?? 'n/a'} · alias match: ${official.matchedAlias}`}
                metric={`${official.positionCount} holdings · ${official.transactionCount} trades`}
                onClick={() => onOfficialSelect(official.officialId)}
              />
            ))}
          </ul>
        </div>
      ) : null}

      {searchStatus === 'ready' && searchState.tickers.length > 0 ? (
        <div className="search-group">
          <h3>Securities</h3>
          <ul className="summary-list">
            {searchState.tickers.map((ticker) => (
              <ResultRow
                key={ticker.ticker}
                title={ticker.ticker}
                subtitle={`${ticker.representativeAssetName} · matched on ${ticker.matchedField}`}
                metric={`${ticker.transactionCount} trades · ${ticker.holderCount} holders`}
                onClick={() => onTickerSelect(ticker.ticker)}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

interface OverviewGridProps {
  apiState: ApiState
  status: LoadStatus
  onOfficialSelect: (officialId: string) => void
  onTickerSelect: (ticker: string) => void
}

function OverviewGrid({
  apiState,
  status,
  onOfficialSelect,
  onTickerSelect,
}: OverviewGridProps) {
  return (
    <section className="grid">
      <article className="panel">
        <h2>Top officials</h2>
        {status === 'error' ? (
          <p>
            The versioned read API is not reachable yet. Start <code>make dev</code>{' '}
            to bring up <code>/api/v1</code> alongside Vite.
          </p>
        ) : (
          <ul className="summary-list">
            {apiState.topOfficials.map((official) => (
              <ResultRow
                key={official.officialId}
                title={official.displayName}
                subtitle={`${official.chamber} · ${official.stateCode ?? 'n/a'}`}
                metric={`${official.positionCount} holdings · ${official.transactionCount} trades`}
                onClick={() => onOfficialSelect(official.officialId)}
              />
            ))}
          </ul>
        )}
      </article>
      <article className="panel">
        <h2>Top tickers</h2>
        {status === 'error' ? (
          <p>Read API data is unavailable.</p>
        ) : (
          <ul className="summary-list">
            {apiState.topTickers.map((ticker) => (
              <ResultRow
                key={ticker.ticker}
                title={ticker.ticker}
                subtitle={ticker.representativeAssetName}
                metric={`${ticker.transactionCount} trades · ${ticker.tradingOfficialCount} officials`}
                onClick={() => onTickerSelect(ticker.ticker)}
              />
            ))}
          </ul>
        )}
      </article>
      <article className="panel">
        <h2>Versioned contract</h2>
        <p>
          The first read endpoints now live under <code>/api/v1</code>. That
          keeps future breaking changes on a clean major-version boundary
          instead of reshaping routes in place.
        </p>
      </article>
    </section>
  )
}

interface DetailPanelProps {
  detailState: DetailState
  onBack: () => void
  onOfficialSelect: (officialId: string) => void
  onTickerSelect: (ticker: string) => void
}

function DetailPanel({
  detailState,
  onBack,
  onOfficialSelect,
  onTickerSelect,
}: DetailPanelProps) {
  if (detailState.status === 'idle') {
    return null
  }

  if (detailState.status === 'loading') {
    return (
      <section className="panel detail-panel">
        <button className="back-button" type="button" onClick={onBack}>
          Back to overview
        </button>
        <p>Loading the {detailState.view.kind} view…</p>
      </section>
    )
  }

  if (detailState.status === 'error') {
    return (
      <section className="panel detail-panel">
        <button className="back-button" type="button" onClick={onBack}>
          Back to overview
        </button>
        <p>
          The requested {detailState.view.kind} page could not be loaded from the
          current <code>/api/v1</code> data.
        </p>
      </section>
    )
  }

  return detailState.view.kind === 'official' ? (
    <OfficialDetailPanel
      detail={detailState.data as OfficialDetail}
      onBack={onBack}
      onTickerSelect={onTickerSelect}
    />
  ) : (
    <TickerDetailPanel
      detail={detailState.data as TickerDetail}
      onBack={onBack}
      onOfficialSelect={onOfficialSelect}
      onTickerSelect={onTickerSelect}
    />
  )
}

interface OfficialDetailPanelProps {
  detail: OfficialDetail
  onBack: () => void
  onTickerSelect: (ticker: string) => void
}

function OfficialDetailPanel({
  detail,
  onBack,
  onTickerSelect,
}: OfficialDetailPanelProps) {
  const { summary, portfolio, trades } = detail

  return (
    <section className="panel detail-panel">
      <button className="back-button" type="button" onClick={onBack}>
        Back to overview
      </button>

      <header className="detail-header">
        <div>
          <div className="eyebrow detail-eyebrow">Official profile</div>
          <h2>{summary.displayName}</h2>
          <p className="detail-meta">{formatOfficialMeta(summary)}</p>
        </div>
        <div className="stat-grid">
          <StatCard label="Latest holdings" value={String(summary.positionCount)} />
          <StatCard label="Filed trades" value={String(summary.transactionCount)} />
          <StatCard
            label="Latest PTR"
            value={formatDate(summary.latestPtrFilingDate) ?? 'n/a'}
          />
        </div>
      </header>

      <div className="detail-grid">
        <article className="detail-section">
          <div className="section-header">
            <h3>Latest disclosed portfolio</h3>
            <span>{summary.latestPositionFilingDate ?? 'date unavailable'}</span>
          </div>
          {portfolio.length > 0 ? (
            <ul className="detail-list">
              {portfolio.map((position) => (
                <li key={position.positionId} className="detail-list-item">
                  <div className="detail-primary">
                    <div>
                      <strong>{position.assetName}</strong>
                      <small>
                        {position.ticker ?? position.assetType} · {position.ownerType} ·{' '}
                        {position.confidenceLabel}
                      </small>
                    </div>
                    <span className="summary-metric">
                      {formatAmountRange(position.amountRangeLabel)}
                    </span>
                  </div>
                  <div className="detail-secondary">
                    <span>as of {formatDate(position.asOfFilingDate) ?? 'n/a'}</span>
                    {position.ticker !== null ? (
                      <button
                        className="inline-link"
                        type="button"
                        onClick={() => onTickerSelect(position.ticker!)}
                      >
                        View {position.ticker}
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p>No holdings are materialized for this official yet.</p>
          )}
        </article>

        <article className="detail-section">
          <div className="section-header">
            <h3>Recent trade activity</h3>
            <span>{trades.length} latest rows</span>
          </div>
          {trades.length > 0 ? (
            <ul className="detail-list">
              {trades.map((trade) => (
                <li key={trade.transactionId} className="detail-list-item">
                  <div className="detail-primary">
                    <div>
                      <strong>{trade.assetName}</strong>
                      <small>
                        {trade.transactionType} · {trade.ownerType} · filed{' '}
                        {formatDate(trade.filingDate) ?? 'n/a'}
                      </small>
                    </div>
                    <span className="summary-metric">
                      {formatAmountRange(trade.amountRangeLabel)}
                    </span>
                  </div>
                  <div className="detail-secondary">
                    <span>{formatDate(trade.activityDate) ?? 'n/a'}</span>
                    {trade.ticker !== null ? (
                      <button
                        className="inline-link"
                        type="button"
                        onClick={() => onTickerSelect(trade.ticker!)}
                      >
                        Open {trade.ticker}
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p>No trade activity has been parsed for this official yet.</p>
          )}
        </article>
      </div>
    </section>
  )
}

interface TickerDetailPanelProps {
  detail: TickerDetail
  onBack: () => void
  onOfficialSelect: (officialId: string) => void
  onTickerSelect: (ticker: string) => void
}

function TickerDetailPanel({
  detail,
  onBack,
  onOfficialSelect,
  onTickerSelect,
}: TickerDetailPanelProps) {
  const { summary, holders, trades } = detail

  return (
    <section className="panel detail-panel">
      <button className="back-button" type="button" onClick={onBack}>
        Back to overview
      </button>

      <header className="detail-header">
        <div>
          <div className="eyebrow detail-eyebrow">Ticker view</div>
          <h2>{summary.ticker}</h2>
          <p className="detail-meta">
            {summary.representativeAssetName}
            {summary.representativeIssuerName !== null
              ? ` · ${summary.representativeIssuerName}`
              : ''}
          </p>
        </div>
        <div className="stat-grid">
          <StatCard label="Trades" value={String(summary.transactionCount)} />
          <StatCard label="Officials" value={String(summary.tradingOfficialCount)} />
          <StatCard
            label="Holders"
            value={String(summary.holderCount)}
          />
        </div>
      </header>

      <div className="detail-grid">
        <article className="detail-section">
          <div className="section-header">
            <h3>Latest disclosed holders</h3>
            <span>{summary.latestPositionFilingDate ?? 'date unavailable'}</span>
          </div>
          {holders.length > 0 ? (
            <ul className="detail-list">
              {holders.map((holder) => (
                <li key={holder.positionId} className="detail-list-item">
                  <div className="detail-primary">
                    <div>
                      <strong>{holder.officialDisplayName}</strong>
                      <small>
                        {holder.chamber} · {holder.stateCode ?? 'n/a'} · {holder.ownerType}
                      </small>
                    </div>
                    <span className="summary-metric">
                      {formatAmountRange(holder.amountRangeLabel)}
                    </span>
                  </div>
                  <div className="detail-secondary">
                    <span>{holder.confidenceLabel}</span>
                    <button
                      className="inline-link"
                      type="button"
                      onClick={() => onOfficialSelect(holder.officialId)}
                    >
                      Open official
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p>No current holders are materialized for this ticker yet.</p>
          )}
        </article>

        <article className="detail-section">
          <div className="section-header">
            <h3>Recent trade activity</h3>
            <span>{trades.length} latest rows</span>
          </div>
          {trades.length > 0 ? (
            <ul className="detail-list">
              {trades.map((trade) => (
                <li key={trade.transactionId} className="detail-list-item">
                  <div className="detail-primary">
                    <div>
                      <strong>{trade.officialDisplayName}</strong>
                      <small>
                        {trade.transactionType} · {trade.ownerType} · filed{' '}
                        {formatDate(trade.filingDate) ?? 'n/a'}
                      </small>
                    </div>
                    <span className="summary-metric">
                      {formatAmountRange(trade.amountRangeLabel)}
                    </span>
                  </div>
                  <div className="detail-secondary">
                    <span>{formatDate(trade.activityDate) ?? 'n/a'}</span>
                    <button
                      className="inline-link"
                      type="button"
                      onClick={() => onOfficialSelect(trade.officialId)}
                    >
                      Open official
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p>No trade activity has been parsed for this ticker yet.</p>
          )}
        </article>
      </div>

      <div className="detail-footer">
        <button
          className="inline-link"
          type="button"
          onClick={() => onTickerSelect(summary.ticker)}
        >
          Refresh this ticker view
        </button>
      </div>
    </section>
  )
}

interface ResultRowProps {
  title: string
  subtitle: string
  metric: string
  onClick: () => void
}

function ResultRow({ title, subtitle, metric, onClick }: ResultRowProps) {
  return (
    <li className="summary-item">
      <button className="summary-link" type="button" onClick={onClick}>
        <span>
          <strong>{title}</strong>
          <small>{subtitle}</small>
        </span>
        <span className="summary-metric">{metric}</span>
      </button>
    </li>
  )
}

interface StatCardProps {
  label: string
  value: string
}

function StatCard({ label, value }: StatCardProps) {
  return (
    <article className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function formatOfficialMeta(summary: OfficialSummary): string {
  const parts = [
    summary.chamber,
    summary.stateCode,
    summary.districtCode,
    summary.party,
    summary.isCurrent ? 'current' : 'not current',
  ].filter((value): value is string => value !== null && value !== '')

  return parts.join(' · ')
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

function formatAmountRange(label: string | null): string {
  return label ?? 'amount unavailable'
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function createDetailStateForView(view: AppView): DetailState {
  return view.kind === 'overview' ? { status: 'idle' } : { status: 'loading', view }
}

export default App
