from app.services.sheet_roundtrip.base import SheetColumnSpec, SheetPayloadSpec
from app.services.sheet_roundtrip.formula_coverage_price import FormulaCoveragePriceSpec

PAYLOAD_REGISTRY: dict[str, SheetPayloadSpec] = {
    "formula_coverage_price": FormulaCoveragePriceSpec(),
}


def get_spec(payload_key: str) -> SheetPayloadSpec:
    spec = PAYLOAD_REGISTRY.get(payload_key)
    if not spec:
        raise KeyError(f"Unknown sheet payload '{payload_key}'")
    return spec


__all__ = ["SheetColumnSpec", "SheetPayloadSpec", "PAYLOAD_REGISTRY", "get_spec"]
