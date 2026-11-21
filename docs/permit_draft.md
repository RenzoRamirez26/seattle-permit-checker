# Permit application preparation sheet: where each field comes from

`checker/permit_draft.py` turns a pre-check result into a short sheet that gathers what
the City of Seattle asks for when a small business applies for a construction permit for a
tenant improvement (an "addition or alteration" permit from the Seattle Department of
Construction and Inspections, SDCI).

The owner downloads it from the app as a PDF (`checker/pdf.py` lays out the same rows; two or
three pages when printed).

**It is a preparation aid. It is not the city's form and it does not fill in the city's form.**
The application itself is made in the Seattle Services Portal, which needs a login. Nobody on
this project has seen the portal's screens, so this sheet describes what the city's published
pages say you will be asked for. It does not reproduce the portal's field labels.

## How current is this

- The sources below were read on **20 and 21 November 2026**.
- **Source E, the commercial tenant improvement screening standards, is dated 1 January 2016.**
  It is the only city document found that lists what the plans and cover sheet must show
  (occupancy, construction type, occupant load, exits, use and area), and SDCI's permit page
  still links to it. Parts of it are out of date: it asks for stapled paper plan sets, which
  Tip 106 (2022) replaced with PDF uploads.
- Treat the field list as a starting point and check SDCI's current pages before relying on it.
  The sheet itself carries a line saying this.

## Sources

| ID | Document | Dated | Link |
| --- | --- | --- | --- |
| A | SDCI permit page, "Construction Permit - Addition or Alteration" | no date shown | https://www.seattle.gov/sdci/permits/permits-we-issue-(a-z)/construction-permit---addition-or-alteration |
| B | SDCI Tip 102, "Small Business: Getting Your Use and Building Permit from SDCI" | 25 July 2022 | https://www.seattle.gov/dpd/publications/cam/cam102.pdf |
| C | Seattle Services Portal help, "What Do I Need to Start a Building or Land Use Pre-Application?" | updated 12 November 2026 | https://seattlegov.zendesk.com/hc/en-us/articles/115006610027-What-Do-I-Need-to-Start-a-Building-or-Land-Use-Pre-Application |
| D | Seattle Services Portal help, "How to Submit a Construction or Land Use Pre-Application" | updated 2 September 2026 | https://seattlegov.zendesk.com/hc/en-us/articles/360009320073-How-to-Submit-a-Construction-or-Land-Use-Pre-Application |
| E | SDCI "Screening Standards - Commercial Tenant Improvement Alterations & Additions" | **1 January 2016** | https://www.seattle.gov/documents/Departments/SDCI/Forms/ConstPermitStandardsTenantImproveComm.pdf |
| F | SDCI "Screening & Submittal Checklist - Commercial Tenant Improvement Additions & Alterations" | March 2022 | https://www.seattle.gov/documents/Departments/SDCI/Forms/ConstPermitCklistTenantImproveComm.pdf |
| G | SDCI Tip 103, "Site Plan Guidelines and Requirements" | 20 August 2025 | https://www.seattle.gov/DPD/Publications/CAM/cam103.pdf |

C and D are on the city's help-center site (`seattlegov.zendesk.com`), which sources A and B
link to as the Seattle Services Portal help center. Page numbers below are pages of the PDF.

## Fields on the sheet

"Filled from the pre-check" means the value is copied from the audit result. Everything else
is printed as "to be filled in by the applicant". The sheet never guesses a value.

### For the Seattle Services Portal pre-application

| Field on the sheet | What the city source says | Source | Filled from the pre-check? |
| --- | --- | --- | --- |
| Project address | "Enter your project's site address and click search." / "the address of your project" | B p.2 (step 5); C; D | Only if an address was looked up for zoning |
| Applicant contact | "Provide the applicant and owner contact information." | B p.2 (step 6); C; D | No |
| Owner contact | "Add the Owner's contact information." | D; B p.2; C | No |
| Contractor contact | "contact information for the applicant, owner, and contractor" | C | No |
| Application name and project description | "Name your application something appropriate and provide a simple project description." | B p.2 (step 7) | A suggested description, built from the business type and floor area, marked for the applicant to edit |
| Project value | "the project value (labor and materials, including any donated labor and materials)"; "a 'fair market value' for your proposed project" | C; B p.2 (step 8), p.3 | No |
| Building code used | "the building code used for your project"; on the plans, "Code Edition (Such as year, including amendments)" | C; E p.4 | Yes: the code basis the pre-check used |
| Change to the building use or occupancy | The applicant "will also need to know" whether the project involves "a change to the building use or occupancy"; checklist lines "Change of use from last permit" and "Change of occupancy from last permit" | C; F p.1 | No |
| Parcel number | Site plan "with a legal description and parcel number"; "King County Assessor's parcel number (property tax account number)" | D; G p.2; A (step 1) | No |
| Legal description | "You will need to upload a site plan and a complete legal description for your site." | A (step 2); G p.2 | No |

