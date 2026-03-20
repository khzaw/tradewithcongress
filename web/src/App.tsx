import './App.css'

function App() {
  return (
    <main className="app-shell">
      <section className="hero">
        <div className="eyebrow">Congressional disclosure intelligence</div>
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
          <h2>Official-first</h2>
          <p>
            View latest disclosed portfolio state, trade timelines, and source
            filings for each official.
          </p>
        </article>
        <article className="panel">
          <h2>Ticker-first</h2>
          <p>
            See who traded a security, when they traded it, and whether it
            still appears to be held.
          </p>
        </article>
        <article className="panel">
          <h2>Source-backed</h2>
          <p>
            Keep raw disclosure provenance, filing lag context, and confidence
            labels attached to every derived claim.
          </p>
        </article>
      </section>
    </main>
  )
}

export default App
