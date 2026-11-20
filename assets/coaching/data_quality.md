# Phase 4 data quality report

Update dated October 26, 2026. All 79 programs and their desirability ranks are retained. No model weights were changed. This is a completed integration and delivery of accessible evidence, with the incomplete collection objectives listed below.

## Phase 3 versus Phase 4

| Measure | Phase 3 | Phase 4 |
|---|---:|---:|
| Ranked programs | 79 | 79 |
| NCAA financial source rows | 1168 | 1399 |
| Earliest normalized NCAA financial year | 2010 | 2005 |
| Eligible attendance school-seasons with complete totals | 1206 / 1244 | 1243 / 1244 |
| Contract table school rows, including placeholders | 67 | 79 |

Row counts are not field completeness. Private-school blank rows and contract placeholders do not establish resource or contract coverage. Official Knight-Newhouse displays were captured for 62 ranked public programs. The original Phase 3 archive is included byte-for-byte, SHA-256 69a5489a90dc4fb9d4aef78bf8431882045098d05e0d30b89d79a7a111a969bf.

## Financial sources and export limitation

The official Knight-Newhouse registration and terms process was completed. Its Excel download endpoint returned approximately 17 KB of Page not found HTML, preserved in raw sources. A complete all-Division-I export was NOT obtained. Permissible official school-level annual charts and component displays were extracted instead. These are chart-level primary observations, not a complete raw export. A separate custom report workflow also requires a further CAPTCHA; no bypass was attempted.

Knight-Newhouse is part of the NCAA MFRS source family, not a duplicate source family. Its source-native institution identifiers, reported fiscal years, original displays and provider definitions are retained. The Miami identifier mapping was corrected from Miami University (Ohio) ID 158 to University of Miami (Florida) ID 268. No Ohio financial values were imported for Florida. See school_identifier_corrections_phase4.csv.

The primary comparison found 5952 exact field matches, 1825 recovered missing fields and 15 definition differences. Current scholarship-related-support grouping differs from historical scholarships-only fields: the 15 differences remain separate observations, not unexplained overwrites. There are 14 unresolved annual revenue bar versus revenue-component-pie total disagreements. No fabricated balancing component was introduced. Historical year-filtered pies were accepted only after reconciliation with that year's annual total; 280 asynchronous/stale pie captures remain quarantined. Initial default FY2025 categories were independently retained with their total conflicts flagged.

The nine suspicious FY2012 football spending/coaching zero cases were confirmed in primary displays: Auburn, Clemson, Iowa State, Michigan, Missouri, North Carolina, Tennessee, Texas A&M and Virginia Tech. They remain source zeros, are flagged unusable in resource means, and their accounting cause remains unresolved. A reported zero is not proof of no spending.

Pittsburgh's official profile states that financial data were not provided. The 16 private institutions remain explicitly nondisclosed in NCAA series. Neither circumstance is treated as zero resources. Public/private financial completeness is reported separately. Baylor and Wake Forest have usable federal EADA observations, kept distinct from NCAA figures.

KN operating contributions include support for debt service, leases and in-kind support and exclude pledges/future capital gifts under provider definitions. The legacy annual_debt_service_usd label represents the KN grouping that also includes lease/rental costs, not pure principal and interest. Football coaching compensation is total coaching compensation/benefits, not the head coach's salary; KN FY2015–2017 excludes postseason bonuses. Detailed football revenue, recruiting, support staff and capital categories are still incomplete. Institutional fiscal years are preserved; a football-season mapping must not be assumed identical across institutions.

## Actual field completeness

| Source family | Eligible school-years | Primary metric present | Every required metric present | Usable metric slots |
|---|---:|---:|---:|---:|
| ASSISTANT_SALARIES | 550 | 63 | 60 | 11.27% |
| ATTENDANCE | 1244 | 1243 | 1243 | 99.97% |
| COACHING_CONTRACTS | 79 | 6 | 0 | 11.81% |
| CONFERENCE_IRS_DISTRIBUTIONS | 602 | 589 | 589 | 97.84% |
| CURRENT_VENUE_METADATA | 79 | 79 | 79 | 100.0% |
| EADA | 1975 | 1974 | 237 | 82.62% |
| ESPN_FPI | 1629 | 1629 | 1629 | 100.0% |
| HEAD_COACH_REPORTED_PAY | 550 | 71 | 57 | 12.06% |
| HIGH_SCHOOL_RECRUITING | 1244 | 1244 | 931 | 86.02% |
| HISTORICAL_CAPACITY | 1244 | 15 | 14 | 1.17% |
| NCAA_MFRS | 1659 | 1223 | 0 | 43.64% |
| ROSTER_TALENT | 1244 | 859 | 859 | 69.05% |
| SP_PLUS | 1629 | 1629 | 0 | 85.71% |
| TRANSFER_PORTAL | 628 | 394 | 0 | 49.3% |

