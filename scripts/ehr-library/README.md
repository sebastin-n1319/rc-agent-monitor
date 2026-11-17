# EHR library (Adit Expert, both teams)

`content/guides/ehr-library.html` is one section per EHR Adit integrates with. It is rebuilt once a month
(scheduled task "EHR library monthly refresh"), and any time the sources change. Nothing is pushed without
Sebastin's approval.

## Sources
1. Adit Integration Rulebook (Google Sheet 1k2pdB943-FCtQbCyLcmMRV5oKhw6cJI5QQ0OXCIGUvg): export as .xlsx to `work/rulebook.xlsx`, run `python3 rulebook.py`.
2. Every link inside the rulebook is a source too: open each one (cell hyperlinks, for example the field-list links and the Orthodontics tab's Reference Documents list). Today that is the Dental "Patient Forms EHR Fields List" (Google Sheet 11lRwVlOOScGRyoAf0BQN8wv09omyWYCcehsxxtVQGPc, export as `work/dentalfields.xlsx`, read by pms.py) and the eleven Ortho reference documents (export each as Markdown into `work/ortho/<doc>.md`, look at every embedded image yourself, update EXCLUDE and BLUR in `orthoimages.py` and run it: it writes the checked screenshots and `ortho-docs/*.md`; drop client practice names and struck-out text). A new link means a new source to add.
3. Patient Form PMS field integration (Google Sheet 1j7Td_thcn_UUk6DwqzkjlTckmSh95Mjyz6iHnrMxA4k): export as .xlsx to `work/pmsfields.xlsx`, run `python3 pms.py`.
4. Adit Help Center articles per EHR: `python3 helpcenter.py` (public Help Center API).
5. Adit EHR technical documentation (Drive folder 1L2tV1O4pcGTIsxRpnbTjbOBAjLYCHaf4): export each changed doc as .zip into `work/docs/<doc>/`. Check every image by eye first (patient names, birth dates, real practice names, emails), update EXCLUDE and BLUR in `docimages.py`, then run it. A new document for an EHR also goes into the EHR integration notes (`content/guides/ehr-integrations.html`).
6. Desk tickets, last 12 months, per EHR (Desk and CRM data, read-only): update `tickets.json` from these two queries
   (EHR = coalesce of the deal's `j_ehr` and `j_pms_sales`):
   - overall: count of tickets by `cf_ai_category_by_llm` per EHR, top 8;
   - EHR topics: count by `cf_ai_sub_category_by_llm` where the category mentions EHR, server app, form or sync, top 12.
   Also check live deals per EHR (stages CSM, Onboarding, Getting Started, Closed On): every EHR with live deals must have a section; add one (with a notes file) for any new one.
7. Public vendor help for each EHR: `notes/<ehr>.md`, one fact per line with its source link. Re-check the links and add what changed. Never copy vendor articles or vendor screenshots; link to them.
8. Expert questions that went unanswered (Expert admin, gaps): anything about an EHR becomes a fix in the notes or a team note.

Then `python3 build.py`, check the diff, bump `CACHE_VERSION` in public/sw.js, add a line to docs/tool-guide.md, run the tests, and ask before pushing.
