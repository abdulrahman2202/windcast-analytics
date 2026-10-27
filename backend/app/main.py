
from datetime import date
from typing import Any

import httpx
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="WindCast Analytics API",
    description="Wind generation forecast and accuracy analytics",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1"
FUELHH_URL = f"{BASE_URL}/datasets/FUELHH"
WINDFOR_URL = f"{BASE_URL}/datasets/WINDFOR/stream"


@app.get("/")
def root():
    return {"message": "WindCast Analytics API is running"}


@app.get("/api/health")
def health():
    return {"status": "healthy"}



async def fetch_json(
    client: httpx.AsyncClient,
    url: str,
    params: dict[str, Any],
) -> list[dict]:
    response = await client.get(url, params=params)
    response.raise_for_status()
    payload = response.json()

    if isinstance(payload, dict):
        payload = payload.get("data", [])

    if not isinstance(payload, list):
        raise ValueError("Unexpected Elexon API response format")

    return payload



async def fetch_actuals_in_chunks(
    client: httpx.AsyncClient,
    start_date: date,
    end_date: date,
) -> list[dict]:
    records = []
    current = start_date

    while current <= end_date:
        chunk_end = min(
            current + pd.Timedelta(days=6),
            end_date,
        )
        chunk_end = pd.Timestamp(chunk_end).date()

        chunk = await fetch_json(
            client,
            FUELHH_URL,
            {
                "settlementDateFrom": current.isoformat(),
                "settlementDateTo": chunk_end.isoformat(),
                "fuelType": "WIND",
            },
        )

        records.extend(chunk)
        current = chunk_end + pd.Timedelta(days=1)

    return records




@app.get("/api/forecast")
async def get_forecast(
    start_date: date = Query(default=date(2026, 1, 1)),
    end_date: date = Query(default=date(2026, 1, 31)),
):
    if start_date > end_date:
        raise HTTPException(400, "start_date must be before end_date")

    if start_date < date(2026, 1, 1) or end_date > date(2026, 1, 31):
        raise HTTPException(400, "This MVP is limited to January 2026")

    start = f"{start_date.isoformat()}T00:00:00Z"
    end = f"{end_date.isoformat()}T23:59:59Z"

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            actuals = await fetch_actuals_in_chunks(
                client,
                start_date,
                end_date,
            )

            forecasts = await fetch_json(
                client,
                WINDFOR_URL,
                {
                    "publishDateTimeFrom": "2025-12-01T00:00:00Z",
                    "publishDateTimeTo": end,
                },
            )

        actual_df = pd.DataFrame(actuals)
        forecast_df = pd.DataFrame(forecasts)

        if actual_df.empty or forecast_df.empty:
            return {
                "data": [],
                "message": (
                    "No records returned. Verify historical availability "
                    "and the endpoint query parameters."
                ),
            }

        actual_df = actual_df[
            actual_df["fuelType"].astype(str).str.upper() == "WIND"
        ].copy()

        for frame in (actual_df, forecast_df):
            frame["startTime"] = pd.to_datetime(
                frame["startTime"], utc=True, errors="coerce"
            )

        actual_df["generation"] = pd.to_numeric(
            actual_df["generation"], errors="coerce"
        )
        forecast_df["generation"] = pd.to_numeric(
            forecast_df["generation"], errors="coerce"
        )

        actual_df = actual_df.dropna(
            subset=["startTime", "generation"]
        )
        forecast_df = forecast_df.dropna(
            subset=["startTime", "publishTime", "generation"]
        )

        actual_df = actual_df[
            (actual_df["startTime"] >= start)
            & (actual_df["startTime"] < (
                pd.Timestamp(end) + pd.Timedelta(seconds=1)
            ))
        ]

        # Use a day-ahead cutoff in UTC for this initial implementation.
        # Confirm the exact market decision cutoff and timezone convention
        # before presenting these results as official procurement analysis.
        forecast_df["publishTime"] = pd.to_datetime(
            forecast_df["publishTime"], utc=True, errors="coerce"
        )
        forecast_df = forecast_df.dropna(subset=["publishTime"])

        forecast_df["delivery_date"] = (
            forecast_df["startTime"].dt.date
        )
        forecast_df["decision_cutoff"] = pd.to_datetime(
            forecast_df["delivery_date"].astype(str)
            + "T00:00:00Z",
            utc=True,
        )

        forecast_df = forecast_df[
            (forecast_df["startTime"] >= start)
            & (forecast_df["startTime"] < (
                pd.Timestamp(end) + pd.Timedelta(days=1)
            ))
            & (
                forecast_df["publishTime"]
                <= forecast_df["decision_cutoff"]
            )
        ]

        # Keep the latest eligible publication per delivery interval.
        forecast_df = forecast_df.sort_values("publishTime")
        forecast_df = forecast_df.drop_duplicates(
            subset=["startTime"], keep="last"
        )

        merged = actual_df[["startTime", "generation"]].merge(
            forecast_df[["startTime", "generation", "publishTime"]],
            on="startTime",
            how="inner",
            suffixes=("_actual", "_forecast"),
        )

        merged = merged.sort_values("startTime")
        merged["error"] = (
            merged["generation_forecast"]
            - merged["generation_actual"]
        )

        records = merged.replace(
            {np.nan: None}
        ).to_dict(orient="records")

        for record in records:
            record["startTime"] = record["startTime"].isoformat()
            record["publishTime"] = record["publishTime"].isoformat()

        return {
            "data": records,
            "count": len(records),
            "source": "Elexon BMRS",
            "period": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
            },
        }

    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "url": str(exc.request.url),
                "status": exc.response.status_code,
                "response": exc.response.text[:1500],
            },
        ) from exc
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        raise HTTPException(
            502,
            f"Unable to retrieve or process Elexon data: {exc}",
        ) from exc


@app.get("/api/accuracy")
async def get_accuracy(
    start_date: date = Query(default=date(2026, 1, 1)),
    end_date: date = Query(default=date(2026, 1, 31)),
):
    result = await get_forecast(start_date, end_date)
    data = result["data"]

    if not data:
        return {
            "count": 0,
            "mae": None,
            "rmse": None,
            "bias": None,
            "message": result.get("message", "No matched records"),
        }

    errors = np.array(
        [row["error"] for row in data], dtype=float
    )

    return {
        "count": len(errors),
        "mae": round(float(np.mean(np.abs(errors))), 2),
        "rmse": round(float(np.sqrt(np.mean(errors ** 2))), 2),
        "bias": round(float(np.mean(errors)), 2),
        "unit": "MW",
    }