The last column uses metric slots, not source rows. School-year matrices distinguish verified/API observations (V), secondary observations (S), structural exclusions (X), nondisclosure/source unavailable (D), known uncollected categories (C), flagged/lower-bound values (L), and genuine missing fields (M). Source/API verification does not independently certify turnstile attendance, 247 methodology, or budget execution. Source-native blanks may require provider clarification; unresolved availability classifications are not financial zeros.

Financial eligibility is institutional reporting, independent of FBS eligibility. Attendance/recruiting/performance denominators use historical FBS membership. Twenty pre-FBS 2010–2025 attendance school-seasons for James Madison and Liberty are excluded from coverage denominators. Historical conference distributions use institutional membership, including Notre Dame's nonfootball ACC membership. Current conference labels are not applied retroactively. NIL, tax compensation and other irregular records have separate observed-record field audits, not an implied complete annual panel.

## Attendance and capacities

Thirty-seven of 38 eligible missing home totals were recovered. Miami 2022 remains incomplete: the official North Carolina game book reports zero for the October 8 road game at Miami, but that zero cannot establish a closed-door game or valid home crowd total. No secondary guess was substituted.

The integration updated 89 all-FBS school-seasons. The 64 target source additions involving primary season/game evidence include eight explicitly mixed CFBD-plus-official-game reconstructions; they are not all official NCAA annual totals. Six existing NCAA totals received exact-match primary provenance upgrades. Official NCAA season totals, official school cumulative totals, game reconstructions and secondary comparisons remain distinguishable. National NCAA annual attendance PDFs for 2021–2024 were not fully obtained; school primary reports and reconstructed games filled accessible gaps.

The old first-December-home-game heuristic incorrectly marked 29 games as postseason, including late-November games stored on December 1 UTC and 2020 December regular-season dates. Those flags were corrected. Arizona State's 2013 championship against Stanford was explicitly excluded; its regular home total is 431,974. Neutral and postseason games are excluded from reconstructed home totals. Source-native official totals retain their provider's definition with conflicts recorded.

All 51 distinct school-years underlying 71 legacy attendance comparisons were investigated; 29 primary school cumulative PDFs were recovered. Forty-four preferred-selection or scope decisions now have primary support, while 27 legacy comparisons remain unreconciled. A resolved preferred selection does not imply that the alternative number's discrepancy has been completely explained. The conflict table retains both. Pandemic restrictions and schedules in 2020 are separately flagged; zero attendance is used only with source support. Attendance remains announced/reported attendance, not audited people through turnstiles.

Six historical capacity observations were added. Only 15 eligible school-seasons currently have annual historical capacity, and 14 support utilization. All 79 current-vintage CFBD venue capacities are separately retained; none is propagated backward. Baylor's move from Floyd Casey to McLane is explicit. NC State 2021's official rounded capacity is labeled approximate. No multi-venue game-weighted capacity was invented.

## Coaching contracts

The table contains all 79 programs but only six newly verified original-report 2026 guaranteed salary observations: UNLV $3.5M, Colorado State $2.4M, Boise State $2.1M, Washington State $2.0M, San Diego State $1.9531M and Oregon State $1.6M. These are reported pre-bonus guarantees, not full executed-contract audits. Twenty-three official appointment/extension announcements supplement role and duration evidence. Fifty-eight rows have at least one numeric salary/AAV/duration/expiry observation; 21 do not. No program has every required current guarantee, expiration, both buyouts, assistant pool and bonus field complete. The stricter current-term metric audit intentionally reports fewer usable observations than broad numeric-row counts.

Current-role corrections for Maryland, NC State and Baylor preserve former-coach contracts and dated historical 2025 pay. Interim-coach pay is not inferred from the former coach. EADA average salaries are never substituted for football payroll. Total NCAA football compensation, assistant pools, strength pay, head-coach cash and contract AAV remain separate. Private-school estimates remain estimates.

