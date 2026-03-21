from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import yfinance as yf
import numpy as np
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta

router = APIRouter()

DEFAULT_WATCHLIST = [
    # Mega cap tech
    "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "AVGO",
    # Financials
    "JPM", "V", "MA", "BAC", "WFC", "GS", "MS", "BLK", "SCHW", "AXP",
    # Healthcare
    "UNH", "JNJ", "LLY", "ABBV", "MRK", "TMO", "ABT", "DHR", "BMY", "AMGN",
    # Consumer
    "WMT", "PG", "KO", "PEP", "COST", "MCD", "PM", "MO", "CL", "EL",
    # Energy
    "XOM", "CVX", "COP", "EOG", "SLB", "MPC", "PSX", "VLO", "OXY", "HAL",
    # Industrials
    "CAT", "HON", "UPS", "BA", "GE", "MMM", "RTX", "LMT", "NOC", "DE",
    # Tech
    "AMD", "INTC", "QCOM", "TXN", "AMAT", "LRCX", "KLAC", "MU", "NFLX", "CRM", "NET",
    # Utilities / Real Estate
    "NEE", "DUK", "SO", "D", "AMT", "PLD", "CCI", "EQIX", "PSA", "SPG",
    # Materials / Other
    "LIN", "APD", "ECL", "SHW", "FCX", "NEM", "ACN", "IBM", "NOW", "ADBE",
    # More large cap
    "TMO", "ISRG", "VRTX", "REGN", "ZTS", "MDLZ", "EW", "HCA", "CI", "CVS"
]

_cache = {}
_cache_time = {}
CACHE_TTL_MINUTES = 15

class ScannerRequest(BaseModel):
    tickers: list[str] = DEFAULT_WATCHLIST
    period: str = "1y"

def get_cached(ticker: str) -> dict | None:
    if ticker in _cache:
        age = datetime.now() - _cache_time[ticker]
        if age < timedelta(minutes=CACHE_TTL_MINUTES):
            return _cache[ticker]
    return None

def set_cached(ticker: str, data: dict):
    _cache[ticker] = data
    _cache_time[ticker] = datetime.now()

def fetch_and_flatten(ticker: str, period: str) -> pd.DataFrame | None:
    try:
        end = datetime.today().date()
        days = 365 if period == "1y" else 730
        start = end - timedelta(days=days)
        df = yf.download(ticker, start=start, end=end, auto_adjust=True, progress=False)
        if df.empty or len(df) < 60:
            return None
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        return df[["Close", "High", "Low", "Volume"]].dropna()
    except:
        return None

def compute_indicators(df: pd.DataFrame, ticker: str) -> dict:
    close = df["Close"]
    current_price = float(close.iloc[-1])

    # RSI
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean()
    rs = gain / loss
    rsi = float((100 - (100 / (1 + rs))).iloc[-1])

    # MA crossover
    ma20 = float(close.rolling(20).mean().iloc[-1])
    ma50 = float(close.rolling(50).mean().iloc[-1])
    ma20_prev = float(close.rolling(20).mean().iloc[-2])
    ma50_prev = float(close.rolling(50).mean().iloc[-2])
    golden_cross = ma20_prev < ma50_prev and ma20 > ma50
    death_cross = ma20_prev > ma50_prev and ma20 < ma50
    ma_diff_pct = (ma20 - ma50) / ma50 * 100  # continuous: how far apart the MAs are

    # MACD
    ema12 = close.ewm(span=12).mean()
    ema26 = close.ewm(span=26).mean()
    macd_line = ema12 - ema26
    signal_line = macd_line.ewm(span=9).mean()
    macd_val = float(macd_line.iloc[-1])
    signal_val = float(signal_line.iloc[-1])
    macd_prev = float(macd_line.iloc[-2])
    signal_prev = float(signal_line.iloc[-2])
    macd_bullish = macd_val > signal_val and macd_prev <= signal_prev
    macd_bearish = macd_val < signal_val and macd_prev >= signal_prev
    macd_diff_pct = (macd_val - signal_val) / abs(signal_val) * 100 if signal_val != 0 else 0

    # Bollinger Bands
    ma20_bb = close.rolling(20).mean()
    std20 = close.rolling(20).std()
    upper = float((ma20_bb + 2 * std20).iloc[-1])
    lower = float((ma20_bb - 2 * std20).iloc[-1])
    bb_position = (current_price - lower) / (upper - lower) if upper != lower else 0.5

    # Momentum: % change over last 20 days
    momentum_20 = float((close.iloc[-1] - close.iloc[-20]) / close.iloc[-20] * 100)

    # Volatility regime
    daily_returns = close.pct_change().dropna()
    sigma_30 = float(daily_returns.tail(30).std() * np.sqrt(252))
    sigma_full = float(daily_returns.std() * np.sqrt(252))
    volatility_ratio = sigma_30 / sigma_full if sigma_full > 0 else 1.0

    # Monte Carlo — deterministic seed per ticker, 1000 sims
    mu = float(daily_returns.mean())
    sigma = float(daily_returns.std())
    seed = sum(ord(c) for c in ticker)
    rng = np.random.default_rng(seed=seed)
    sims = 1000
    # vectorized — no loop needed
    shocks = rng.normal(mu, sigma, size=(sims, 30))
    paths = current_price * np.cumprod(1 + shocks, axis=1)
    final_prices = paths[:, -1]
    prob_profit = float(np.mean(final_prices > current_price) * 100)

    return {
        "rsi": round(rsi, 2),
        "ma20": round(ma20, 2),
        "ma50": round(ma50, 2),
        "ma_diff_pct": round(ma_diff_pct, 3),
        "golden_cross": golden_cross,
        "death_cross": death_cross,
        "macd_bullish": macd_bullish,
        "macd_bearish": macd_bearish,
        "macd_diff_pct": round(macd_diff_pct, 3),
        "bb_position": round(bb_position, 4),
        "momentum_20": round(momentum_20, 3),
        "volatility_ratio": round(volatility_ratio, 3),
        "sigma_annualized": round(sigma_30, 4),
        "prob_profit": round(prob_profit, 2),
        "current_price": round(current_price, 2),
    }

