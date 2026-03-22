import { useState, useEffect } from "react"
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from "recharts"
import axios from "axios"

const API = "https://stock-bot-pvez.onrender.com"

const STRATEGIES = {
  ma_crossover: {
    label: "Moving Average Crossover",
    params: [
      { key: "short_window", label: "Short Window", default: 20, min: 5, max: 50 },
      { key: "long_window", label: "Long Window", default: 50, min: 20, max: 200 },
    ]
  },
  rsi: {
    label: "RSI Mean Reversion",
    params: [
      { key: "period", label: "RSI Period", default: 14, min: 5, max: 30 },
      { key: "oversold", label: "Oversold Threshold", default: 30, min: 10, max: 45 },
      { key: "overbought", label: "Overbought Threshold", default: 70, min: 55, max: 90 },
    ]
  },
  bollinger: {
    label: "Bollinger Band Breakout",
    params: [
      { key: "period", label: "Period", default: 20, min: 5, max: 50 },
      { key: "std_dev", label: "Std Deviations", default: 2, min: 1, max: 4 },
    ]
  },
  macd: {
    label: "MACD Signal",
    params: [
      { key: "fast", label: "Fast Period", default: 12, min: 5, max: 20 },
      { key: "slow", label: "Slow Period", default: 26, min: 15, max: 50 },
      { key: "signal", label: "Signal Period", default: 9, min: 5, max: 20 },
    ]
  },
  buy_and_hold: {
    label: "Buy and Hold",
    params: []
  }
}

