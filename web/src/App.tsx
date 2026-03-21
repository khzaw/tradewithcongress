import { useEffect, useState } from 'react'
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

const EMPTY_STATE: ApiState = {
  apiVersion: 'v1',
  topOfficials: [],
  topTickers: [],
}

function App() {
  const [apiState, setApiState] = useState<ApiState>(EMPTY_STATE)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')

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

        setApiState({
          apiVersion: metaBody.apiVersion,
          topOfficials: officialsBody.data,
          topTickers: tickersBody.data,
        })
        setStatus('ready')
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
        <div className="search-shell">
          <input
            className="search-input"
            type="search"
            placeholder="Search Nancy Pelosi, NVDA, or Wells Fargo"
            aria-label="Search filings, officials, or securities"
          />
          <button className="search-button" type="button">
            Search
          </button>
        </div>
      </section>

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
