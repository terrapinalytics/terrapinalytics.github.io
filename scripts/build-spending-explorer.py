#!/usr/bin/env python3
"""Rebuild the spending explorer's embedded data from its public series CSV."""

import argparse
import csv
from html import escape
import io
import json
from math import prod
from pathlib import Path
import re
from statistics import median
import zipfile

ROOT = Path(__file__).resolve().parents[1] / "assets/finance/escalation"
DATASET = re.compile(r'(<script type="application/json" id="dataset">)(.*?)(</script>)', re.DOTALL)
CAGR_TABLE = re.compile(r"(<!-- cagr-rows:start -->)(.*?)(<!-- cagr-rows:end -->)", re.DOTALL)
FIRST_CAGR_YEAR = 2015
LAST_CAGR_YEAR = 2025
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


def football_coaching_growth(first, last):
    """Use the explorer's reporting Power Four cohort and matched-year median method."""
    assets = ROOT.parent.parent
    with (assets / "finance/ranked_eada_finances_FY2001_FY2025.csv").open(encoding="utf-8") as source:
        power_four = {row["school"] for row in csv.DictReader(source)
                      if row["conference_current"] in {"ACC", "Big Ten", "Big 12", "SEC"}}
    with zipfile.ZipFile(assets / "coaching/supporting_data.zip") as archive:
        with archive.open("normalized/ncaa_mfrs_finances.csv") as source:
            filings = [row for row in csv.DictReader(io.TextIOWrapper(source, encoding="utf-8"))
                       if row["school"] in power_four]
    cohort = {row["school"] for row in filings
              if row["fiscal_year"] == "2019" and float(row["total_expenditure_usd"] or 0) > 0}
    values = {year: {} for year in range(first, last + 1)}
    for row in filings:
        year, school = int(row["fiscal_year"]), row["school"]
        if year not in values or school not in cohort:
            continue
        value = float(row["football_coaching_compensation_usd"] or 0)
        if value > 0:
            if school in values[year]:
                raise ValueError(f"Duplicate football coaching compensation for {school}, FY{year}")
            values[year][school] = value
    return prod(
        median(current[school] / previous[school] for school in current.keys() & previous.keys())
        for previous, current in zip(values.values(), list(values.values())[1:])
    )


def cagr_rows(dataset):
    first, last = FIRST_CAGR_YEAR, LAST_CAGR_YEAR
    series = {entry["id"]: entry["rows"] for entry in dataset["series"]}

    def index_ratio(series_id):
        rows = series[series_id]
        start, end = (rows[str(year)] for year in (first, last))
        if not start[1] or end[5] is None or start[5] != end[5]:
            raise ValueError(f"No continuous FY{first}–FY{last} index for {series_id}")
        return end[1] / start[1]

    items = [
        ("College athletics expenses", index_ratio("Total athletics spending benchmark")),
        ("Coaching compensation · all sports*", index_ratio("Coaches compensation")),
        ("Football coaching compensation*", football_coaching_growth(first, last)),
        ("Football expenses", index_ratio("Football expense|Reporting Power Four|NCAA / Knight-Newhouse")),
        ("CPI-U · U.S. city average", dataset["cpi"][str(last)] / dataset["cpi"][str(first)]),
    ]
    return "\n" + "".join(
        f'<tr><th scope="row">{escape(label)}</th><td>{ratio ** (1 / (last - first)) - 1:.1%}</td></tr>\n'
        for label, ratio in items
    )


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
    tables = list(CAGR_TABLE.finditer(html))
    if len(tables) != 1:
        parser.exit(1, "Expected one CAGR table in explorer.html.\n")
    table = tables[0]
    rows = cagr_rows(dataset)
    dataset_matches = json.loads(payload[2]) == dataset
    table_matches = table[2] == rows
    if args.check and not (dataset_matches and table_matches):
        parser.exit(1, "Spending explorer is out of sync. Run python scripts/build-spending-explorer.py.\n")
    if not (dataset_matches and table_matches):
        if not dataset_matches:
            # Escape script delimiters that could otherwise be introduced by CSV text.
            encoded = json.dumps(dataset, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
            encoded = encoded.replace("<", r"\u003c")
            html = DATASET.sub(lambda match: match[1] + encoded + match[3], html)
        html = CAGR_TABLE.sub(lambda match: match[1] + rows + match[3], html)
        path.write_text(html, encoding="utf-8")
    print(f"Spending explorer checked against {len(dataset['series'])} published series.")


if __name__ == "__main__":
    main()