export default function App() {
  const [tab, setTab] = useState("positions")
  const [ticker, setTicker] = useState("")
  const [horizon, setHorizon] = useState(30)
  const [prediction, setPrediction] = useState(null)
  const [predLoading, setPredLoading] = useState(false)
  const [predError, setPredError] = useState(null)
  const [selectedStock, setSelectedStock] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [portfolio, setPortfolio] = useState(null)
  const [tradeTicker, setTradeTicker] = useState("")
  const [tradeShares, setTradeShares] = useState(1)
  const [tradeLoading, setTradeLoading] = useState(false)
  const [tradeError, setTradeError] = useState(null)
  const [positionSignals, setPositionSignals] = useState([])
  const [btTicker, setBtTicker] = useState("")
  const [btStrategy, setBtStrategy] = useState("ma_crossover")
  const [btPeriod, setBtPeriod] = useState("2y")
  const [btParams, setBtParams] = useState({ short_window: 20, long_window: 50 })
  const [btResult, setBtResult] = useState(null)
  const [btLoading, setBtLoading] = useState(false)
  const [btError, setBtError] = useState(null)
  const [portfolioLoading, setPortfolioLoading] = useState(true)
  const [mcTicker, setMcTicker] = useState("")
  const [mcDays, setMcDays] = useState(252)
  const [mcSims, setMcSims] = useState(1000)
  const [mcResult, setMcResult] = useState(null)
  const [mcLoading, setMcLoading] = useState(false)
  const [mcError, setMcError] = useState(null)

  const [scanResult, setScanResult] = useState(null)
  const [scanLoading, setScanLoading] = useState(false)
  const [scanError, setScanError] = useState(null)
  const [tradePrice, setTradePrice] = useState(null)
  const [tradePriceLoading, setTradePriceLoading] = useState(false)
  

  useEffect(() => {
    const defaults = {}
    STRATEGIES[btStrategy].params.forEach(p => defaults[p.key] = p.default)
    setBtParams(defaults)
  }, [btStrategy])
  useEffect(() => { 
    fetchPortfolio()
    fetchPositionSignals()
  }, [])

  async function fetchPrediction() {
    setPredLoading(true)
    setPredError(null)
    try {
      const res = await axios.get(`${API}/predict/${ticker}?horizon=${horizon}`)
      setPrediction(res.data)
    } catch (e) {
      setPredError(e.response?.data?.detail || "Something went wrong")
    } finally {
      setPredLoading(false)
    }
  }
  async function runMonteCarlo() {
    setMcLoading(true)
    setMcError(null)
    try {
      const res = await axios.post(`${API}/monte-carlo/`, {
        ticker: mcTicker.toUpperCase(),
        days: mcDays,
        simulations: mcSims
      })
      setMcResult(res.data)
    } catch (e) {
      setMcError(e.response?.data?.detail || "Simulation failed")
    } finally {
      setMcLoading(false)
    }
  }

  async function fetchTradePrice(ticker) {
    if (!ticker || ticker.length < 2) return
    setTradePriceLoading(true)
    try {
      const res = await axios.get(`${API}/scanner/${ticker}`)
      setTradePrice(res.data.current_price)
    } catch (e) {
      setTradePrice(null)
    } finally {
      setTradePriceLoading(false)
    }
  }


  async function fetchPortfolio() {
    setPortfolioLoading(true)
    try {
      const res = await axios.get(`${API}/portfolio/`)
      setPortfolio(res.data)
    } catch (e) {}
    finally {
      setPortfolioLoading(false)
    }
  }
  async function fetchPositionSignals() {
    try {
      const res = await axios.get(`${API}/portfolio/signals`)
      setPositionSignals(res.data.signals || [])
    } catch (e) {}
  }
  async function executeTrade(action) {
    setTradeLoading(true)
    setTradeError(null)
    try {
      await axios.post(`${API}/portfolio/trade`, {
        ticker: tradeTicker.toUpperCase(),
        shares: Number(tradeShares),
        action
      })
      await fetchPortfolio()
      await fetchPositionSignals()
    } catch (e) {
      setTradeError(e.response?.data?.detail || "Trade failed")
    } finally {
      setTradeLoading(false)
    }
  }

  async function openStockDetail(ticker) {
    setDetailLoading(true)
    setSelectedStock(null)
    try {
      const res = await axios.get(`${API}/scanner/${ticker}`)
      setSelectedStock(res.data)
    } catch (e) {
      console.error(e)
    } finally {
      setDetailLoading(false)
    }
  }
  async function runBacktest() {
    setBtLoading(true)
    setBtError(null)
    try {
      const res = await axios.post(`${API}/backtest/`, {
        ticker: btTicker.toUpperCase(),
        strategy: btStrategy,
        period: btPeriod,
        params: btParams
      })
      setBtResult(res.data)
    } catch (e) {
      setBtError(e.response?.data?.detail || "Backtest failed")
    } finally {
      setBtLoading(false)
    }
  }


  async function runScanner() {
    setScanLoading(true)
    setScanError(null)
    try {
      const res = await axios.post(`${API}/scanner/`, {})
      setScanResult(res.data)
    } catch (e) {
      setScanError(e.response?.data?.detail || "Scanner failed")
    } finally {
      setScanLoading(false)
    }
  }
  async function resetPortfolio() {
    await axios.post(`${API}/portfolio/reset`)
    await fetchPortfolio()
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f0f", color: "#f0f0f0", fontFamily: "sans-serif", padding: "40px", maxWidth: 1200, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 4 }}>Stock Predictor</h1>
          <p style={{ color: "#888" }}>Forecasting · Backtesting · Paper Trading</p>
        </div>
        {portfolio && (
          <div style={{ textAlign: "right" }}>
            <p style={{ color: "#888", fontSize: 12, marginBottom: 4 }}>PORTFOLIO VALUE</p>
            <p style={{ fontSize: 24, fontWeight: 600 }}>${portfolio.total_value.toLocaleString()}</p>
            <p style={{ fontSize: 14, color: portfolio.total_pnl >= 0 ? "#4ade80" : "#f87171" }}>
              {portfolio.total_pnl >= 0 ? "+" : ""}${portfolio.total_pnl.toFixed(2)} ({portfolio.total_pnl_pct.toFixed(2)}%)
            </p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 32, background: "#1a1a1a", borderRadius: 10, padding: 4, width: "fit-content" }}>
        {["backtest", "montecarlo", "scanner", "trade", "positions"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 14,
            background: tab === t ? "#6366f1" : "transparent",
            color: tab === t ? "#fff" : "#888"
          }}>
            {t === "montecarlo" ? "Monte Carlo" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* PREDICT TAB */}
      {tab === "predict" && (
        <>
          <div style={{ display: "flex", gap: 12, marginBottom: 32, alignItems: "center" }}>
            <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} placeholder="Ticker" style={inputStyle} />
            <select value={horizon} onChange={e => setHorizon(Number(e.target.value))} style={inputStyle}>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
            <button onClick={fetchPrediction} disabled={predLoading} style={btnStyle(predLoading)}>
              {predLoading ? "Predicting..." : "Predict"}
            </button>
          </div>
          {predError && <p style={{ color: "#f87171", marginBottom: 24 }}>{predError}</p>}
          {prediction && (
            <>
              <div style={{ display: "flex", gap: 16, marginBottom: 32 }}>
                <Card label="Current Price" value={`$${prediction.last_price}`} />
                <Card label="Predicted Price" value={`$${prediction.predicted_price}`} />
                <Card label="Signal" value={prediction.signal.toUpperCase()} color={prediction.signal === "bullish" ? "#4ade80" : "#f87171"} />
                <Card label="Confidence" value={`${prediction.confidence}%`} />
              </div>
              <div style={{ background: "#1a1a1a", borderRadius: 12, padding: 24 }}>
                <h2 style={{ marginBottom: 20, fontSize: 16, fontWeight: 500, color: "#aaa" }}>
                  {prediction.ticker} — {prediction.horizon_days}-day forecast
                </h2>
                <ResponsiveContainer width="100%" height={350}>
                  <AreaChart data={prediction.forecast}>
                    <defs>
                      <linearGradient id="band" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fill: "#666", fontSize: 11 }} tickLine={false} interval="preserveStartEnd" />
                    <YAxis domain={["auto", "auto"]} tick={{ fill: "#666", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
                    <Tooltip contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: 8 }} labelStyle={{ color: "#aaa" }} formatter={(v) => [`$${v}`]} />
                    <Area type="monotone" dataKey="upper" stroke="none" fill="url(#band)" />
                    <Area type="monotone" dataKey="lower" stroke="none" fill="#0f0f0f" />
                    <Line type="monotone" dataKey="predicted" stroke="#6366f1" strokeWidth={2} dot={false} />
                    <ReferenceLine y={prediction.last_price} stroke="#444" strokeDasharray="4 4" label={{ value: "Now", fill: "#666", fontSize: 11 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </>
      )}

      {/* BACKTEST TAB */}
      {tab === "backtest" && (
        <>
          <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={labelStyle}>Ticker</label>
              <input value={btTicker} onChange={e => setBtTicker(e.target.value.toUpperCase())} style={inputStyle} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={labelStyle}>Strategy</label>
              <select value={btStrategy} onChange={e => setBtStrategy(e.target.value)} style={inputStyle}>
                {Object.entries(STRATEGIES).map(([key, s]) => (
                  <option key={key} value={key}>{s.label}</option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={labelStyle}>Period</label>
              <select value={btPeriod} onChange={e => setBtPeriod(e.target.value)} style={inputStyle}>
                <option value="6mo">6 months</option>
                <option value="1y">1 year</option>
                <option value="2y">2 years</option>
                <option value="5y">5 years</option>
              </select>
            </div>
          </div>

          {/* Strategy params */}
          {STRATEGIES[btStrategy].params.length > 0 && (
            <div style={{ display: "flex", gap: 24, marginBottom: 24, flexWrap: "wrap", background: "#1a1a1a", padding: 20, borderRadius: 12 }}>
              {STRATEGIES[btStrategy].params.map(p => (
                <div key={p.key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={labelStyle}>{p.label}: <strong style={{ color: "#f0f0f0" }}>{btParams[p.key]}</strong></label>
                  <input type="range" min={p.min} max={p.max} value={btParams[p.key] || p.default}
                    onChange={e => setBtParams(prev => ({ ...prev, [p.key]: Number(e.target.value) }))}
                    style={{ width: 160 }} />
                </div>
              ))}
            </div>
          )}

          <button onClick={runBacktest} disabled={btLoading} style={{ ...btnStyle(btLoading), marginBottom: 32 }}>
            {btLoading ? "Running..." : "Run Backtest"}
          </button>

          {btError && <p style={{ color: "#f87171", marginBottom: 24 }}>{btError}</p>}

          {btResult && (
            <>
              <div style={{ display: "flex", gap: 16, marginBottom: 32, flexWrap: "wrap" }}>
                <Card label="Final Value" value={`$${btResult.final_value.toLocaleString()}`} />
                <Card label="Strategy Return" value={`${btResult.total_return >= 0 ? "+" : ""}${btResult.total_return}%`}
                  color={btResult.total_return >= 0 ? "#4ade80" : "#f87171"} />
                <Card label="Buy & Hold Return" value={`${btResult.bh_return >= 0 ? "+" : ""}${btResult.bh_return}%`}
                  color={btResult.bh_return >= 0 ? "#4ade80" : "#f87171"} />
                <Card label="Sharpe Ratio" value={btResult.sharpe} />
                <Card label="Max Drawdown" value={`${btResult.max_drawdown}%`} color="#f87171" />
                <Card label="# Trades" value={btResult.num_trades} />
              </div>

              <div style={{ background: "#1a1a1a", borderRadius: 12, padding: 24, marginBottom: 24 }}>
                <h2 style={{ marginBottom: 20, fontSize: 16, fontWeight: 500, color: "#aaa" }}>
                  Portfolio value over time
                </h2>
                <ResponsiveContainer width="100%" height={350}>
                  <AreaChart data={btResult.portfolio_values}>
                    <defs>
                      <linearGradient id="pv" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#222" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: "#666", fontSize: 11 }} tickLine={false} interval="preserveStartEnd" />
                    <YAxis domain={["auto", "auto"]} tick={{ fill: "#666", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `$${v.toLocaleString()}`} />
                    <Tooltip contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: 8 }} labelStyle={{ color: "#aaa" }}
                      formatter={(v) => [`$${v.toLocaleString()}`]} />
                    <ReferenceLine y={10000} stroke="#444" strokeDasharray="4 4" label={{ value: "Start", fill: "#666", fontSize: 11 }} />
                    <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} fill="url(#pv)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {btResult.trades.length > 0 && (
                <div style={{ background: "#1a1a1a", borderRadius: 12, overflow: "hidden" }}>
                  <p style={{ padding: "16px", color: "#888", fontSize: 12, borderBottom: "1px solid #333" }}>TRADE LOG</p>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #333" }}>
                        {["Date", "Action", "Price", "Shares"].map(h => (
                          <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: "#666", fontSize: 12, fontWeight: 500 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {btResult.trades.map((t, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #222" }}>
                          <td style={tdStyle}>{t.date}</td>
                          <td style={{ ...tdStyle, color: t.action === "buy" ? "#4ade80" : "#f87171", textTransform: "uppercase" }}>{t.action}</td>
                          <td style={tdStyle}>${t.price}</td>
                          <td style={tdStyle}>{t.shares}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
      {tab === "scanner" && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Trade Signal Scanner</h2>
              <p style={{ color: "#888", fontSize: 13 }}>Scans top 100 S&P 500 stocks and ranks by Trade Quality Index</p>
            </div>
            <button onClick={runScanner} disabled={scanLoading} style={btnStyle(scanLoading)}>
              {scanLoading ? "Scanning..." : "Run Scanner"}
            </button>
          </div>

          {scanLoading && (
            <div style={{ background: "#1a1a1a", borderRadius: 12, padding: 40, textAlign: "center" }}>
              <p style={{ color: "#888", marginBottom: 8 }}>Analyzing 30 stocks in parallel...</p>
              <p style={{ color: "#666", fontSize: 13 }}>Computing RSI · MA · MACD · Bollinger · Monte Carlo</p>
            </div>
          )}

          {scanError && <p style={{ color: "#f87171", marginBottom: 24 }}>{scanError}</p>}

          {scanResult && (
            <>
              <p style={{ color: "#666", fontSize: 13, marginBottom: 16 }}>
                {scanResult.total_scanned} stocks analyzed · Last updated: {scanResult.last_updated}
              </p>

              {(() => {
                const bullish = scanResult.all_results.filter(s => s.tqi >= 60).length
                const bearish = scanResult.all_results.filter(s => s.tqi <= 35).length
                const total = scanResult.all_results.length
                const aboveMa = scanResult.all_results.filter(s => s.ma20 > s.ma50).length

                const regime = aboveMa >= total * 0.6 ? "bullish"
                            : aboveMa <= total * 0.35 ? "bearish"
                            : "mixed"

                const config = {
                  bullish: { color: "#4ade80", bg: "#14532d", label: "Bullish", desc: "Favorable conditions — strong buy signals present" },
                  bearish: { color: "#f87171", bg: "#450a0a", label: "Bearish", desc: "Unfavorable conditions — few buy signals expected" },
                  mixed:   { color: "#facc15", bg: "#422006", label: "Mixed",   desc: "Selective conditions — only strongest signals worth acting on" },
                }[regime]

                return (
                  <div style={{
                    background: config.bg, border: `1px solid ${config.color}22`,
                    borderLeft: `3px solid ${config.color}`,
                    borderRadius: 10, padding: "14px 18px",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    marginBottom: 24
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ color: config.color, fontWeight: 700, fontSize: 13 }}>
                        MARKET REGIME: {config.label.toUpperCase()}
                      </span>
                      <span style={{ color: config.color, opacity: 0.8, fontSize: 13 }}>
                        {config.desc}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 20, fontSize: 12 }}>
                      <span style={{ color: "#4ade80" }}>{bullish} buy</span>
                      <span style={{ color: "#888" }}>{total - bullish - bearish} hold</span>
                      <span style={{ color: "#f87171" }}>{bearish} sell</span>
                      <span style={{ color: "#888" }}>{aboveMa}/{total} above MA50</span>
                    </div>
                  </div>
                )
              })()}

              {/* Top Buys */}
              {scanResult.top_buys.length > 0 && (
                <div style={{ marginBottom: 32 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 500, color: "#4ade80", marginBottom: 16, textTransform: "uppercase", letterSpacing: 1 }}>
                    Top Buy Signals
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {scanResult.top_buys.map((stock, i) => (
                      <SignalCard key={stock.ticker} stock={stock} rank={i + 1} />
                    ))}
                  </div>
                </div>
              )}

              {/* Full rankings table */}
              <div style={{ background: "#1a1a1a", borderRadius: 12, overflow: "hidden" }}>
                <p style={{ padding: "16px", color: "#888", fontSize: 12, borderBottom: "1px solid #333" }}>
                  FULL RANKINGS — {scanResult.all_results.length} STOCKS
                </p>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #333" }}>
                      {["Rank", "Ticker", "TQI", "Price", "RSI", "MC Profit%", "Volatility", "Signal"].map(h => (
                        <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: "#666", fontSize: 12, fontWeight: 500 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scanResult.all_results.map((stock, i) => (
                      <tr key={stock.ticker}
                        onClick={() => openStockDetail(stock.ticker)}
                        onMouseEnter={e => e.currentTarget.style.background = "#222"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        style={{ borderBottom: "1px solid #222", cursor: "pointer" }}>
                        <td style={tdStyle}>{i + 1}</td>
                        <td style={tdStyle}><strong>{stock.ticker}</strong></td>
                        <td style={{ ...tdStyle }}>
                          <TQIBadge score={stock.tqi} />
                        </td>
                        <td style={tdStyle}>${stock.current_price}</td>
                        <td style={{ ...tdStyle, color: stock.rsi < 30 ? "#4ade80" : stock.rsi > 70 ? "#f87171" : "#ccc" }}>
                          {stock.rsi}
                        </td>
                        <td style={{ ...tdStyle, color: stock.prob_profit > 55 ? "#4ade80" : "#f87171" }}>
                          {stock.prob_profit}%
                        </td>
                        <td style={{ ...tdStyle, color: stock.volatility > 0.4 ? "#f87171" : "#ccc" }}>
                          {(stock.volatility * 100).toFixed(1)}%
                        </td>
                        <td style={tdStyle}>
                          <span style={{
                            padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500,
                            background: stock.signal === "buy" ? "#14532d" : stock.signal === "sell" ? "#450a0a" : "#1c1c1c",
                            color: stock.signal === "buy" ? "#4ade80" : stock.signal === "sell" ? "#f87171" : "#888"
                          }}>
                            {stock.signal.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
      {/* TRADE TAB */}
      {tab === "trade" && (
        <div style={{ maxWidth: 480 }}>
          <div style={{ background: "#1a1a1a", borderRadius: 12, padding: 24, marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 500, marginBottom: 20 }}>Execute Trade</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input value={tradeTicker} onChange={e => {
                setTradeTicker(e.target.value.toUpperCase())
                if (e.target.value.length >= 1) fetchTradePrice(e.target.value.toUpperCase())
              }}
                placeholder="Ticker (e.g. AAPL)" style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
              
              <input type="number" value={tradeShares} onChange={e => setTradeShares(e.target.value)}
                placeholder="Shares" min="0.01" step="0.01" style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />

              {tradePriceLoading && (
                <p style={{ color: "#666", fontSize: 13 }}>Fetching price...</p>
              )}

              {tradePrice && (
                <div style={{ background: "#111", borderRadius: 8, padding: "12px 16px", display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <p style={{ color: "#666", fontSize: 11, marginBottom: 4 }}>CURRENT PRICE</p>
                    <p style={{ fontWeight: 600 }}>${tradePrice}</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ color: "#666", fontSize: 11, marginBottom: 4 }}>TOTAL COST</p>
                    <p style={{ fontWeight: 600, color: "#6366f1" }}>
                      ${(tradePrice * Number(tradeShares)).toFixed(2)}
                    </p>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => executeTrade("buy")} disabled={tradeLoading}
                  style={{ ...btnStyle(tradeLoading), flex: 1, background: "#22c55e" }}>Buy</button>
                <button onClick={() => executeTrade("sell")} disabled={tradeLoading}
                  style={{ ...btnStyle(tradeLoading), flex: 1, background: "#ef4444" }}>Sell</button>
              </div>
            </div>
            {tradeError && <p style={{ color: "#f87171", marginTop: 12, fontSize: 14 }}>{tradeError}</p>}
          </div>
          {portfolio && (
            <div style={{ background: "#1a1a1a", borderRadius: 12, padding: 24 }}>
              <p style={{ color: "#888", fontSize: 12, marginBottom: 4 }}>AVAILABLE CASH</p>
              <p style={{ fontSize: 22, fontWeight: 600 }}>${portfolio.cash.toLocaleString()}</p>
            </div>
          )}
        </div>
      )}
      {tab === "montecarlo" && (
        <>
          <div style={{ display: "flex", gap: 16, marginBottom: 24, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={labelStyle}>Ticker</label>
              <input value={mcTicker} onChange={e => setMcTicker(e.target.value.toUpperCase())} style={inputStyle} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={labelStyle}>Horizon</label>
              <select value={mcDays} onChange={e => setMcDays(Number(e.target.value))} style={inputStyle}>
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
                <option value={252}>1 year</option>
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={labelStyle}>Simulations</label>
              <select value={mcSims} onChange={e => setMcSims(Number(e.target.value))} style={inputStyle}>
                <option value={500}>500</option>
                <option value={1000}>1,000</option>
                <option value={5000}>5,000</option>
              </select>
            </div>
            <button onClick={runMonteCarlo} disabled={mcLoading} style={btnStyle(mcLoading)}>
              {mcLoading ? "Simulating..." : "Run Simulation"}
            </button>
          </div>

          {mcError && <p style={{ color: "#f87171", marginBottom: 24 }}>{mcError}</p>}

          {mcResult && (
            <>
              {/* Risk metrics */}
              <div style={{ display: "flex", gap: 16, marginBottom: 32, flexWrap: "wrap" }}>
                <Card label="Current Price" value={`$${mcResult.current_price}`} />
                <Card label="Expected Price" value={`$${mcResult.metrics.expected_price}`} />
                <Card label="Median Price" value={`$${mcResult.metrics.median_price}`} />
                <Card label="Prob. Profit" value={`${mcResult.metrics.prob_profit}%`}
                  color={mcResult.metrics.prob_profit > 50 ? "#4ade80" : "#f87171"} />
                <Card label="Value at Risk (95%)" value={`$${mcResult.metrics.var_95}`} color="#f87171" />
                <Card label="Prob. Loss >20%" value={`${mcResult.metrics.prob_loss_20pct}%`} color="#f87171" />
              </div>

              {/* Simulation fan chart */}
              <div style={{ background: "#1a1a1a", borderRadius: 12, padding: 24, marginBottom: 24 }}>
                <div style={{ marginBottom: 16 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 500, color: "#aaa", marginBottom: 4 }}>
                    {mcResult.ticker} — {mcResult.simulations.toLocaleString()} simulations over {mcResult.days} days
                  </h2>
                  <p style={{ fontSize: 12, color: "#666" }}>
                    Drift: {(mcResult.mu * 100).toFixed(4)}% daily · Volatility: {(mcResult.sigma * 100).toFixed(4)}% daily
                  </p>
                </div>
                <ResponsiveContainer width="100%" height={400}>
                  <AreaChart data={mcResult.chart_data}>
                    <defs>
                      <linearGradient id="mc90" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.08} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="mc50" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#222" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="day" tick={{ fill: "#666", fontSize: 11 }} tickLine={false}
                      tickFormatter={v => `Day ${v}`} interval="preserveStartEnd" />
                    <YAxis domain={["auto", "auto"]} tick={{ fill: "#666", fontSize: 11 }}
                      tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
                    <Tooltip contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: 8 }}
                      labelStyle={{ color: "#aaa" }} labelFormatter={v => `Day ${v}`}
                      formatter={(v, name) => {
                        const labels = { p90: "90th %ile", p75: "75th %ile", p50: "Median", p25: "25th %ile", p10: "10th %ile" }
                        return [`$${v}`, labels[name] || name]
                      }} />
                    <Area type="monotone" dataKey="p90" stroke="#6366f1" strokeWidth={1}
                      strokeOpacity={0.4} fill="url(#mc90)" dot={false} />
                    <Area type="monotone" dataKey="p75" stroke="#6366f1" strokeWidth={1}
                      strokeOpacity={0.6} fill="url(#mc50)" dot={false} />
                    <Area type="monotone" dataKey="p50" stroke="#a5b4fc" strokeWidth={2}
                      fill="none" dot={false} />
                    <Area type="monotone" dataKey="p25" stroke="#6366f1" strokeWidth={1}
                      strokeOpacity={0.6} fill="#0f0f0f" dot={false} />
                    <Area type="monotone" dataKey="p10" stroke="#6366f1" strokeWidth={1}
                      strokeOpacity={0.4} fill="#0f0f0f" dot={false} />
                    <ReferenceLine y={mcResult.current_price} stroke="#444"
                      strokeDasharray="4 4" label={{ value: "Today", fill: "#666", fontSize: 11 }} />
                  </AreaChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", gap: 24, marginTop: 16, justifyContent: "center" }}>
                  {[
                    { color: "#6366f1", opacity: 0.3, label: "10th–90th percentile" },
                    { color: "#6366f1", opacity: 0.6, label: "25th–75th percentile" },
                    { color: "#a5b4fc", opacity: 1, label: "Median path" },
                  ].map(item => (
                    <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 24, height: 3, background: item.color, opacity: item.opacity, borderRadius: 2 }} />
                      <span style={{ fontSize: 12, color: "#666" }}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Final price distribution */}
              <div style={{ background: "#1a1a1a", borderRadius: 12, padding: 24 }}>
                <h2 style={{ fontSize: 16, fontWeight: 500, color: "#aaa", marginBottom: 20 }}>
                  Final price distribution (day {mcResult.days})
                </h2>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={mcResult.histogram}>
                    <defs>
                      <linearGradient id="hist" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="price" tick={{ fill: "#666", fontSize: 11 }} tickLine={false}
                      tickFormatter={v => `$${v}`} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: "#666", fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: 8 }}
                      labelStyle={{ color: "#aaa" }} labelFormatter={v => `$${v}`}
                      formatter={(v) => [v, "simulations"]} />
                    <ReferenceLine x={mcResult.metrics.var_95} stroke="#f87171"
                      strokeDasharray="4 4" label={{ value: "VaR 95%", fill: "#f87171", fontSize: 11 }} />
                    <Area type="monotone" dataKey="count" stroke="#6366f1"
                      strokeWidth={2} fill="url(#hist)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
                <p style={{ fontSize: 12, color: "#666", marginTop: 12, textAlign: "center" }}>
                  In 95% of simulations, final price was above ${mcResult.metrics.var_95} · In {mcResult.metrics.prob_profit}% of simulations, the stock finished higher than today
                </p>
              </div>
            </>
          )}
        </>
      )}
      {/* POSITIONS TAB */}
      {tab === "positions" && (
        <div>
          {portfolioLoading && !portfolio && (
            <div style={{ background: "#1a1a1a", borderRadius: 12, padding: 60, textAlign: "center" }}>
              <p style={{ color: "#888", marginBottom: 8 }}>Loading portfolio...</p>
              <p style={{ color: "#666", fontSize: 13 }}>Fetching current prices</p>
            </div>
          )}
          {portfolio && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                  <div>
                    <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Portfolio</h2>
                    <p style={{ color: "#888", fontSize: 13 }}>Paper trading · $10,000 starting balance</p>
                  </div>
                  <button
                    onClick={() => { fetchPortfolio(); fetchPositionSignals() }}
                    disabled={portfolioLoading}
                    style={{
                      padding: "8px 16px", borderRadius: 8, border: "1px solid #333",
                      background: "transparent", color: portfolioLoading ? "#666" : "#f0f0f0",
                      cursor: portfolioLoading ? "not-allowed" : "pointer", fontSize: 13,
                      display: "flex", alignItems: "center", gap: 6
                    }}
                  >
                    <span style={{
                      display: "inline-block",
                      animation: portfolioLoading ? "spin 1s linear infinite" : "none"
                    }}>↻</span>
                    {portfolioLoading ? "Refreshing..." : "Refresh Prices"}
                  </button>
                </div>
                <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
                  <Card label="Total Value" value={`$${portfolio.total_value.toLocaleString()}`} />
                  <Card label="Cash" value={`$${portfolio.cash.toLocaleString()}`} />
                  <Card label="Total P&L" value={`${portfolio.total_pnl >= 0 ? "+" : ""}$${portfolio.total_pnl.toFixed(2)}`}
                    color={portfolio.total_pnl >= 0 ? "#4ade80" : "#f87171"} />
                  <Card label="Return" value={`${portfolio.total_pnl_pct.toFixed(2)}%`}
                    color={portfolio.total_pnl_pct >= 0 ? "#4ade80" : "#f87171"} />
                </div>
                {positionSignals.length > 0 && (
                  <div style={{
                    background: "#450a0a", borderLeft: "3px solid #f87171",
                    borderRadius: 10, padding: "14px 18px", marginBottom: 20
                  }}>
                    <p style={{ color: "#f87171", fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                      ⚠ {positionSignals.length} position{positionSignals.length > 1 ? "s" : ""} flagged for review
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {positionSignals.map(s => (
                        <p key={s.ticker} style={{ color: "#fca5a5", fontSize: 12 }}>
                          <strong>{s.ticker}</strong> — {s.reasons.join(" · ")}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                {portfolio.positions.length > 0 ? (
                  <div style={{ background: "#1a1a1a", borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #333" }}>
                          {["Ticker", "Shares", "Avg Cost", "Current", "Market Value", "P&L", "P&L %"].map(h => (
                            <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: "#666", fontSize: 12, fontWeight: 500 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {portfolio.positions.map(pos => {
                          const signal = positionSignals.find(s => s.ticker === pos.ticker)
                          return (
                            <tr key={pos.ticker} style={{ borderBottom: "1px solid #222" }}>
                              <td style={tdStyle}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <strong style={{ cursor: "pointer" }} onClick={() => openStockDetail(pos.ticker)}>{pos.ticker}</strong>
                                  {signal && (
                                    <span style={{
                                      padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600,
                                      background: signal.urgency === "high" ? "#450a0a" : "#422006",
                                      color: signal.urgency === "high" ? "#f87171" : "#facc15",
                                      cursor: "pointer"
                                    }}
                                    onClick={() => openStockDetail(pos.ticker)}
                                    >
                                      {signal.urgency === "high" ? "⚠ SELL" : "⚠ REVIEW"}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td style={tdStyle}>{pos.shares}</td>
                              <td style={tdStyle}>${pos.avg_cost}</td>
                              <td style={tdStyle}>${pos.current_price}</td>
                              <td style={tdStyle}>${pos.market_value.toLocaleString()}</td>
                              <td style={{ ...tdStyle, color: pos.pnl >= 0 ? "#4ade80" : "#f87171" }}>
                                {pos.pnl >= 0 ? "+" : ""}${pos.pnl.toFixed(2)}
                              </td>
                              <td style={{ ...tdStyle, color: pos.pnl_pct >= 0 ? "#4ade80" : "#f87171" }}>
                                {pos.pnl_pct.toFixed(2)}%
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={{ color: "#666", marginBottom: 24 }}>No open positions.</p>
                )}

                {portfolio.recent_trades.length > 0 && (
                  <div style={{ background: "#1a1a1a", borderRadius: 12, overflow: "hidden" }}>
                    <p style={{ padding: "16px", color: "#888", fontSize: 12, borderBottom: "1px solid #333" }}>RECENT TRADES</p>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #333" }}>
                          {["Time", "Ticker", "Action", "Shares", "Price", "Total"].map(h => (
                            <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: "#666", fontSize: 12, fontWeight: 500 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {portfolio.recent_trades.map(trade => (
                          <tr key={trade.id} style={{ borderBottom: "1px solid #222" }}>
                            <td style={tdStyle}>{new Date(trade.executed_at).toLocaleString()}</td>
                            <td style={tdStyle}><strong>{trade.ticker}</strong></td>
                            <td style={{ ...tdStyle, color: trade.action === "buy" ? "#4ade80" : "#f87171", textTransform: "uppercase" }}>{trade.action}</td>
                            <td style={tdStyle}>{trade.shares}</td>
                            <td style={tdStyle}>${trade.price}</td>
                            <td style={tdStyle}>${trade.total.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <button onClick={resetPortfolio} style={{ marginTop: 16, padding: "8px 16px", background: "transparent", border: "1px solid #333", borderRadius: 8, color: "#666", cursor: "pointer", fontSize: 13 }}>
                  Reset Portfolio
                </button>
            </div>
          )}
        </div>
      )}
    
    <StockDetailPanel
      stock={selectedStock}
      loading={detailLoading}
      onClose={() => setSelectedStock(null)}
      onTrade={async (ticker, action) => {
        try {
          await axios.post(`${API}/portfolio/trade`, {
            ticker,
            shares: 1,
            action
          })
          await fetchPortfolio()
          setSelectedStock(null)
        } catch (e) {
          alert(e.response?.data?.detail || "Trade failed")
        }
      }}
    />
    
    </div>
  )
}

function Card({ label, value, color }) {
  return (
    <div style={{ background: "#1a1a1a", borderRadius: 12, padding: "20px 24px", flex: 1, minWidth: 140 }}>
      <p style={{ color: "#666", fontSize: 12, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 600, color: color || "#f0f0f0" }}>{value}</p>
    </div>
  )
}

function TQIBadge({ score }) {
  const color = score >= 65 ? "#4ade80" : score >= 45 ? "#facc15" : "#f87171"
  const bg = score >= 65 ? "#14532d" : score >= 45 ? "#422006" : "#450a0a"
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{
        padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
        background: bg, color
      }}>
        {score}
      </span>
      <span style={{ fontSize: 11, color: "#666" }}>/100</span>
    </span>
  )
}

function SignalCard({ stock, rank }) {
  const isBuy = stock.signal === "buy"
  return (
    <div style={{
      background: "#1a1a1a", borderRadius: 12, padding: 20,
      borderLeft: `3px solid ${isBuy ? "#4ade80" : "#f87171"}`
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "#666", fontSize: 13 }}>#{rank}</span>
          <strong style={{ fontSize: 18 }}>{stock.ticker}</strong>
          <span style={{ color: "#888", fontSize: 14 }}>${stock.current_price}</span>
        </div>
        <TQIBadge score={stock.tqi} />
      </div>

      <div style={{ display: "flex", gap: 24, marginBottom: 12, flexWrap: "wrap" }}>
        {[
          { label: "RSI", value: stock.rsi, color: stock.rsi < 30 ? "#4ade80" : stock.rsi > 70 ? "#f87171" : "#ccc" },
          { label: "MC Profit", value: `${stock.prob_profit}%`, color: stock.prob_profit > 55 ? "#4ade80" : "#f87171" },
          { label: "Volatility", value: `${(stock.volatility * 100).toFixed(1)}%`, color: stock.volatility > 0.4 ? "#f87171" : "#ccc" },
          { label: "BB Position", value: `${(stock.bb_position * 100).toFixed(0)}%`, color: "#ccc" },
        ].map(m => (
          <div key={m.label}>
            <p style={{ color: "#666", fontSize: 11, marginBottom: 2 }}>{m.label}</p>
            <p style={{ color: m.color, fontSize: 14, fontWeight: 500 }}>{m.value}</p>
          </div>
        ))}
      </div>

      {stock.reasons.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: stock.warnings.length > 0 ? 6 : 0 }}>
          {stock.reasons.map(r => (
            <span key={r} style={{ padding: "2px 8px", borderRadius: 12, background: "#14532d", color: "#4ade80", fontSize: 11 }}>{r}</span>
          ))}
        </div>
      )}

      {stock.warnings.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {stock.warnings.map(w => (
            <span key={w} style={{ padding: "2px 8px", borderRadius: 12, background: "#450a0a", color: "#f87171", fontSize: 11 }}>{w}</span>
          ))}
        </div>
      )}
    </div>
  )
}

function StockDetailPanel({ stock, loading, onClose, onTrade }) {
  if (!loading && !stock) return null

  return (
    <>
      {/* backdrop */}
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
        zIndex: 100, transition: "opacity 0.3s"
      }} />

      {/* panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, width: "min(680px, 100vw)",
        height: "100vh", background: "#111", zIndex: 101,
        overflowY: "auto", padding: 32,
        boxShadow: "-8px 0 40px rgba(0,0,0,0.6)",
        animation: "slideIn 0.3s ease"
      }}>
        <style>{`
          @keyframes slideIn { from { transform: translateX(100%) } to { transform: translateX(0) } }
          @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        `}</style>
        {loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
            <p style={{ color: "#888" }}>Loading analysis...</p>
          </div>
        )}

        {stock && !loading && (
          <>
            {/* header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
                  <h2 style={{ fontSize: 28, fontWeight: 700 }}>{stock.ticker}</h2>
                  <TQIBadge score={stock.tqi} />
                  <span style={{
                    padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                    background: stock.signal === "buy" ? "#14532d" : stock.signal === "sell" ? "#450a0a" : "#1c1c1c",
                    color: stock.signal === "buy" ? "#4ade80" : stock.signal === "sell" ? "#f87171" : "#888"
                  }}>
                    {stock.signal.toUpperCase()}
                  </span>
                </div>
                <p style={{ fontSize: 24, fontWeight: 600, color: "#f0f0f0" }}>${stock.current_price}</p>
              </div>
              <button onClick={onClose} style={{ background: "none", border: "none", color: "#666", fontSize: 24, cursor: "pointer" }}>✕</button>
            </div>

            {/* quick trade */}
            <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
              <button onClick={() => onTrade(stock.ticker, "buy")} style={{
                flex: 1, padding: "10px", borderRadius: 8, border: "none",
                background: "#14532d", color: "#4ade80", fontSize: 14, fontWeight: 600, cursor: "pointer"
              }}>
                Buy 1 Share
              </button>
              <button onClick={() => onTrade(stock.ticker, "sell")} style={{
                flex: 1, padding: "10px", borderRadius: 8, border: "none",
                background: "#450a0a", color: "#f87171", fontSize: 14, fontWeight: 600, cursor: "pointer"
              }}>
                Sell 1 Share
              </button>
            </div>

            {/* key metrics */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 28 }}>
              {[
                { label: "RSI", value: stock.rsi, color: stock.rsi < 30 ? "#4ade80" : stock.rsi > 70 ? "#f87171" : "#f0f0f0" },
                { label: "MC Profit Prob", value: `${stock.prob_profit}%`, color: stock.prob_profit > 55 ? "#4ade80" : "#f87171" },
                { label: "Volatility", value: `${(stock.volatility * 100).toFixed(1)}%`, color: stock.volatility > 0.4 ? "#f87171" : "#f0f0f0" },
                { label: "MA20", value: `$${stock.ma20}`, color: "#f0f0f0" },
                { label: "MA50", value: `$${stock.ma50}`, color: "#f0f0f0" },
                { label: "BB Position", value: `${(stock.bb_position * 100).toFixed(0)}%`, color: "#f0f0f0" },
              ].map(m => (
                <div key={m.label} style={{ background: "#1a1a1a", borderRadius: 10, padding: "14px 16px" }}>
                  <p style={{ color: "#666", fontSize: 11, marginBottom: 4, textTransform: "uppercase" }}>{m.label}</p>
                  <p style={{ color: m.color, fontSize: 16, fontWeight: 600 }}>{m.value}</p>
                </div>
              ))}
            </div>

            {/* TQI breakdown */}
            <div style={{ background: "#1a1a1a", borderRadius: 12, padding: 20, marginBottom: 28 }}>
              <p style={{ color: "#888", fontSize: 12, marginBottom: 16, textTransform: "uppercase", letterSpacing: 1 }}>TQI Breakdown</p>
              {stock.breakdown.map(b => (
                <div key={b.component} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: "#ccc" }}>{b.component}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: b.contribution > 0 ? "#4ade80" : b.contribution < 0 ? "#f87171" : "#666" }}>
                      {b.contribution > 0 ? "+" : ""}{b.contribution} pts
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 4, background: "#333", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{
                        height: "100%", borderRadius: 2,
                        width: `${Math.abs(b.contribution) / 30 * 100}%`,
                        background: b.contribution > 0 ? "#4ade80" : b.contribution < 0 ? "#f87171" : "#333"
                      }} />
                    </div>
                    <span style={{ fontSize: 11, color: "#666", minWidth: 80, textAlign: "right" }}>{b.value}</span>
                  </div>
                </div>
              ))}
              <div style={{ borderTop: "1px solid #333", marginTop: 16, paddingTop: 12, display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#888", fontSize: 13 }}>Total TQI</span>
                <span style={{ fontWeight: 700, fontSize: 16 }}>{stock.tqi}/100</span>
              </div>
            </div>

            {/* Monte Carlo chart */}
            {stock.mc_chart && (
              <div style={{ background: "#1a1a1a", borderRadius: 12, padding: 20, marginBottom: 28 }}>
                <p style={{ color: "#888", fontSize: 12, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>60-Day Monte Carlo</p>
                <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
                  <div>
                    <p style={{ color: "#666", fontSize: 11 }}>Expected</p>
                    <p style={{ fontSize: 14, fontWeight: 600 }}>${stock.mc_metrics.expected_price}</p>
                  </div>
                  <div>
                    <p style={{ color: "#666", fontSize: 11 }}>VaR 95%</p>
                    <p style={{ fontSize: 14, fontWeight: 600, color: "#f87171" }}>${stock.mc_metrics.var_95}</p>
                  </div>
                  <div>
                    <p style={{ color: "#666", fontSize: 11 }}>Profit Prob</p>
                    <p style={{ fontSize: 14, fontWeight: 600, color: stock.mc_metrics.prob_profit > 50 ? "#4ade80" : "#f87171" }}>
                      {stock.mc_metrics.prob_profit}%
                    </p>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={stock.mc_chart}>
                    <defs>
                      <linearGradient id="dp90" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.08} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="dp50" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="day" tick={{ fill: "#666", fontSize: 10 }} tickLine={false} interval="preserveStartEnd" tickFormatter={v => `D${v}`} />
                    <YAxis domain={["auto", "auto"]} tick={{ fill: "#666", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
                    <Tooltip contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: 8 }}
                      labelStyle={{ color: "#aaa" }} formatter={(v) => [`$${v}`]} />
                    <Area type="monotone" dataKey="p90" stroke="#6366f1" strokeWidth={1} strokeOpacity={0.4} fill="url(#dp90)" dot={false} />
                    <Area type="monotone" dataKey="p75" stroke="#6366f1" strokeWidth={1} strokeOpacity={0.6} fill="url(#dp50)" dot={false} />
                    <Area type="monotone" dataKey="p50" stroke="#a5b4fc" strokeWidth={2} fill="none" dot={false} />
                    <Area type="monotone" dataKey="p25" stroke="#6366f1" strokeWidth={1} strokeOpacity={0.6} fill="#111" dot={false} />
                    <Area type="monotone" dataKey="p10" stroke="#6366f1" strokeWidth={1} strokeOpacity={0.4} fill="#111" dot={false} />
                    <ReferenceLine y={stock.current_price} stroke="#444" strokeDasharray="4 4" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* signal tags */}
            <div style={{ marginBottom: 12 }}>
              {stock.reasons.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  {stock.reasons.map(r => (
                    <span key={r} style={{ padding: "4px 10px", borderRadius: 12, background: "#14532d", color: "#4ade80", fontSize: 12 }}>{r}</span>
                  ))}
                </div>
              )}
              {stock.warnings.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {stock.warnings.map(w => (
                    <span key={w} style={{ padding: "4px 10px", borderRadius: 12, background: "#450a0a", color: "#f87171", fontSize: 12 }}>{w}</span>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}

const inputStyle = { padding: "10px 16px", borderRadius: 8, border: "1px solid #333", background: "#1a1a1a", color: "#f0f0f0", fontSize: 16 }
const btnStyle = (disabled) => ({ padding: "10px 24px", borderRadius: 8, background: "#6366f1", color: "#fff", border: "none", fontSize: 16, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.7 : 1 })
const tdStyle = { padding: "12px 16px", fontSize: 14, color: "#ccc" }
const labelStyle = { color: "#888", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }