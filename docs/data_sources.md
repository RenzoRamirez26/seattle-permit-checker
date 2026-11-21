# Websites and data sources

Everything the code talks to, what it is for, and whether you need to sign up.

## Called by the code

| Service | Host | Used in | Key or account | Notes |
| --- | --- | --- | --- | --- |
| Claude API | `api.anthropic.com` | `checker/extract.py`, `checker/agent.py` | **API key** (`ANTHROPIC_API_KEY`) from console.anthropic.com | The only paid service. Not needed for the demo plans or the tests |
| Seattle open data (Socrata) | `cos-data.seattle.gov` | `pipeline/seattle.py` | None. Optional free app token (`SEATTLE_APP_TOKEN`) from data.seattle.gov raises the rate limit | Datasets below |
| Seattle zoning layer (ArcGIS) | `services.arcgis.com` | `checker/zoning.py` | None | `Current_Land_Use_Zoning_Detail_2/FeatureServer/0` |
| US Census geocoder | `geocoding.geo.census.gov` | `checker/zoning.py` | None | Turns a street address into a point |
| Hugging Face (optional) | `huggingface.co` | `checker/voice.py` | None for this public model | The Whisper model downloads on first use |
| GitHub releases (optional) | `github.com/thewh1teagle/kokoro-onnx` | `checker/voice.py` | None | Kokoro's model and voices files download into `data/models/` on first use |
| GitHub Actions | `github.com` | `.github/workflows/tests.yml` | Your GitHub account | Runs the tests on every pull request |

## Seattle datasets

All published by the Seattle Department of Construction and Inspections (SDCI). Field names were read from live records on 20 November 2026.

| Dataset | ID | One row is | Fields used |
| --- | --- | --- | --- |
| Building Permits | `76t5-zqzr` | A permit | `permitnum`, `description`, `permittypedesc`, `permitclassmapped`, `estprojectcost`, `applieddate`, `issueddate`, `completeddate`, `statuscurrent`, `numberreviewcycles`, `totaldaysplanreview`, `daysplanreviewcity`, `daysoutcorrections`, `originaladdress1`, `link` |
| Plan Review | `tqk8-y2z5` | One review step of a permit | `permitnum`, `reviewcycle`, `reviewtype`, `reviewteam`, `reviewteamassigndate`, `reviewerfinishdate`, `reviewresultdesc`, `description`, `applieddate` |
| Plan Comments | `e285-aq8h` | One reviewer comment | `permitnum`, `reviewtype`, `reviewcycle`, `commentsubject`, `comment`, `documenttitle`, `url`, `documentdate` |

Things to know:

- **Plan Comments is a sample**: about 26,300 comments on 707 permits, January 2022 to September 2025.
- **The download is filtered by keyword** on the city's server (restaurant, café, salon, retail and so on), because all commercial permits since 2019 is about 194,000 permit rows and 350,000 review rows.
- **Reviewer names** are in Plan Review. `pipeline/seattle.py` leaves them out of the database.
- **No floor plans** are in these datasets. Comment rows link to the correction letter.

## Columns in `data/permits.sqlite`

The pipeline stores the three datasets under our own names, all lower case with underscores
(`pipeline/schema.py`). The city's field names appear only in `pipeline/seattle.py`, where each
record is mapped. The database is rebuilt by the pipeline, never migrated: a file with other
column names is refused with a message that says to run `python -m pipeline.run_pipeline --seattle`.

**`permits`**: one row per permit. Key: `permit_number`.

