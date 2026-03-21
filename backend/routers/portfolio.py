from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import yfinance as yf
from database import get_db, init_db
from datetime import datetime, timedelta
import numpy as np
import pandas as pd 

router = APIRouter()
init_db()

class TradeRequest(BaseModel):
    ticker: str
    shares: float
    action: str  # "buy" or "sell"

def get_current_price(ticker: str) -> float:
    t = yf.Ticker(ticker)
    hist = t.history(period="5d")
    if hist.empty:
        raise HTTPException(status_code=400, detail=f"Could not fetch price for {ticker}")
    return float(hist["Close"].dropna().iloc[-1])

@router.get("/")
def get_portfolio():
    conn = get_db()
    portfolio = conn.execute("SELECT * FROM portfolio WHERE id = 1").fetchone()
    positions = conn.execute("SELECT * FROM positions").fetchall()
    trades = conn.execute("SELECT * FROM trades ORDER BY executed_at DESC LIMIT 20").fetchall()
    conn.close()

    cash = portfolio["cash"]
    positions_list = []
    total_value = cash

    for pos in positions:
        ticker = pos["ticker"]
        try:
            t = yf.Ticker(ticker)
            hist = t.history(period="5d")
            current_price = float(hist["Close"].dropna().iloc[-1])
        except:
            current_price = pos["avg_cost"]

        market_value = pos["shares"] * current_price
        pnl = market_value - (pos["shares"] * pos["avg_cost"])
        pnl_pct = (pnl / (pos["shares"] * pos["avg_cost"])) * 100
        total_value += market_value

        positions_list.append({
            "ticker": pos["ticker"],
            "shares": pos["shares"],
            "avg_cost": round(pos["avg_cost"], 2),
            "current_price": round(current_price, 2),
            "market_value": round(market_value, 2),
            "pnl": round(pnl, 2),
            "pnl_pct": round(pnl_pct, 2),
        })

    return {
        "cash": round(cash, 2),
        "total_value": round(total_value, 2),
        "total_pnl": round(total_value - 10000, 2),
        "total_pnl_pct": round(((total_value - 10000) / 10000) * 100, 2),
        "positions": positions_list,
        "recent_trades": [dict(t) for t in trades],
    }

@router.post("/trade")
def execute_trade(req: TradeRequest):
    conn = get_db()
    portfolio = conn.execute("SELECT * FROM portfolio WHERE id = 1").fetchone()
    cash = portfolio["cash"]
    price = get_current_price(req.ticker)
    total = price * req.shares

    if req.action == "buy":
        if total > cash:
            raise HTTPException(status_code=400, detail=f"Insufficient funds. Need ${total:.2f}, have ${cash:.2f}")
        
        existing = conn.execute("SELECT * FROM positions WHERE ticker = ?", (req.ticker,)).fetchone()
        if existing:
            new_shares = existing["shares"] + req.shares
            new_avg = ((existing["shares"] * existing["avg_cost"]) + total) / new_shares
            conn.execute("UPDATE positions SET shares = ?, avg_cost = ? WHERE ticker = ?",
                        (new_shares, new_avg, req.ticker))
        else:
            conn.execute("INSERT INTO positions (ticker, shares, avg_cost) VALUES (?, ?, ?)",
                        (req.ticker, req.shares, price))
        
        conn.execute("UPDATE portfolio SET cash = ? WHERE id = 1", (cash - total,))

    elif req.action == "sell":
        existing = conn.execute("SELECT * FROM positions WHERE ticker = ?", (req.ticker,)).fetchone()
        if not existing or existing["shares"] < req.shares:
            raise HTTPException(status_code=400, detail="Not enough shares to sell")
        
        new_shares = existing["shares"] - req.shares
        if new_shares == 0:
            conn.execute("DELETE FROM positions WHERE ticker = ?", (req.ticker,))
        else:
            conn.execute("UPDATE positions SET shares = ? WHERE ticker = ?", (new_shares, req.ticker))
        
        conn.execute("UPDATE portfolio SET cash = ? WHERE id = 1", (cash + total,))

    conn.execute("INSERT INTO trades (ticker, action, shares, price, total) VALUES (?, ?, ?, ?, ?)",
                (req.ticker, req.action, req.shares, price, total))
    conn.commit()
    conn.close()

    return {"status": "ok", "action": req.action, "ticker": req.ticker, "shares": req.shares, "price": round(price, 2), "total": round(total, 2)}

