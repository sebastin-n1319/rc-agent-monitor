# AI Agent knowledge (Expert)

Builds `content/guides/ai-agent.html` (doc id `aiagent`, internal, both Experts) from:

- AI Agent - Master Document (Drive `1XloIAG50Nj5e8_KNSlzGsdjOechB2Xnkrbj8ODjQ_1c`): `docs/master.md`, exported as Markdown from the "Intro to Adit AI Agent" heading on. The competitor comparison is left out.
- AI_Agent_Master_Document_Redrafted (Drive `1wTXXIpK19rhkcb203ZqlfqC6oyfcp4n2e0WfaSlyT4k`): `docs/redrafted.md`. Only its FAQ is used.

Run `python3 build.py`. When either document changes, check the `DIFF` list in `build.py` (where the two disagree) still holds.