### For the cover sheet and the plans

| Field on the sheet | What the city source says | Source | Filled from the pre-check? |
| --- | --- | --- | --- |
| Zone | Cover sheet includes "zone and proposed uses"; "check zoning and overlays" | E p.2; F p.1; A (step 1) | Yes, when the zone is known |
| Existing use (last permitted use) | "Identify existing use (Verify with Seattle DCI Microfilm records)"; "Last permitted use" | E p.5; F p.1 | No |
| Proposed use | "Identify proposed use" | E p.5 | Yes: the kind of business |
| Area of proposed use | "Identify area (in square feet) of proposed use" | E p.5 | Yes: the floor area in the plan reading |
| Type of occupancy | "Type of Occupancy" under Building Code Analysis and Documentation | E p.6 | Yes: the occupancy group the pre-check calculated |
| Occupant load calculations | "Occupant load calculations" under Means of Egress / Exiting Plan | E p.6 | Yes: the total and the room-by-room table |
| Exits and door swing | "Egress/Exiting Analysis"; "Show exit door (and swing) for each room" | E p.6 | Yes: exits shown and required, and each exit door's swing as read from the plan |
| Construction type | "Construction type" | E p.6 | No |
| Number of stories | "Number of stories" | E p.6 | No |
| Sprinkler system type, where provided | "Type of Sprinkler Systems provided" (listed, not marked as always required); cover sheet includes "fire protection" | E p.6, p.2 | Only whether the plan notes sprinklers. The system type is left to the applicant |

### Documents to upload

| Item on the sheet | What the city source says | Source |
| --- | --- | --- |
| Floor plan, key plan, site plan | "you need to provide a floor plan of the tenant space, a key plan (if there is more than one tenant in the building), and a site plan with parking details" | B p.3 |
| Key location plan for interior-only work | "We accept a 'key location' plan for projects including interior-only tenant improvements or alterations" | G p.2 |
| Statement of Financial Responsibility / Agent Authorization | Listed under required application forms | B p.3; E p.2; F p.2 |
| Waste Diversion Plan | "for projects greater than 750 square feet in area" | B p.3; E p.2 |

The sheet lists these as a checklist in the city's order. It does not decide whether the Waste
Diversion Plan applies and does not print the area threshold: it points to Tip 102.

## From the pre-check, in a separate section of the sheet

The permits and agencies, and the open problems to fix before submitting, come from the audit
result. They are not things the city's application asks for, and the sheet's heading says so.
Each open problem is one line, its title and how serious it is; the sheet points to the pre-check
report for the fix and the code section, so the two documents do not repeat each other.

## Left out, because no city source confirmed them as application fields

- **Restroom fixtures.** None of the sources asks for a fixture count. Fixture problems the
  pre-check found still appear in the open-problems list.
- **"Sprinklered: yes or no" as its own field.** Only the conditional "Type of Sprinkler Systems
  provided" line and the cover-sheet heading "fire protection" were found.
- **Occupant load as a typed portal field.** It is confirmed only as calculations on the plans.
- **Gross floor area as a portal entry.** Source D mentions entering "the gross floor area (GFA)
  of the proposed structure(s)", which is worded for new structures, not for a tenant space.
- **The other portal questions.** Tip 102 mentions "the remaining 4 items including a project
  value" and yes/no questions without naming them.
- **The share of the fee due at intake.** Source A says about 75 percent and source B about 80
  percent, so the sheet quotes neither.
- **The design-professional stamp threshold** (B p.2). It is a city number, and the sheet adds no
  numbers of its own.

## What the sheet does not do

It adds no rules. Every number on it is copied from the audit result (`checker/rules_engine.py`
decides; `checker/rules/seattle.json` holds the values). It carries the same disclaimer as the
pre-check report.
