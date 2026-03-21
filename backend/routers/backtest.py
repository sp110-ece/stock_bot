from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import yfinance as yf
import pandas as pd
import numpy as np

router = APIRouter()

class BacktestRequest(BaseModel):
    ticker: str
    strategy: str
    period: str = "2y"
    initial_cash: float = 10000.0
    params: dict = {}

def fetch_data(ticker: str, period: str) -> pd.DataFrame:
    df = yf.download(ticker, period=period, auto_adjust=True, progress=False)
    if df.empty:
        raise HTTPException(status_code=400, detail=f"No data for {ticker}")
    # flatten MultiIndex columns
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    df = df[["Close", "High", "Low", "Volume"]].dropna()
    return df

def compute_signals(df: pd.DataFrame, strategy: str, params: dict) -> pd.DataFrame:
    df = df.copy()
    df["signal"] = 0  # 0 = hold, 1 = buy, -1 = sell

    if strategy == "ma_crossover":
        short = params.get("short_window", 20)
        long_ = params.get("long_window", 50)
        df["ma_short"] = df["Close"].rolling(short).mean()
        df["ma_long"] = df["Close"].rolling(long_).mean()
        df["signal"] = np.where(df["ma_short"] > df["ma_long"], 1, -1)
        df["signal"] = np.where(df["signal"].diff() != 0, df["signal"], 0)

    elif strategy == "rsi":
        period = params.get("period", 14)
        overbought = params.get("overbought", 70)
        oversold = params.get("oversold", 30)
        delta = df["Close"].diff()
        gain = delta.clip(lower=0).rolling(period).mean()
        loss = (-delta.clip(upper=0)).rolling(period).mean()
        rs = gain / loss
        df["rsi"] = 100 - (100 / (1 + rs))
        df["signal"] = np.where(df["rsi"] < oversold, 1, np.where(df["rsi"] > overbought, -1, 0))

    elif strategy == "bollinger":
        period = params.get("period", 20)
        std_dev = params.get("std_dev", 2)
        df["ma"] = df["Close"].rolling(period).mean()
        df["std"] = df["Close"].rolling(period).std()
        df["upper"] = df["ma"] + std_dev * df["std"]
        df["lower"] = df["ma"] - std_dev * df["std"]
        df["signal"] = np.where(df["Close"] < df["lower"], 1, np.where(df["Close"] > df["upper"], -1, 0))

    elif strategy == "macd":
        fast = params.get("fast", 12)
        slow = params.get("slow", 26)
        signal_period = params.get("signal", 9)
        df["ema_fast"] = df["Close"].ewm(span=fast).mean()
        df["ema_slow"] = df["Close"].ewm(span=slow).mean()
        df["macd"] = df["ema_fast"] - df["ema_slow"]
        df["macd_signal"] = df["macd"].ewm(span=signal_period).mean()
        df["signal"] = np.where(df["macd"] > df["macd_signal"], 1, -1)
        df["signal"] = np.where(df["signal"].diff() != 0, df["signal"], 0)

    elif strategy == "buy_and_hold":
        df.iloc[0, df.columns.get_loc("signal")] = 1

    return df

def run_backtest(df: pd.DataFrame, initial_cash: float):
    cash = initial_cash
    shares = 0
    portfolio_values = []
    trades = []

    for i, (date, row) in enumerate(df.iterrows()):
        price = float(row["Close"])
        signal = int(row["signal"])

        if signal == 1 and cash > price:
            shares_to_buy = int(cash // price)
            if shares_to_buy > 0:
                cost = shares_to_buy * price
                shares += shares_to_buy
                cash -= cost
                trades.append({"date": str(date.date()), "action": "buy", "price": round(price, 2), "shares": shares_to_buy})

        elif signal == -1 and shares > 0:
            proceeds = shares * price
            trades.append({"date": str(date.date()), "action": "sell", "price": round(price, 2), "shares": shares})
            cash += proceeds
            shares = 0

        portfolio_values.append({
            "date": str(date.date()),
            "value": round(cash + shares * price, 2),
            "price": round(price, 2)
        })

    final_value = cash + shares * float(df["Close"].iloc[-1])
    total_return = ((final_value - initial_cash) / initial_cash) * 100

    # buy and hold benchmark
    bh_shares = int(initial_cash // float(df["Close"].iloc[0]))
    bh_value = bh_shares * float(df["Close"].iloc[-1]) + (initial_cash - bh_shares * float(df["Close"].iloc[0]))
    bh_return = ((bh_value - initial_cash) / initial_cash) * 100

    # sharpe ratio (annualized)
    values = pd.Series([p["value"] for p in portfolio_values])
    daily_returns = values.pct_change().dropna()
    sharpe = (daily_returns.mean() / daily_returns.std() * np.sqrt(252)) if daily_returns.std() > 0 else 0

    # max drawdown
    rolling_max = values.cummax()
    drawdown = ((values - rolling_max) / rolling_max)
    max_drawdown = float(drawdown.min() * 100)

    return {
        "final_value": round(final_value, 2),
        "total_return": round(total_return, 2),
        "bh_return": round(bh_return, 2),
        "sharpe": round(float(sharpe), 3),
        "max_drawdown": round(max_drawdown, 2),
        "num_trades": len(trades),
        "portfolio_values": portfolio_values,
        "trades": trades[-20:],
    }

@router.post("/")
def backtest(req: BacktestRequest):
    df = fetch_data(req.ticker, req.period)
    df = compute_signals(df, req.strategy, req.params)
    results = run_backtest(df, req.initial_cash)
    return {"ticker": req.ticker.upper(), "strategy": req.strategy, **results}