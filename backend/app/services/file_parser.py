"""
Parse uploaded CSV and Excel files for index data, actual prices, volumes, and FX rates.
"""
import io
import re
import pandas as pd


def _detect_format(filename: str) -> str:
    if filename.endswith(".xlsx") or filename.endswith(".xls"):
        return "excel"
    return "csv"


def _parse_period(period_str: str) -> tuple[int, int]:
    """
    Parse period strings like 'Q1-2023', 'Q1-23', 'Q1 2023', '2023-Q1' into (year, quarter).
    """
    period_str = period_str.strip()

    m = re.match(r"Q(\d)[- ](\d{2,4})", period_str, re.IGNORECASE)
    if m:
        q = int(m.group(1))
        y = int(m.group(2))
        if y < 100:
            y += 2000
        return (y, q)

    m = re.match(r"(\d{4})[- ]Q(\d)", period_str, re.IGNORECASE)
    if m:
        return (int(m.group(1)), int(m.group(2)))

    raise ValueError(f"Cannot parse period: {period_str}")


def _read_file(content: bytes, filename: str) -> pd.DataFrame:
    fmt = _detect_format(filename)
    if fmt == "excel":
        df = pd.read_excel(io.BytesIO(content))
    else:
        df = pd.read_csv(io.BytesIO(content))
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
    return df


def parse_index_upload(content: bytes, filename: str) -> list[dict]:
    """
    Parse index override upload.
    Expected columns: material, region, period, value
    """
    df = _read_file(content, filename)

    required = {"material", "region", "period", "value"}
    if not required.issubset(set(df.columns)):
        raise ValueError(f"Missing columns. Required: {required}. Found: {set(df.columns)}")

    rows = []
    for _, row in df.iterrows():
        year, quarter = _parse_period(str(row["period"]))
        rows.append({
            "material": str(row["material"]).strip(),
            "region": str(row["region"]).strip(),
            "year": year,
            "quarter": quarter,
            "value": float(row["value"]),
        })
    return rows


def parse_price_upload(content: bytes, filename: str) -> dict:
    """
    Parse actual price upload.
    Expected columns: period, price
    Optional columns: incoterm, named_place

    Returns {"rows": [...], "errors": [{"row": N, "message": "..."}]} instead of
    raising on bad individual rows — the caller decides how to handle partial failures.
    Raises ValueError only for structural issues (missing required columns, unreadable file).
    """
    df = _read_file(content, filename)

    required = {"period", "price"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(
            f"Missing required column(s): {', '.join(sorted(missing))}. "
            f"Expected: period, price. Optional: incoterm, named_place."
        )

    has_incoterm = "incoterm" in df.columns
    has_named_place = "named_place" in df.columns

    rows = []
    errors = []
    for idx, row in df.iterrows():
        row_num = int(idx) + 2  # +2: 1-based + header row
        try:
            year, quarter = _parse_period(str(row["period"]))
        except ValueError:
            errors.append({
                "row": row_num,
                "message": f"Invalid period '{row['period']}'. Use format Q1-2023 or 2023-Q1.",
            })
            continue
        try:
            price = float(row["price"])
        except (ValueError, TypeError):
            errors.append({
                "row": row_num,
                "message": f"Invalid price '{row['price']}'. Must be a number.",
            })
            continue

        entry = {"year": year, "quarter": quarter, "price": price}
        if has_incoterm:
            v = row["incoterm"]
            entry["incoterm"] = str(v).strip().upper() if pd.notna(v) and str(v).strip() else None
        if has_named_place:
            v = row["named_place"]
            entry["named_place"] = str(v).strip() if pd.notna(v) and str(v).strip() else None
        rows.append(entry)

    return {"rows": rows, "errors": errors}


def parse_volume_upload(content: bytes, filename: str) -> list[dict]:
    """
    Parse actual volume upload.
    Expected columns: period, volume
    Optional column: unit
    """
    df = _read_file(content, filename)

    required = {"period", "volume"}
    if not required.issubset(set(df.columns)):
        raise ValueError(f"Missing columns. Required: {required}. Found: {set(df.columns)}")

    has_unit = "unit" in df.columns
    rows = []
    for _, row in df.iterrows():
        year, quarter = _parse_period(str(row["period"]))
        entry = {
            "year": year,
            "quarter": quarter,
            "volume": float(row["volume"]),
        }
        if has_unit:
            entry["unit"] = str(row["unit"]).strip()
        rows.append(entry)
    return rows


def parse_fx_upload(content: bytes, filename: str) -> list[dict]:
    """
    Parse FX rate upload.
    Expected columns: from_currency, to_currency, period, rate
    """
    df = _read_file(content, filename)

    required = {"from_currency", "to_currency", "period", "rate"}
    if not required.issubset(set(df.columns)):
        raise ValueError(f"Missing columns. Required: {required}. Found: {set(df.columns)}")

    rows = []
    for _, row in df.iterrows():
        year, quarter = _parse_period(str(row["period"]))
        rows.append({
            "from_currency": str(row["from_currency"]).strip().upper(),
            "to_currency": str(row["to_currency"]).strip().upper(),
            "year": year,
            "quarter": quarter,
            "rate": float(row["rate"]),
        })
    return rows
