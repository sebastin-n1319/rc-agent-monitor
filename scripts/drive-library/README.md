# Team documents library (Expert)

Builds `content/guides/library.html` (doc id `library`, internal, both Experts, ranked a little below the curated guides and
the Help Center) from the Google Drive documents in `sources.json`.

## Refresh (weekly, with the Expert knowledge source check)

1. For every source in `sources.json` without `skip`: if its Drive modifiedTime is later than `imported_at`, export it again
   into `raw/<id>.md` (Google Docs: download as text/markdown; Slides: text/plain; PDFs: download, then `pdftotext -layout`).
   Sheets are written by hand into `raw/<id>.md` (see the `note` on the source): never copy login or account columns.
2. Look for NEW documents: search Drive for titles containing SOP, Playbook, Runbook, Process, Guide, Master, FAQ,
   Troubleshoot, Training, Manual, Rulebook or Checklist modified in the last 8 days (Docs, Sheets, Slides, PDFs).
3. Add a new document when it explains an Adit product, setting, process or support procedure. Leave out, and list for
   Sebastin instead: HR and people documents (leave, insurance, payroll, appraisals, hiring), scorecards, audits, quiz
   responses, data exports or client lists, meeting transcripts and Gemini notes, anything with logins or passwords,
   copies or older versions of a document already in the list, and image-only PDFs.
4. Run `python3 build.py`, then the checks in `tests/unit/guides-internal.test.js`. Set `imported_at` on each source you
   exported. Do not change seeded team rules in lib/expert.js yourself: list rule conflicts for Sebastin.