def compute_tqi(indicators: dict) -> tuple[float, list[str], list[str], list[dict]]:
    score = 0.0
    reasons = []
    warnings = []
    breakdown = []

    # RSI — continuous -25 to +25
    rsi = indicators["rsi"]
    rsi_score = round(25 * (50 - rsi) / 50, 2)
    rsi_score = round(np.clip(rsi_score, -25, 25), 2)
    score += rsi_score
    if rsi < 30:
        reasons.append(f"RSI oversold ({rsi})")
    elif rsi > 70:
        warnings.append(f"RSI overbought ({rsi})")
    breakdown.append({"component": "RSI", "contribution": rsi_score, "max": 25, "value": str(rsi)})

    # MA — continuous, no hard cap, small multiplier
    ma_diff = indicators["ma_diff_pct"]
    ma_score = round(ma_diff * 1.5, 2)
    score += ma_score
    if indicators["golden_cross"]:
        reasons.append("Golden cross just fired")
    elif indicators["death_cross"]:
        warnings.append("Death cross just fired")
    elif ma_diff > 0:
        reasons.append(f"MA20 above MA50 by {abs(round(ma_diff, 2))}%")
    else:
        warnings.append(f"MA20 below MA50 by {abs(round(ma_diff, 2))}%")
    breakdown.append({"component": "MA Crossover", "contribution": ma_score, "max": 20, "value": f"MA20 {'+' if ma_diff >= 0 else ''}{round(ma_diff, 2)}% vs MA50"})

    # MACD — continuous, no hard cap
    macd_diff = indicators["macd_diff_pct"]
    macd_score = round(macd_diff * 0.25, 2)
    score += macd_score
    if indicators["macd_bullish"]:
        reasons.append("MACD bullish crossover")
    elif indicators["macd_bearish"]:
        warnings.append("MACD bearish crossover")
    breakdown.append({"component": "MACD", "contribution": macd_score, "max": 10, "value": "bullish" if indicators["macd_bullish"] else "bearish" if indicators["macd_bearish"] else "neutral"})

    # Bollinger — continuous -15 to +15
    bb = indicators["bb_position"]
    bb_score = round(np.clip(15 * (0.5 - bb), -15, 15), 2)
    score += bb_score
    if bb < 0.2:
        reasons.append(f"Price near lower Bollinger Band ({round(bb * 100)}%)")
    elif bb > 0.8:
        warnings.append(f"Price near upper Bollinger Band ({round(bb * 100)}%)")
    breakdown.append({"component": "Bollinger", "contribution": bb_score, "max": 15, "value": f"{round(bb * 100)}% of band"})

    # Monte Carlo — continuous -15 to +15
    prob = indicators["prob_profit"]
    mc_score = round(np.clip((prob - 50) * 0.6, -15, 15), 2)
    score += mc_score
    if prob > 60:
        reasons.append(f"{prob}% MC profit probability")
    elif prob < 40:
        warnings.append(f"Only {prob}% MC profit probability")
    breakdown.append({"component": "Monte Carlo", "contribution": mc_score, "max": 15, "value": f"{prob}%"})

    # Momentum — continuous -5 to +5
    mom = indicators["momentum_20"]
    mom_score = round(np.clip(mom * 0.25, -5, 5), 2)
    score += mom_score
    if mom > 5:
        reasons.append(f"+{round(mom, 1)}% momentum over 20 days")
    elif mom < -5:
        warnings.append(f"{round(mom, 1)}% momentum over 20 days")
    breakdown.append({"component": "Momentum", "contribution": mom_score, "max": 5, "value": f"{round(mom, 2)}% / 20d"})

    # Volatility penalty
    vol_ratio = indicators["volatility_ratio"]
    vol_penalty = round(-10 * min(max(vol_ratio - 1.0, 0) / 0.5, 1.0), 2) if vol_ratio > 1.0 else 0.0
    score += vol_penalty
    if vol_penalty < -5:
        warnings.append(f"Elevated volatility ({round(vol_ratio, 2)}x normal)")
    breakdown.append({"component": "Volatility", "contribution": vol_penalty, "max": 0, "value": f"{round(vol_ratio, 2)}x normal"})

    # print(f"Raw score breakdown: RSI={rsi_score} MA={ma_score} MACD={macd_score} BB={bb_score} MC={mc_score} Mom={mom_score} Vol={vol_penalty} Total={score}")

    return score, reasons, warnings, breakdown

