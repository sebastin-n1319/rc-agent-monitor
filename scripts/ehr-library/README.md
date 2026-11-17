# EHR library (Adit Expert, both teams)

`content/guides/ehr-library.html` is one section per EHR Adit integrates with. It is rebuilt once a month
(scheduled task "EHR library monthly refresh"), and any time the sources change. Nothing is pushed without
Sebastin's approval.

## Sources
1. Adit Integration Rulebook (Google Sheet 1k2pdB943-FCtQbCyLcmMRV5oKhw6cJI5QQ0OXCIGUvg): export as .xlsx to `work/rulebook.xlsx`, run `python3 rulebook.py`.
2. Patient Form PMS field integration (Google Sheet 1j7Td_thcn_UUk6DwqzkjlTckmSh95Mjyz6iHnrMxA4k): export as .xlsx to `work/pmsfields.xlsx`, run `python3 pms.py`.
3. Adit Help Center articles per EHR: `python3 helpcenter.py` (public Help Center API).
4. Adit EHR technical documentation (Drive folder 1L2tV1O4pcGTIsxRpnbTjbOBAjLYCHaf4): export each changed doc as .zip into `work/docs/<doc>/`. Check every image by eye first (patient names, birth dates, real practice names, emails), update EXCLUDE and BLUR in `docimages.py`, then run it. A new document for an EHR also goes into the EHR integration notes (`content/guides/ehr-integrations.html`).
5. Desk tickets, last 12 months, per EHR (Desk and CRM data, read-only): update `tickets.json` from these two queries
   (EHR = coalesce of the deal's `j_ehr` and `j_pms_sales`):
   - overall: count of tickets by `cf_ai_category_by_llm` per EHR, top 8;
   - EHR topics: count by `cf_ai_sub_category_by_llm` where the category mentions EHR, server app, form or sync, top 12.
   Also check live deals per EHR (stages CSM, Onboarding, Getting Started, Closed On): every EHR with live deals must have a section; add one (with a notes file) for any new one.
6. Public vendor help for each EHR: `notes/<ehr>.md`, one fact per line with its source link. Re-check the links and add what changed. Never copy vendor articles or vendor screenshots; link to them.
7. Expert questions that went unanswered (Expert admin, gaps): anything about an EHR becomes a fix in the notes or a team note.

Then `python3 build.py`, check the diff, bump `CACHE_VERSION` in public/sw.js, add a line to docs/tool-guide.md, run the tests, and ask before pushing.
