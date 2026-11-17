# Builds content/guides/ai-agent.html (internal Expert guide, both teams) from the two AI Agent master documents:
#   AI Agent - Master Document (Drive 1XloIAG50Nj5e8_KNSlzGsdjOechB2Xnkrbj8ODjQ_1c), exported to docs/master.md
#   AI_Agent_Master_Document_Redrafted (Drive 1wTXXIpK19rhkcb203ZqlfqC6oyfcp4n2e0WfaSlyT4k), exported to docs/redrafted.md
# The Master Document is used in full except its linked table of contents and the competitor comparison (sales only).
# From the redraft only the FAQ is added; the rest repeats the Master Document. Where the two disagree, the guide says so.
import os, re, subprocess, html
W = os.path.dirname(os.path.abspath(__file__)); J = lambda *p: os.path.join(W, *p)
E = lambda s: html.escape(str(s), quote=False)

def to_html(md, prefix):
    x = subprocess.run(['pandoc', '-f', 'markdown', '-t', 'html', '--id-prefix=' + prefix], input=md, capture_output=True, text=True).stdout
    x = re.sub(r'<img[^>]*>', '', x)
    x = re.sub(r'<a href="https://docs\.google\.com[^"]*"[^>]*>(.*?)</a>', r'\1', x, flags=re.S)
    return x

def sections(md):
    """Split a Google Docs export into (title, body) by its level 1 headings."""
    out, cur, buf = [], None, []
    for line in md.split('\n'):
        m = re.match(r'^# (.+?)\s*$', line)
        if m:
            if cur is not None: out.append((cur, '\n'.join(buf)))
            cur, buf = re.sub(r'[*\\]', '', m.group(1)).strip(), []
        else: buf.append(line)
    if cur is not None: out.append((cur, '\n'.join(buf)))
    return out

DIFF = [
    ('Full-Time plan credits', 'The Master Document says 1,000 credits a month with $0.50 per extra credit (and that 99.5% of customers will not pay overages); the redraft says 400 credits. Both say After-Hours Only has 200 credits at $1 per extra credit and 1 credit = 1 call minute or 10 SMS threads.'),
    ('Release dates', 'The Master Document gives AI Front Desk with SMS in April 2026 and AI Care Coordinator and AI Web Chat in June 2026; the redraft gives March and May 2026.'),
    ('Languages', 'The Master Document lists 19 languages (English, Spanish, French, German, Portuguese, Japanese, Italian, Dutch, Korean, Vietnamese, French (Canada), Chinese (Simplified), Portuguese (Brazil), Russian, Turkish, Polish, Arabic, Persian, Hebrew) with Hindi on demand; the redraft lists 10, Hindi included.'),
    ('Insurance check', 'Both documents say the agent cannot yet check whether a patient\'s insurance is accepted and that this was planned for March 2026. Whether it is live now is not in either document.'),
    ('Eaglesoft', 'The Master Document says rescheduling and cancellation are not supported for Eaglesoft, and also lists Eaglesoft among the EHRs where a cancellation deletes the appointment instead of cancelling it.'),
]

out = ['<h1 id="ai-agent">AI Agent knowledge (AI Front Desk master documents)</h1>'
       '<p>How the Adit AI Agent works: the three agents, prerequisites, credits, every Getting Started setting (Configure Agent, Custom Messages, '
       'Practice Details, Booking Settings), how the agent handles each kind of call, what to check when it gets something wrong, and how '
       'interactions are labelled. From the AI Agent Master Document and its redraft (FAQ). Prices, credits and dates in these documents may '
       'have changed: do not quote them to a client without checking the client\'s package and the latest from the AI team. The AI support '
       'runbook says what T1 finishes and what goes to the AI Support Team.</p>',
       '<h2 id="ai-agent-diff">Where the two documents differ (check before quoting)</h2><ul>' +
       ''.join(f'<li><b>{E(t)}:</b> {E(b)}</li>' for t, b in DIFF) + '</ul>']

SKIP = re.compile(r'^(List of Contents|Competitor Comparison)', re.I)
for i, (title, body) in enumerate(sections(open(J('docs', 'master.md')).read())):
    if SKIP.match(title): continue
    if not body.strip() or not re.sub(r'^#+ .*$', '', body, flags=re.M).strip(): continue
    x = to_html(body, f'aim{i}-')
    x = re.sub(r'<h1[^>]*>.*?</h1>', '', x, flags=re.S)
    x = re.sub(r'<h2[^>]*>.*?</h2>', '', x, flags=re.S, count=1)       # repeats the section title
    x = re.sub(r'<h([2-6])[^>]*>(.*?)</h\1>', r'<p><b>\2</b></p>', x, flags=re.S)
    t = title.replace('\\>', '>').replace('Getting Started > ', 'Getting Started: ')
    out.append(f'<h2 id="ai-agent-m{i}">AI Agent: {E(t)}</h2>' + x)

red = open(J('docs', 'redrafted.md')).read()
for i, (title, body) in enumerate(sections(red)):
    if not title.lower().startswith('frequently asked'): continue
    parts = re.split(r'^## (.+?)\s*$', body, flags=re.M)
    for k in range(1, len(parts), 2):
        sub = re.sub(r'[*\\]', '', parts[k]).strip()
        x = to_html(parts[k + 1], f'aif{k}-')
        out.append(f'<h2 id="ai-agent-faq{k}">AI Agent FAQ: {E(sub)}</h2>' + x)

s = '\n'.join(out) + '\n'
s = s.replace('–', '-').replace('—', '-')
open(J('..', '..', 'content', 'guides', 'ai-agent.html'), 'w').write(s)
print(len(s), s.count('<h2'))