@router.post("/reset")
def reset_portfolio():
    conn = get_db()
    conn.executescript("""
        DELETE FROM positions;
        DELETE FROM trades;
        UPDATE portfolio SET cash = 10000.0 WHERE id = 1;
    """)
    conn.commit()
    conn.close()
    return {"status": "reset", "cash": 10000.0}



@router.get("/signals")
def get_position_signals():
    conn = get_db()
    positions = conn.execute("SELECT * FROM positions").fetchall()
    conn.close()

    if not positions:
        return {"signals": []}

    signals = []
    for pos in positions:
        ticker = pos["ticker"]
        try:
            t = yf.Ticker(ticker)
            hist = t.history(period="1y")
            
            if hist.empty or len(hist) < 60:
                continue

            close = hist["Close"]
            current_price = float(close.dropna().iloc[-1])

            delta = close.diff()
            gain = delta.clip(lower=0).rolling(14).mean()
            loss = (-delta.clip(upper=0)).rolling(14).mean()
            rs = gain / loss
            rsi = float((100 - (100 / (1 + rs))).iloc[-1])

            ma20 = float(close.rolling(20).mean().iloc[-1])
            ma50 = float(close.rolling(50).mean().iloc[-1])
            ma_diff_pct = (ma20 - ma50) / ma50 * 100

            ema12 = close.ewm(span=12).mean()
            ema26 = close.ewm(span=26).mean()
            macd_line = ema12 - ema26
            signal_line = macd_line.ewm(span=9).mean()
            macd_val = float(macd_line.iloc[-1])
            signal_val = float(signal_line.iloc[-1])
            macd_prev = float(macd_line.iloc[-2])
            signal_prev = float(signal_line.iloc[-2])
            macd_bearish = macd_val < signal_val and macd_prev >= signal_prev

            ma20_bb = close.rolling(20).mean()
            std20 = close.rolling(20).std()
            upper = float((ma20_bb + 2 * std20).iloc[-1])
            lower_bb = float((ma20_bb - 2 * std20).iloc[-1])
            bb_position = (current_price - lower_bb) / (upper - lower_bb) if upper != lower_bb else 0.5

            daily_returns = close.pct_change().dropna()
            mu = float(daily_returns.mean())
            sigma = float(daily_returns.std())
            seed = sum(ord(c) for c in ticker)
            rng = np.random.default_rng(seed=seed)
            shocks = rng.normal(mu, sigma, size=(1000, 30))
            paths = current_price * np.cumprod(1 + shocks, axis=1)
            prob_profit = float(np.mean(paths[:, -1] > current_price) * 100)

            sell_score = 0
            sell_reasons = []

            if rsi > 70:
                sell_score += 30
                sell_reasons.append(f"RSI overbought ({round(rsi, 1)})")
            elif rsi > 60:
                sell_score += 15
                sell_reasons.append(f"RSI elevated ({round(rsi, 1)})")

            if ma_diff_pct < -3:
                sell_score += 25
                sell_reasons.append("MA20 well below MA50")
            elif ma_diff_pct < 0:
                sell_score += 10
                sell_reasons.append("MA20 below MA50")

            if macd_bearish:
                sell_score += 20
                sell_reasons.append("MACD bearish crossover")

            if bb_position > 0.85:
                sell_score += 15
                sell_reasons.append("Price near upper Bollinger Band")

            if prob_profit < 40:
                sell_score += 10
                sell_reasons.append(f"Only {round(prob_profit, 1)}% MC profit probability")

            avg_cost = pos["avg_cost"]
            pnl_pct = (current_price - avg_cost) / avg_cost * 100

            if sell_score >= 40:
                signals.append({
                    "ticker": ticker,
                    "sell_score": sell_score,
                    "current_price": round(current_price, 2),
                    "avg_cost": round(avg_cost, 2),
                    "pnl_pct": round(pnl_pct, 2),
                    "reasons": sell_reasons,
                    "urgency": "high" if sell_score >= 65 else "medium"
                })

        except Exception as e:
            print(f"Signal error {ticker}: {e}")

    signals.sort(key=lambda x: x["sell_score"], reverse=True)
    return {"signals": signals}