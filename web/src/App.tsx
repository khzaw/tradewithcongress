import { startTransition, useEffect, useState } from 'react'
import './App.css'

interface OfficialSummary {
  officialId: string
  displayName: string
  chamber: string
  stateCode: string | null
  positionCount: number
  transactionCount: number
}

interface TickerSummary {
  ticker: string
  representativeAssetName: string
  transactionCount: number
  tradingOfficialCount: number
  holderCount: number
}

interface ApiState {
  apiVersion: string
  topOfficials: OfficialSummary[]
  topTickers: TickerSummary[]
}

interface OfficialSearchResult {
  officialId: string
  displayName: string
  chamber: string
  stateCode: string | null
  matchedAlias: string
  positionCount: number
  transactionCount: number
}

interface TickerSearchResult {
  ticker: string
  representativeAssetName: string
  transactionCount: number
  holderCount: number
  matchedField: string
}

interface SearchState {
  query: string
  officials: OfficialSearchResult[]
  tickers: TickerSearchResult[]
}

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

function App() {
  const [apiState, setApiState] = useState<ApiState>(EMPTY_STATE)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchState, setSearchState] = useState<SearchState>(EMPTY_SEARCH_STATE)
  const [searchStatus, setSearchStatus] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setStatus('loading')

      try {
        const [metaResponse, officialsResponse, tickersResponse] = await Promise.all([
          fetch('/api/v1/meta'),
          fetch('/api/v1/officials?limit=3'),
          fetch('/api/v1/tickers?limit=3'),
        ])

        if (!metaResponse.ok || !officialsResponse.ok || !tickersResponse.ok) {
          throw new Error('Failed to load read API data')
        }

        const metaBody = (await metaResponse.json()) as { apiVersion: string }
        const officialsBody = (await officialsResponse.json()) as {
          data: OfficialSummary[]
        }
        const tickersBody = (await tickersResponse.json()) as {
          data: TickerSummary[]
        }

        if (cancelled) {
          return
        }

        startTransition(() => {
          setApiState({
            apiVersion: metaBody.apiVersion,
            topOfficials: officialsBody.data,
            topTickers: tickersBody.data,
          })
          setStatus('ready')
        })
      } catch {
        if (cancelled) {
          return
        }
        setStatus('error')
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

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
      const response = await fetch(
        `/api/v1/search?q=${encodeURIComponent(query)}&limit=5`,
      )
      if (!response.ok) {
        throw new Error('Failed to load search results')
      }

      const body = (await response.json()) as { data: SearchState }

      startTransition(() => {
        setSearchState(body.data)
        setSearchStatus('ready')
      })
    } catch {
      setSearchStatus('error')
    }
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
          This scaffold is the starting point for the official-first and
          ticker-first product experience.
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
        </p>
      </section>

      {(searchStatus !== 'idle' || searchState.query) && (
        <section className="panel search-results">
          <div className="panel-header">
            <h2>Search results</h2>
            {searchState.query ? <span>{searchState.query}</span> : null}
          </div>

          {searchStatus === 'loading' ? <p>Searching officials and securities…</p> : null}

          {searchStatus === 'error' ? (
            <p>
              Enter at least two characters and make sure the versioned read API
              is running.
            </p>
          ) : null}

          {searchStatus === 'ready' &&
          searchState.officials.length === 0 &&
          searchState.tickers.length === 0 ? (
            <p>No matches found for that query.</p>
          ) : null}

          {searchStatus === 'ready' && searchState.officials.length > 0 ? (
            <div className="search-group">
              <h3>Officials</h3>
              <ul className="summary-list">
                {searchState.officials.map((official) => (
                  <li key={official.officialId} className="summary-item">
                    <span>
                      <strong>{official.displayName}</strong>
                      <small>
                        {official.chamber} · {official.stateCode ?? 'n/a'} · alias match:{' '}
                        {official.matchedAlias}
                      </small>
                    </span>
                    <span className="summary-metric">
                      {official.positionCount} holdings · {official.transactionCount} trades
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {searchStatus === 'ready' && searchState.tickers.length > 0 ? (
            <div className="search-group">
              <h3>Securities</h3>
              <ul className="summary-list">
                {searchState.tickers.map((ticker) => (
                  <li key={ticker.ticker} className="summary-item">
                    <span>
                      <strong>{ticker.ticker}</strong>
                      <small>
                        {ticker.representativeAssetName} · matched on {ticker.matchedField}
                      </small>
                    </span>
                    <span className="summary-metric">
                      {ticker.transactionCount} trades · {ticker.holderCount} holders
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      )}

      <section className="grid">
        <article className="panel">
          <h2>Top officials</h2>
          {status === 'error' ? (
            <p>
              The versioned read API is not reachable yet. Start `make dev` to
              bring up `/api/v1` alongside Vite.
            </p>
          ) : (
            <ul className="summary-list">
              {apiState.topOfficials.map((official) => (
                <li key={official.officialId} className="summary-item">
                  <span>
                    <strong>{official.displayName}</strong>
                    <small>
                      {official.chamber} · {official.stateCode ?? 'n/a'}
                    </small>
                  </span>
                  <span className="summary-metric">
                    {official.positionCount} holdings · {official.transactionCount} trades
                  </span>
                </li>
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
                <li key={ticker.ticker} className="summary-item">
                  <span>
                    <strong>{ticker.ticker}</strong>
                    <small>{ticker.representativeAssetName}</small>
                  </span>
                  <span className="summary-metric">
                    {ticker.transactionCount} trades · {ticker.tradingOfficialCount} officials
                  </span>
                </li>
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
    </main>
  )
}

export default App
