#!/usr/bin/env python3
"""Rebuild the spending explorer's embedded data from its public series CSV."""

import argparse
import csv
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1] / "assets/finance/escalation"
DATASET = re.compile(r'(<script type="application/json" id="dataset">)(.*?)(</script>)', re.DOTALL)
FIELDS = {
    "id": "series_id",
    "name": "series",
    "source": "source",
    "cohort": "cohort",
    "group": "group",
    "unit": "unit",
    "note": "notes",
}
OBSERVATIONS = {
    "median_nominal_usd": float,
    "index": float,
    "annual_growth_rate": float,
    "reporting_schools": int,
    "matched_pairs": int,
    "run_start_year": int,
}


def read_dataset(path):
    cpi = {}
    series = {}
    with path.open(encoding="utf-8", newline="") as source:
        for row in csv.DictReader(source):
            series_id = row["series_id"]
            year = str(int(row["fiscal_year"]))
            metadata = {key: row[column] for key, column in FIELDS.items()}
            entry = series.setdefault(series_id, {**metadata, "rows": {}})
            if any(entry[key] != value for key, value in metadata.items()):
                raise ValueError(f"Inconsistent metadata for {series_id}")
            if year in entry["rows"]:
                raise ValueError(f"Duplicate observation for {series_id}, FY{year}")
            entry["rows"][year] = [
                convert(row[column]) if row[column] else None
                for column, convert in OBSERVATIONS.items()
            ]
            if row["cpi_u"]:
                value = float(row["cpi_u"])
                if cpi.setdefault(year, value) != value:
                    raise ValueError(f"Conflicting CPI-U values for {year}")
    return {"cpi": dict(sorted(cpi.items())), "series": list(series.values())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check the existing payload without rewriting it")
    args = parser.parse_args()

    path = ROOT / "explorer.html"
    html = path.read_text(encoding="utf-8")
    payloads = list(DATASET.finditer(html))
    if len(payloads) != 1:
        parser.exit(1, "Expected one embedded dataset in explorer.html.\n")
    dataset = read_dataset(ROOT / "explorer_series.csv")
    payload = payloads[0]
    matches = json.loads(payload[2]) == dataset
    if args.check and not matches:
        parser.exit(1, "Spending explorer is out of sync. Run python scripts/build-spending-explorer.py.\n")
    if not matches:
        # Escape script delimiters that could otherwise be introduced by CSV text.
        encoded = json.dumps(dataset, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
        encoded = encoded.replace("<", r"\u003c")
        path.write_text(html[:payload.start(2)] + encoded + html[payload.end(2):], encoding="utf-8")
    print(f"Spending explorer checked against {len(dataset['series'])} published series.")


if __name__ == "__main__":
    main()
