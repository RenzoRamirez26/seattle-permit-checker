# Websites and data sources

Everything the code talks to, what it is for, and whether you need to sign up.

## Called by the code

| Service | Host | Used in | Key or account | Notes |
| --- | --- | --- | --- | --- |
| Claude API | `api.anthropic.com` | `checker/extract.py`, `checker/agent.py` | **API key** (`ANTHROPIC_API_KEY`) from console.anthropic.com | The only paid service. Not needed for the demo plans or the tests |
| Seattle open data (Socrata) | `cos-data.seattle.gov` | `pipeline/seattle.py` | None. Optional free app token (`SEATTLE_APP_TOKEN`) from data.seattle.gov raises the rate limit | Datasets below |
| Seattle zoning layer (ArcGIS) | `services.arcgis.com` | `checker/zoning.py` | None | `Current_Land_Use_Zoning_Detail_2/FeatureServer/0` |
| US Census geocoder | `geocoding.geo.census.gov` | `checker/zoning.py` | None | Turns a street address into a point |
| Hugging Face (optional) | `huggingface.co` | `checker/voice.py` | None for these public models | Whisper and Kokoro models download on first use |
| GitHub Actions | `github.com` | `.github/workflows/tests.yml` | Your GitHub account | Runs the tests on every pull request |

## Seattle datasets

All published by the Seattle Department of Construction and Inspections (SDCI). Field names were read from live records on 20 November 2026.

| Dataset | ID | One row is | Fields used |
| --- | --- | --- | --- |
| Building Permits | `76t5-zqzr` | A permit | `permitnum`, `description`, `permittypedesc`, `permitclassmapped`, `estprojectcost`, `applieddate`, `issueddate`, `statuscurrent`, `numberreviewcycles`, `totaldaysplanreview`, `daysplanreviewcity`, `daysoutcorrections`, `originaladdress1`, `link` |
| Plan Review | `tqk8-y2z5` | One review step of a permit | `permitnum`, `reviewcycle`, `reviewtype`, `reviewteam`, `reviewteamassigndate`, `reviewerfinishdate`, `reviewresultdesc`, `description`, `applieddate` |
| Plan Comments | `e285-aq8h` | One reviewer comment | `permitnum`, `reviewtype`, `reviewcycle`, `commentsubject`, `comment`, `documenttitle`, `url`, `documentdate` |

Things to know:

- **Plan Comments is a sample**: about 26,300 comments on 707 permits, January 2022 to September 2025.
- **The download is filtered by keyword** on the city's server (restaurant, café, salon, retail and so on), because all commercial permits since 2019 is about 194,000 permit rows and 350,000 review rows.
- **Reviewer names** are in Plan Review. `pipeline/seattle.py` leaves them out of the database.
- **No floor plans** are in these datasets. Comment rows link to the correction letter.

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
- **Emory DSFSG_PERMIT** (metro Atlanta permit records). A different city; the first version of this project used its column names.
