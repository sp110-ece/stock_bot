from fastapi import APIRouter, HTTPException
from models.prophet_model import predict

router = APIRouter()

@router.get("/{ticker}")
def get_prediction(ticker: str, horizon: int = 30):
    try:
        return predict(ticker, horizon)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))