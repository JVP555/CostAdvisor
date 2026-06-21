import httpx


class FrankfurterScraper:
    """Fetch live exchange rate from Frankfurter JSON API (ECB-backed, no auth required).

    scrape_url format: https://api.frankfurter.app/latest?from=CNY&to=EUR
    """

    def __init__(self, scrape_url: str):
        self.url = scrape_url

    async def fetch_live(self) -> float | None:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(self.url)
                resp.raise_for_status()
            rates = resp.json().get("rates", {})
            return float(next(iter(rates.values()))) if rates else None
        except Exception:
            return None
