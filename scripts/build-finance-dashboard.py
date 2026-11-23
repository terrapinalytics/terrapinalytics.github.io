"""Build the dashboard payload from the published NCAA and EADA panels."""
import argparse
import base64
import csv
import gzip
import json
from math import isfinite
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "assets/finance"
COMMON = {
    "rev": "total_revenue_usd",
    "exp": "total_expenditure_usd",
    "fbexp": "football_expenditure_usd",
    "aid": "athlete_aid_benefits_expenditure_usd",
}
METRICS = {
    "NCAA": {
        "tickets": "ticket_sales_revenue_usd",
        "donors": "donor_contributions_revenue_usd",
        "media": "conference_ncaa_media_postseason_revenue_usd",
        "support": "total_subsidy_usd",
        "fees": "student_fees_revenue_usd",
        "coaches": "coaches_compensation_expenditure_usd",
        "debt": "annual_debt_service_usd",
    },
    "EADA": {
        "fbrev": "football_revenue_usd",
        "recruit": "recruiting_expenditure_usd",
        "mrev": "mens_basketball_revenue_usd",
        "wrev": "womens_basketball_revenue_usd",
    },
}
PANELS = {
    "NCAA": "fbs_ncaa_finances_FY2005_FY2025.csv",
    "EADA": "fbs_eada_finances_FY2001_FY2025.csv",
}


def as_number(value):
    return float(value) if value else None


def read_panel(source, filename):
    metrics = COMMON | METRICS[source]
    seen = set()
    program_years = set()
    with (ROOT / filename).open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            identity = row["unitid"] if source == "EADA" else row["school"]
            key = identity, row["fiscal_year"]
            if not identity or key in seen:
                raise ValueError(f"{source} has a blank or duplicate institution-year key: {key}")
            seen.add(key)
            program_year = row["school"], row["fiscal_year"]
            if program_year in program_years:
                raise ValueError(f"{source} has multiple rows for the same program and fiscal year: {program_year}")
            program_years.add(program_year)
            record = {
                "a": source, "s": row["school"], "y": int(row["fiscal_year"]),
                "c": row["conference_current"], "status": row["data_status"],
                "source": row["source_url"],
            }
            record.update({metric: as_number(row[field]) for metric, field in metrics.items()})
            source_urls = json.loads(row.get("metric_source_overrides") or "{}")
            if source_urls:
                record["metricSources"] = {metric: source_urls[field] for metric, field in metrics.items() if field in source_urls}
            if row.get("football_expenditure_valid_for_comparison") == "false":
                if row["football_expenditure_usd"] or not row["football_expenditure_quality_note"]:
                    raise ValueError(f"Flagged NCAA football row needs a blank comparison value and a note: {key}")
                record["fbexpFlagged"] = True
            yield record


def read_spending_index():
    """Use the same matched-school benchmark as the Spending Explorer."""
    with (ROOT / "escalation/explorer_series.csv").open(newline="", encoding="utf-8") as handle:
        index = {}
        for row in csv.DictReader(handle):
            if row["series_id"] != "Total athletics spending benchmark":
                continue
            year, value = int(row["fiscal_year"]), float(row["index"])
            if year in index or not isfinite(value) or value <= 0:
                raise ValueError(f"Invalid spending benchmark observation for FY{year}")
            index[year] = value
    if index.get(2019) != 100 or not set(range(2005, 2026)).issubset(index):
        raise ValueError("Expected the FY2019-based spending benchmark through FY2025")
    return {str(year): value for year, value in index.items()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    records = [record for source, filename in PANELS.items() for record in read_panel(source, filename)]
    conferences = {}
    for record in records:
        school, conference = record["s"], record["c"]
        if not conference or conferences.setdefault(school, conference) != conference:
            raise ValueError(f"Missing or inconsistent current conference for {school} in {record['y']}")
    packed = ROOT / "data.packed.txt"
    payload = {"records": records, "spendingIndex": read_spending_index()}
    if args.check:
        if json.loads(gzip.decompress(base64.b64decode(packed.read_text()))) != payload:
            parser.exit(1, "Finance dashboard payload is out of sync. Run python scripts/build-finance-dashboard.py.\n")
    else:
        raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
        packed.write_bytes(base64.b64encode(gzip.compress(raw, mtime=0)) + b"\n")
    print(f"Verified finance dashboard values for {len(records):,} school-years.")


if __name__ == "__main__":
    main()