## NIL, athlete revenue sharing and conference distributions

All 263 existing NIL/roster source observations are preserved with sport, season, publication date and measure classifications. Institutional budgets, actual payments, football allocations, third-party estimates and total roster estimates are not added into incompatible totals. Athletic estimates available through secondary reprints have reduced confidence. Conflicting NC State estimates remain competing observations. No NIL-NCAA source was added.

FY2025 NCAA institutional NIL categories are not full-year House-settlement FY2026 expenditures. A zero in that category does not indicate no third-party NIL. Official FY2026 NCAA guidance was preserved: submissions are due January 15, 2027; public release timing is not guaranteed. Institutional NIL payments (category 44), scholarships (20), Alston benefits (43) and capital (56) are distinct. Football allocations remain missing unless specifically disclosed.

The 594 historical IRS distribution source records are preserved. Of 602 historically eligible target school-years, 589 have a distribution observation. Ten Big 12 FY2016 Schedule I recipient payments remain missing; observed ProPublica document routes returned HTTP 403. No equal-share allocations were invented. Actual IRS cash payments remain separate from NCAA conference/media revenue and projected media contracts. Recipient membership and fiscal-year timing govern the denominator, not current membership.

## Performance, recruiting and original source preservation

The 2005–2025 SP+ and FPI source series are byte-identical to Phase 3. All 384 overall/offensive/defensive 2015 SP+ rank checks agree with competition ranks computed diagnostically from returned rounded ratings. Ohio State offense (12 vs published 14), Baylor overall (12 vs 13), and Maryland offense (86 vs 87) are consistent with tied displayed ratings. Tie order, precision or publication vintage could explain differences; no authoritative revision proves the exact cause, so original ranks remain unchanged. Derived diagnostics never replace source ranks. Overall SP+ rank/rating coverage is complete for eligible seasons; missing special-teams fields explain lower strict all-field coverage.

EADA, recruiting player/class data, portal entries, modern and extended SP+/FPI and IRS distributions were not recollected or duplicated. Their original file hashes are verified. Recruiting star/top-threshold counts with missing player fields are flagged lower bounds, not fully verified totals; raw values are retained. Class-rank coverage alone does not establish star/count completeness.

## Formulas, reproducibility and validation

Financial means = sum of usable source-specific annual observations / observed count, with n and required n retained. NCAA comparisons are nominal USD. Retained EADA real-dollar comparisons use annual CPI-U: nominal amount × CPI-U(2025) / CPI-U(source year). No full-year 2026 CPI is invented. These separate accounting series must not be averaged together.

Reconstructed attendance average = eligible regular non-neutral home attendance / home games. Utilization = average home attendance / independently verified same-season capacity; otherwise blank. Performance 5/10/20-year means equally weight available eligible FBS seasons with expected and observed denominators shown. No rating systems are spliced and no missing source rank is inferred for publication.

Run scripts/integrate_phase4.py and then scripts/prepare_review_artifacts.py using pandas/lxml. They rebuild normalized source integration offline from the preserved Phase 3 archive and raw observations. scripts/build_workbooks.mjs uses @oai/artifact-tool with PHASE4_ROOT set to this package directory. Run scripts/finalize_phase4.py for source-hash checks, workbook readback, reports and packaging. External recollection is access-dependent; the offline build reproduces the integration from included evidence and does not promise automatic retrieval of CAPTCHA-protected exports. No API keys or login credentials are required or included.

Validation passed for 79 unique panel schools and unchanged ranks, preserved Phase 3 archive hash, nine untouched source-family hashes, 384/384 rank diagnostics and exported workbook error-cell/readback checks. Workbook coverage percentages are formulas with explicit denominators. Reports, change log and conflicts reflect this integration; the package includes an SHA-256 manifest and original evidence. Detailed results are in validation_results.json and workbook_validation.json. Some underlying raw datasets are inherited from Phase 3 and have not been independently reaudited in full.

Primary references: https://knightnewhousedata.org/ ; https://knightnewhousedata.org/about-the-data ; https://knightnewhousedata.org/form/data-download ; https://knightnewhousedata.org/reports . Every new observation's specific source URL, retrieval date and raw-file reference is retained in the source tables and registry. Knight-Newhouse College Athletics Database supplies the financial display observations.
