"""
Incoterms 2020 metadata.

Encodes the cost-allocation table from the ICC Incoterms 2020 rules so that
downstream pricing logic can reason about which costs the seller has already
absorbed into a quoted price. Risk-transfer is intentionally omitted — for
landed-cost comparison, only cost allocation matters.

`seller_pays` flags map to the columns of the standard cost-allocation table:
    export_clear  : export customs declaration + origin formalities
    main_freight  : carriage on the main leg (sea/air/main road)
    insurance     : marine/transit insurance
    import_clear  : import customs clearance
    duty          : import duties and taxes
    last_mile     : carriage and unloading at destination

`modes` is "any" for E/F/C/D terms valid for any mode, and "sea" for the four
maritime-only rules (FAS, FOB, CFR, CIF) that should not be used for
containerized or non-water transport.
"""

INCOTERMS_2020: dict[str, dict] = {
    "EXW": {
        "label": "Ex Works",
        "modes": "any",
        "seller_pays": {
            "export_clear": False, "main_freight": False, "insurance": False,
            "import_clear": False, "duty": False, "last_mile": False,
        },
    },
    "FCA": {
        "label": "Free Carrier",
        "modes": "any",
        "seller_pays": {
            "export_clear": True, "main_freight": False, "insurance": False,
            "import_clear": False, "duty": False, "last_mile": False,
        },
    },
    "FAS": {
        "label": "Free Alongside Ship",
        "modes": "sea",
        "seller_pays": {
            "export_clear": True, "main_freight": False, "insurance": False,
            "import_clear": False, "duty": False, "last_mile": False,
        },
    },
    "FOB": {
        "label": "Free On Board",
        "modes": "sea",
        "seller_pays": {
            "export_clear": True, "main_freight": False, "insurance": False,
            "import_clear": False, "duty": False, "last_mile": False,
        },
    },
    "CFR": {
        "label": "Cost and Freight",
        "modes": "sea",
        "seller_pays": {
            "export_clear": True, "main_freight": True, "insurance": False,
            "import_clear": False, "duty": False, "last_mile": False,
        },
    },
    "CIF": {
        "label": "Cost, Insurance & Freight",
        "modes": "sea",
        "seller_pays": {
            "export_clear": True, "main_freight": True, "insurance": True,
            "import_clear": False, "duty": False, "last_mile": False,
        },
    },
    "CPT": {
        "label": "Carriage Paid To",
        "modes": "any",
        "seller_pays": {
            "export_clear": True, "main_freight": True, "insurance": False,
            "import_clear": False, "duty": False, "last_mile": False,
        },
    },
    "CIP": {
        "label": "Carriage and Insurance Paid To",
        "modes": "any",
        "seller_pays": {
            "export_clear": True, "main_freight": True, "insurance": True,
            "import_clear": False, "duty": False, "last_mile": False,
        },
    },
    "DAP": {
        "label": "Delivered At Place",
        "modes": "any",
        "seller_pays": {
            "export_clear": True, "main_freight": True, "insurance": False,
            "import_clear": False, "duty": False, "last_mile": True,
        },
    },
    "DPU": {
        "label": "Delivered At Place Unloaded",
        "modes": "any",
        "seller_pays": {
            "export_clear": True, "main_freight": True, "insurance": False,
            "import_clear": False, "duty": False, "last_mile": True,
        },
    },
    "DDP": {
        "label": "Delivered Duty Paid",
        "modes": "any",
        "seller_pays": {
            "export_clear": True, "main_freight": True, "insurance": False,
            "import_clear": True, "duty": True, "last_mile": True,
        },
    },
}

# Pre-2020 codes still seen in older supplier contracts. Accepted as input but
# flagged so the UI can warn the user.
DEPRECATED_INCOTERMS: dict[str, str] = {
    "DAT": "Delivered At Terminal (Incoterms 2010, replaced by DPU)",
    "DAF": "Delivered At Frontier (pre-2010)",
    "DES": "Delivered Ex Ship (pre-2010)",
    "DEQ": "Delivered Ex Quay (pre-2010)",
    "DDU": "Delivered Duty Unpaid (pre-2010, closest 2020 equivalent: DAP)",
    "FOR": "Free On Rail (pre-1980)",
    "FOT": "Free On Truck (pre-1980)",
}

SEA_ONLY_INCOTERMS: frozenset[str] = frozenset(
    code for code, meta in INCOTERMS_2020.items() if meta["modes"] == "sea"
)

# Cost-bucket keys used by the landed-cost adjustment shape. Order matters for
# UI rendering — buckets are listed in roughly the order they're incurred along
# the export-import path.
COST_BUCKETS: tuple[str, ...] = (
    "export_clear",
    "main_freight",
    "insurance",
    "import_clear",
    "duty",
    "last_mile",
)

COST_BUCKET_LABELS: dict[str, str] = {
    "export_clear": "Export clearance",
    "main_freight": "Main carriage",
    "insurance":    "Transit insurance",
    "import_clear": "Import clearance",
    "duty":         "Import duties",
    "last_mile":    "Last-mile delivery",
}


def is_valid(code: str | None, allow_deprecated: bool = True) -> bool:
    if not code:
        return False
    if code in INCOTERMS_2020:
        return True
    if allow_deprecated and code in DEPRECATED_INCOTERMS:
        return True
    return False


def is_deprecated(code: str | None) -> bool:
    return bool(code) and code in DEPRECATED_INCOTERMS


def is_sea_only(code: str | None) -> bool:
    return bool(code) and code in SEA_ONLY_INCOTERMS


def normalize(code: str | None) -> str | None:
    """Uppercase and strip; return None for empty input."""
    if code is None:
        return None
    code = code.strip().upper()
    return code or None


def all_valid_codes(include_deprecated: bool = True) -> list[str]:
    codes = list(INCOTERMS_2020.keys())
    if include_deprecated:
        codes.extend(DEPRECATED_INCOTERMS.keys())
    return codes
