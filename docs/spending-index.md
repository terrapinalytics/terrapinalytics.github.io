# Rebuild the College Athletics Spending Explorer

The published explorer reads an embedded copy of [the chart series CSV](../assets/finance/escalation/explorer_series.csv). That snapshot includes the NCAA and EADA spending backfills, sport and category series, the fixed-weight composite, and the CPI-U comparator. The rebuild uses Python’s standard library and requires no external services.

From the repository root:

```sh
python scripts/build-spending-explorer.py
python scripts/build-spending-explorer.py --check
```

The first command rebuilds the chart payload inside [the dashboard HTML](../assets/finance/escalation/explorer.html), leaving its controls and layout intact. The second checks that the embedded data agree exactly with the snapshot. Commit CSV and HTML updates together. Use the fiscal-year and cohort notes in the CSV when interpreting coverage or comparing series.

## Snapshot inputs and definitions

| Component | Published reference |
| --- | --- |
| NCAA/Knight-Newhouse spending and historical backfill | [Underlying source registry](../assets/coaching/source_registry.csv) · [Data audit](../assets/coaching/data_quality.md) · [Normalized source tables (ZIP)](../assets/coaching/supporting_data.zip) |
| EADA comparisons and sport series | [School totals and reporting coverage](../assets/finance/ranked_eada_finances_FY2001_FY2025.csv) · [U.S. Department of Education EADA](https://ope.ed.gov/athletics/) |
| CPI-U | [BLS annual U.S. city average, all items](https://www.bls.gov/regions/northeast/data/consumerpriceindex_us_table.htm) |
| Budget shares and index definitions | [Budget weights (CSV)](../assets/finance/escalation/budget_weights_fy2025.csv) · [Index methods and coverage](https://terrapinalytics.github.io/projects/athletics-spending-index.html#how-the-index-is-built) |

A blank observation remains missing in the chart. The rebuild preserves reported zero values, cohort labels, matched-school counts, and the start of each continuous run. The CPI-U comparator supplies the annual inflation values used by the explorer.

## Original benchmark calculation

[`build-athletics-spending-index.py`](../scripts/build-athletics-spending-index.py) reads normalized financial tables from `assets/coaching/supporting_data.zip` and school conference fields from `assets/finance/ranked_eada_finances_FY2001_FY2025.csv`. It writes `annual_series.csv` and `budget_weights_fy2025.csv`. Run it on a clean working branch if you want to recalculate those outputs.

The complete explorer build starts from the published series snapshot. Recreating that snapshot from every original filing and the historical sport extracts requires additional input snapshots and a documented refresh pipeline. The original benchmark script covers the original annual tables and weights.