| Column | From the city's field | Notes |
| --- | --- | --- |
| `permit_number` | `permitnum` | |
| `address` | `originaladdress1` | |
| `description` | `description` | |
| `category` | (ours) | `food_drink`, `retail`, `salon`, `fitness` or empty, by keyword (`pipeline/classify.py`) |
| `permit_class` | `permitclassmapped` | For example "Non-Residential" |
| `permit_type` | `permittypemapped` / `permittypedesc` | The two joined with a slash |
| `work_type` | `permittypedesc` | For example "Addition/Alteration" |
| `is_alteration` | (ours, from `permittypedesc`) | 1 for an addition or alteration, else 0. Statistics count these only |
| `status` | `statuscurrent` | |
| `estimated_cost` | `estprojectcost` | |
| `contractor` | `contractorcompanyname` | A company name |
| `latitude`, `longitude` | `latitude`, `longitude` | |
| `applied_date`, `issued_date`, `completed_date` | `applieddate`, `issueddate`, `completeddate` | ISO dates |
| `review_rounds` | `numberreviewcycles` | |
| `days_in_review` | `totaldaysplanreview` | |
| `days_first_round` | `daysinitialplanreview` | |
| `days_with_city` | `daysplanreviewcity` | |
| `days_with_applicant` | `daysoutcorrections` | Days the applicant held the plans making corrections |
| `record_url` | `link` | The permit's page on the Seattle Services Portal |
| `raw` | (the whole record) | As downloaded, as JSON |

**`plan_reviews`**: one row per review step. Key: `permit_number`, `review_round`, `review_type`, `review_team`, `assigned_date`.

| Column | From the city's field |
| --- | --- |
| `permit_number` | `permitnum` |
| `review_round` | `reviewcycle` |
| `review_type`, `review_team` | `reviewtype`, `reviewteam` |
| `assigned_date`, `finished_date` | `reviewteamassigndate`, `reviewerfinishdate` |
| `result` | `reviewresultdesc` |
| `complexity` | `reviewcomplexitydesc` |
| `permit_class` | `permitclassmapped` |
| `work_type` | `permittypedesc` |
| `description`, `applied_date`, `address` | `description`, `applieddate`, `originaladdress1` |
| `category` | (ours, as in `permits`) |

The city's `reviewer` field (a person's name) is not stored.

**`plan_comments`**: one row per reviewer comment. No key; each load replaces the table.

| Column | From the city's field |
| --- | --- |
| `permit_number` | `permitnum` |
| `review_type`, `review_round` | `reviewtype`, `reviewcycle` |
| `subject_raw` | `commentsubject` |
| `chapter`, `subject` | (ours) the code chapter number and a tidied subject, from `commentsubject` |
| `comment` | `comment` |
| `letter_title`, `letter_url`, `letter_date` | `documenttitle`, `url`, `documentdate` (the correction letter) |

**Summary keys** returned by `pipeline.query.review_summary` and carried in the audit result under
`local_review_data.summary`: `permits`, `share_one_round`, `share_two_or_more_rounds`,
`median_review_rounds`, `median_days_in_review`, `median_days_with_city`, `median_days_with_applicant`.

## Read by people, not by code

Used to write and check the rulebook. No API; open them in a browser.

| What | Where |
| --- | --- |
| 2021 Seattle Building Code, by chapter (PDF) | seattle.gov, SDCI > Codes > Seattle Building Code |
| Seattle Municipal Code Title 23 (Land Use Code) | library.municode.com/wa/seattle |
| Food business handbook: permits, licences, location | seattle.gov, Office of Economic Development |
| Food business plan review | kingcounty.gov, Public Health - Seattle & King County |
| Washington State Building Code amendments (WAC 51-50) | app.leg.wa.gov |

## Looked at and not used

- **ArchCAD-400K** (5,538 drawings cut into 413,062 samples, for detecting symbols such as doors and walls in CAD files). It is mostly large public and commercial buildings averaging about 11,000 square metres, its text was removed for anonymity (so no dimensions or room names), and its baseline model was trained on 8 GPUs. It does not contain small-business tenant plans and has no code-compliance labels.
- **Emory DSFSG_PERMIT** (metro Atlanta permit records). A different city; the first version of this project used its column names, which were replaced in November 2026.
