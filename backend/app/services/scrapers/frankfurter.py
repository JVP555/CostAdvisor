import httpx

_BASE = "https://api.frankfurter.app"


class FrankfurterScraper:
    """Fetch live exchange rate from Frankfurter JSON API (ECB-backed, no auth required).

    scrape_url format: https://api.frankfurter.app/latest?from=CNY&to=EUR
    """

    def __init__(self, scrape_url: str):
        self.url = scrape_url

    async def fetch_live(self) -> float | None:
        try:
            async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
                resp = await client.get(self.url)
                resp.raise_for_status()
            rates = resp.json().get("rates", {})
            return float(next(iter(rates.values()))) if rates else None
        except Exception:
            return None


async def fetch_quarterly_rates(
    from_currency: str, to_currency: str, start_year: int = 2020
) -> dict[tuple[int, int], float]:
    """Fetch quarterly average rates for a currency pair from Frankfurter.

    Returns a dict keyed by (year, quarter) with the average rate across
    all trading days in that quarter.
    """
    from datetime import date

    today = date.today()
    start = date(start_year, 1, 1)
    url = f"{_BASE}/{start}..{today}?from={from_currency}&to={to_currency}"

    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
        data = resp.json()
    except Exception:
        return {}

    # Accumulate daily rates per quarter then average
    buckets: dict[tuple[int, int], list[float]] = {}
    for date_str, rates in data.get("rates", {}).items():
        rate = rates.get(to_currency)
        if rate is None:
            continue
        y, m, _ = date_str.split("-")
        q = (int(m) - 1) // 3 + 1
        key = (int(y), q)
        buckets.setdefault(key, []).append(float(rate))

    return {k: sum(v) / len(v) for k, v in buckets.items()}
