from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import predict, portfolio, backtest, monte_carlo, scanner

app = FastAPI(title="Stock Predictor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(predict.router, prefix="/predict")
app.include_router(portfolio.router, prefix="/portfolio")
app.include_router(backtest.router, prefix="/backtest")
app.include_router(monte_carlo.router, prefix="/monte-carlo")
app.include_router(scanner.router, prefix="/scanner")

@app.get("/")
def root():
    return {"status": "ok"}