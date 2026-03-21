import yfinance as yf
import pandas as pd
from prophet import Prophet

def fetch_stock_data(ticker: str, period: str = "2y") -> pd.DataFrame:
    df = yf.download(ticker, period=period, auto_adjust=True)
    df = df[["Close"]].reset_index()
    df.columns = ["ds", "y"]
    df["ds"] = pd.to_datetime(df["ds"]).dt.tz_localize(None)
    return df

def predict(ticker: str, horizon: int = 30):
    df = fetch_stock_data(ticker)
    
    model = Prophet(
        daily_seasonality=False,
        weekly_seasonality=True,
        yearly_seasonality=True,
        interval_width=0.8
    )
    model.fit(df)
    
    future = model.make_future_dataframe(periods=horizon, freq="B")  # B = business days
    forecast = model.predict(future)
    
    # last known price
    last_price = float(df["y"].iloc[-1])
    
    # slice just the forecast window
    future_forecast = forecast[forecast["ds"] > df["ds"].max()][
        ["ds", "yhat", "yhat_lower", "yhat_upper"]
    ]
    
    predicted_price = float(future_forecast["yhat"].iloc[-1])
    signal = "bullish" if predicted_price > last_price else "bearish"
    confidence = min(100, max(0, round(
        100 * (1 - future_forecast["yhat_std"].std() / last_price)
        if "yhat_std" in future_forecast else 75
    , 1)))

    return {
        "ticker": ticker.upper(),
        "horizon_days": horizon,
        "last_price": round(last_price, 2),
        "predicted_price": round(predicted_price, 2),
        "signal": signal,
        "confidence": confidence,
        "forecast": [
            {
                "date": row["ds"].strftime("%Y-%m-%d"),
                "predicted": round(row["yhat"], 2),
                "lower": round(row["yhat_lower"], 2),
                "upper": round(row["yhat_upper"], 2),
            }
            for _, row in future_forecast.iterrows()
        ]
    }