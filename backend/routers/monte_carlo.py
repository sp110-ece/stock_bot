from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import yfinance as yf
import numpy as np
import pandas as pd

router = APIRouter()

class MonteCarloRequest(BaseModel):
    ticker: str
    days: int = 252
    simulations: int = 1000
    period: str = "2y"

@router.post("/")
def run_monte_carlo(req: MonteCarloRequest):
    # fetch historical data
    df = yf.download(req.ticker, period=req.period, auto_adjust=True, progress=False)
    if df.empty:
        raise HTTPException(status_code=400, detail=f"No data for {req.ticker}")
    
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    
    close = df["Close"].dropna()
    current_price = float(close.iloc[-1])
    
    # calculate daily returns statistics
    daily_returns = close.pct_change().dropna()
    mu = float(daily_returns.mean())        # average daily return (drift)
    sigma = float(daily_returns.std())      # daily volatility

    # run simulations
    np.random.seed(42)
    simulations = np.zeros((req.simulations, req.days))
    
    for i in range(req.simulations):
        prices = [current_price]
        for _ in range(req.days - 1):
            shock = np.random.normal(mu, sigma)
            prices.append(prices[-1] * (1 + shock))
        simulations[i] = prices

    # compute percentile bands across all simulations at each day
    p10 = np.percentile(simulations, 10, axis=0)
    p25 = np.percentile(simulations, 25, axis=0)
    p50 = np.percentile(simulations, 50, axis=0)
    p75 = np.percentile(simulations, 75, axis=0)
    p90 = np.percentile(simulations, 90, axis=0)

    # final price distribution
    final_prices = simulations[:, -1]

    # risk metrics
    var_95 = float(np.percentile(final_prices, 5))   # value at risk (5th percentile)
    var_99 = float(np.percentile(final_prices, 1))   # value at risk (1st percentile)
    expected = float(np.mean(final_prices))
    prob_profit = float(np.mean(final_prices > current_price) * 100)
    prob_loss_20 = float(np.mean(final_prices < current_price * 0.8) * 100)

    # sample 50 paths for the chart (sending 1000 would be too much data)
    sample_indices = np.random.choice(req.simulations, 50, replace=False)
    sample_paths = simulations[sample_indices].tolist()

    # build chart data — one point per day with all percentile bands
    chart_data = []
    for day in range(req.days):
        chart_data.append({
            "day": day,
            "p10": round(float(p10[day]), 2),
            "p25": round(float(p25[day]), 2),
            "p50": round(float(p50[day]), 2),
            "p75": round(float(p75[day]), 2),
            "p90": round(float(p90[day]), 2),
        })

    # histogram of final prices (20 buckets)
    hist, edges = np.histogram(final_prices, bins=20)
    histogram = [
        {
            "price": round(float(edges[i]), 2),
            "count": int(hist[i])
        }
        for i in range(len(hist))
    ]

    return {
        "ticker": req.ticker.upper(),
        "current_price": round(current_price, 2),
        "days": req.days,
        "simulations": req.simulations,
        "mu": round(mu, 6),
        "sigma": round(sigma, 6),
        "metrics": {
            "expected_price": round(expected, 2),
            "median_price": round(float(p50[-1]), 2),
            "var_95": round(var_95, 2),
            "var_99": round(var_99, 2),
            "prob_profit": round(prob_profit, 1),
            "prob_loss_20pct": round(prob_loss_20, 1),
        },
        "chart_data": chart_data,
        "sample_paths": [[round(p, 2) for p in path] for path in sample_paths],
        "histogram": histogram,
    }