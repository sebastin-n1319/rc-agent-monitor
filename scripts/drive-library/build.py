# Builds content/guides/library.html (internal Expert guide 'library', both teams) from the product and process documents
# listed in sources.json, exported from Google Drive into raw/<id>.md (Google Docs as Markdown, Slides as text, PDFs with
# pdftotext). Images are left out (text only). Personal email addresses are removed (role addresses such as support are kept, written in words),
# Google Docs, Asana and Avoma links keep only their text, and sections longer than about 5,000 characters are split.
import os, re, json, subprocess, html
W = os.path.dirname(os.path.abspath(__file__)); J = lambda *p: os.path.join(W, *p)
E = lambda s: html.escape(str(s), quote=False)
ROLE = re.compile(r'^(support|billing|sales|onboarding|help|payments?|aditpay|accounts?|info|noreply|no-reply|voip|ai|team|hello|care|success|porting|orders?)$', re.I)

def clean_md(t):
    t = re.sub(r'!\[[^\]]*\]\([^)]*\)', '', t)                      # inline images
    t = re.sub(r'!\[\]\[image\d+\]', '', t)
    t = re.sub(r'^\[image\d+\]:.*$', '', t, flags=re.M)               # image definitions (base64)
    t = re.sub(r'\[([^\]]*)\]\((?:https?\\?://)?(?:docs\.google\.com|drive\.google\.com|app\.asana\.com|app\.avoma\.com)[^)]*\)', r'\1', t)
    t = re.sub(r'https?\\?://(?:docs\.google\.com|drive\.google\.com|app\.asana\.com|app\.avoma\.com)\S*', '', t)
    def mail(m):
        local = m.group(1)
        return (local + ' at ' + m.group(2)) if ROLE.match(local) else '[staff email]'  # role addresses kept in words
    t = re.sub(r'\b([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b', mail, t)
    return t

def to_html(md, prefix, plain=False):
    if plain:
        paras = [p.strip() for p in re.split(r'\n\s*\n', md) if p.strip()]
        return ''.join('<p>' + E(re.sub(r'[ \t]+', ' ', p)).replace('\n', '<br>') + '</p>' for p in paras)
    return subprocess.run(['pandoc', '-f', 'markdown', '-t', 'html', '--id-prefix=' + prefix], input=md, capture_output=True, text=True).stdout

def split_long(x, prefix, title, limit=5000):
    """Headings become h2/h3 (h4+ bold), and any part longer than `limit` characters of text is split at paragraph ends."""
    x = re.sub(r'<h1([^>]*)>', r'<h2\1>', x); x = re.sub(r'</h1>', '</h2>', x)
    x = re.sub(r'<h([4-6])[^>]*>(.*?)</h\1>', r'<p><b>\2</b></p>', x, flags=re.S)
    x = re.sub(r'<h([23])>(.*?)</h\1>', lambda m: f'<p><b>{m.group(2)}</b></p>', x, flags=re.S)  # headings without an id
    parts = re.split(r'(<h[23] id="[^"]+"[^>]*>.*?</h[23]>)', x, flags=re.S)
    out, n = [], 0
    for p in parts:
        if re.match(r'<h[23] id=', p): out.append(p); continue
        if len(re.sub(r'<[^>]+>', '', p)) <= limit: out.append(p); continue
        blocks = re.split(r'(?<=</p>)|(?<=</ul>)|(?<=</ol>)|(?<=</table>)', p); cur = ''
        for b in blocks:
            if cur and len(re.sub(r'<[^>]+>', '', cur + b)) > limit:
                out.append(cur); n += 1; out.append(f'<h3 id="{prefix}part{n}">{E(title)} (continued, part {n})</h3>'); cur = ''
            cur += b
        out.append(cur)
    return ''.join(out)

S = json.load(open(J('sources.json')))
docs = [s for s in S['sources'] if not s.get('skip')]
areas = sorted({s['area'] for s in docs})
out = ['<h1 id="library">Team documents library (product and process documents from Google Drive)</h1>'
       '<p>Adit\'s own product and process documents: SOPs, playbooks, training guides, master documents and FAQs, by product area. '
       'Each section names the document it comes from. Sales playbooks describe how a product is sold and priced; prices, credits and dates '
       'in them may have changed, so check the client\'s package before quoting. Each document title carries the date it was last updated. Documents '
       'can be out of date: where one disagrees with a team rule, a product update, a reviewer decision, the Help Center or how the team has '
       'handled the same request in recent tickets, the newer source wins; say which you followed.</p>']
missing, built = [], 0
for area in areas:
    for s in [d for d in docs if d['area'] == area]:
        f = J('raw', s['id'] + '.md')
        if not os.path.exists(f): missing.append(s['title']); continue
        raw = clean_md(open(f, errors='ignore').read())
        if len(re.sub(r'\s+', '', raw)) < 200: missing.append(s['title'] + ' (no text)'); continue
        key = 'lib' + re.sub(r'[^a-z0-9]', '', s['id'].lower())[:10]
        x = to_html(raw, key + '-', plain=s['mime'] in ('pdf', 'slides'))
        x = re.sub(r'<img[^>]*>', '', x)
        x = split_long(x, key + '-', s['title'])
        upd = (', updated ' + s['modified'][:10]) if s.get('modified') else ''   # Batch 387: Expert weighs a document by its date
        out.append(f'<h1 id="{key}">{E(s["title"])} ({E(area)}{upd})</h1>' + x); built += 1
s = '\n'.join(out) + '\n'
s = s.replace('–', '-').replace('—', '-')
open(J('..', '..', 'content', 'guides', 'library.html'), 'w').write(s)
print('built', built, 'docs,', len(s), 'chars; not built:', missing)