def analyze_ticker(ticker: str, period: str, df=None) -> dict | None:
    cached = get_cached(ticker)
    if cached:
        return cached
    try:
        if df is None:
            df = fetch_and_flatten(ticker, period)
        if df is None:
            return None
        indicators = compute_indicators(df, ticker)
        raw_score, reasons, warnings, breakdown = compute_tqi(indicators)
        tqi = round(np.clip(50 + (raw_score * 1.25), 0, 100), 1)
        result = {
            "ticker": ticker,
            "tqi": tqi,
            "raw_score": raw_score,
            "signal": "buy" if tqi >= 60 else "hold",
            "current_price": indicators["current_price"],
            "rsi": indicators["rsi"],
            "ma20": indicators["ma20"],
            "ma50": indicators["ma50"],
            "golden_cross": indicators["golden_cross"],
            "death_cross": indicators["death_cross"],
            "macd_bullish": indicators["macd_bullish"],
            "macd_bearish": indicators["macd_bearish"],
            "bb_position": indicators["bb_position"],
            "prob_profit": indicators["prob_profit"],
            "momentum_20": indicators["momentum_20"],
            "volatility": indicators["sigma_annualized"],
            "volatility_ratio": indicators["volatility_ratio"],
            "reasons": reasons,
            "warnings": warnings,
            "breakdown": breakdown,
        }
        set_cached(ticker, result)
        return result
    except Exception as e:
        # print(f"analyze_ticker error {ticker}: {e}")
        return None

def fetch_all_tickers(tickers: list[str], period: str) -> dict:
    end = datetime.today().date()
    days = 365 if period == "1y" else 730
    start = end - timedelta(days=days)

    df = yf.download(
        tickers,
        start=start,
        end=end,
        auto_adjust=True,
        progress=False,
        group_by="ticker"
    )

    result = {}
    for ticker in tickers:
        try:
            if len(tickers) == 1:
                ticker_df = df
            else:
                ticker_df = df[ticker].copy()
            
            ticker_df = ticker_df.dropna()
            if len(ticker_df) >= 60:
                result[ticker] = ticker_df
        except Exception as e:
            # print(f"Error extracting {ticker}: {e}")
            pass

    return result

@router.post("/")
def run_scanner(req: ScannerRequest):
    all_data = fetch_all_tickers(req.tickers, req.period)
    
    results = []
    for ticker in req.tickers:
        result = analyze_ticker(ticker, req.period, df=all_data.get(ticker))
        if result:
            results.append(result)

    results.sort(key=lambda x: x["tqi"], reverse=True)

    return {
    "total_scanned": len(results),
    "top_buys": [r for r in results if r["signal"] == "buy"][:10],
    "all_results": results,
    "cached": False,
    "last_updated": datetime.now().strftime("%I:%M %p")
}

@router.get("/{ticker}")
def get_stock_detail(ticker: str, period: str = "1y"):
    result = analyze_ticker(ticker.upper(), period)
    if not result:
        raise HTTPException(status_code=400, detail=f"Could not analyze {ticker}")

    df = fetch_and_flatten(ticker.upper(), period)
    if df is None:
        raise HTTPException(status_code=400, detail=f"Could not fetch data for {ticker}")

    close = df["Close"].dropna()
    current_price = float(close.iloc[-1])
    daily_returns = close.pct_change().dropna()
    mu = float(daily_returns.mean())
    sigma = float(daily_returns.std())

    seed = sum(ord(c) for c in ticker.upper())
    rng = np.random.default_rng(seed=seed)
    sims = 1000
    days = 60
    shocks = rng.normal(mu, sigma, size=(sims, days))
    paths = current_price * np.cumprod(1 + shocks, axis=1)

    p10 = np.percentile(paths, 10, axis=0)
    p25 = np.percentile(paths, 25, axis=0)
    p50 = np.percentile(paths, 50, axis=0)
    p75 = np.percentile(paths, 75, axis=0)
    p90 = np.percentile(paths, 90, axis=0)

    chart_data = [
        {
            "day": d,
            "p10": round(float(p10[d]), 2),
            "p25": round(float(p25[d]), 2),
            "p50": round(float(p50[d]), 2),
            "p75": round(float(p75[d]), 2),
            "p90": round(float(p90[d]), 2),
        }
        for d in range(days)
    ]

    final_prices = paths[:, -1]
    result["mc_chart"] = chart_data
    result["mc_metrics"] = {
        "expected_price": round(float(np.mean(final_prices)), 2),
        "var_95": round(float(np.percentile(final_prices, 5)), 2),
        "prob_profit": round(float(np.mean(final_prices > current_price) * 100), 1),
    }

    return result


@router.post("/clear-cache")
def clear_cache():
    _cache.clear()
    _cache_time.clear()
    return {"status": "cache cleared"}