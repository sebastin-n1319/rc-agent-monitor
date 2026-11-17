# Builds content/guides/pa-knowledge.html (internal Expert guide, both teams) from the Ask Adit Practice Analytics
# documents (Drive folder 19-Kt36N7-fzjP9RGq7EnwYmZii5XtWfY), exported as Markdown into docs/ with Avoma links,
# images and personal names removed. START HERE, the vetting test sets and the call register are not used.
import os, re, subprocess, html
W = os.path.dirname(os.path.abspath(__file__)); J = lambda *p: os.path.join(W, *p)
E = lambda s: html.escape(str(s), quote=False)
DOCS = [('ctx1', 'PA definitions (Ask Adit context, part 1)'), ('ctx2', 'PA by industry (Ask Adit context, part 2)'),
        ('ctx3', 'PA caveats, gaps and open questions (Ask Adit context, part 3)'), ('qb1', 'PA customer questions: Dental and Chiropractic'),
        ('qb2', 'PA customer questions: Orthodontics'), ('qb3', 'PA customer questions: Optometry'), ('qb4', 'PA customer questions: other')]
out = ['<h1 id="pa-knowledge">Practice Analytics knowledge (from 2,659 PA calls)</h1><p>What each Practice Analytics (PA) number means, '
       'how practices in each industry word their questions, where PA differs from the EHR or cannot do something, and the questions customers '
       'asked with whether PA can answer them. Written from PA training, follow-up and support calls for Ask Adit, the PA assistant. '
       'It is still being reviewed by the PA team: anything marked Needs confirmation, Confirm or disputed is NOT settled, so do not state it '
       'to a practice as fact; say what is known and check with the PA team. References like PA-1305 · 15:02 are the source call and minute. '
       'Benchmarks in it are not approved Adit guidance yet; do not quote them to practices.</p>']
for key, title in DOCS:
    md = open(J('docs', key + '.md')).read()
    x = subprocess.run(['pandoc', '-f', 'markdown', '-t', 'html', '--id-prefix=pa-' + key + '-'], input=md, capture_output=True, text=True).stdout
    x = re.sub(r'<img[^>]*>', '', x)
    x = re.sub(r'<h1[^>]*>.*?</h1>', '', x, flags=re.S)            # the document title is the h2 below
    x = re.sub(r'<h([4-6])[^>]*>', r'<p><b>', x); x = re.sub(r'</h[4-6]>', '</b></p>', x)
    x = re.sub(r'<h2 ', '<h3 ', x); x = re.sub(r'</h2>', '</h3>', x)
    x = re.sub(r'<h3 id="([^"]+)"[^>]*>(.*?)</h3>', lambda m: '<h3 id="' + m.group(1) + '">' + E(title.split(' (')[0]) + ': ' + re.sub('<[^>]+>', '', m.group(2)).strip() + '</h3>', x, flags=re.S)
    x = re.sub(r'<h3>(.*?)</h3>', lambda m: '<p><b>' + m.group(1) + '</b></p>', x, flags=re.S)
    out.append(f'<h2 id="pa-{key}">{E(title)}</h2>' + x)
s = '\n'.join(out) + '\n'
s = s.replace('–', '-').replace('—', '-')
open(J('..', '..', 'content', 'guides', 'pa-knowledge.html'), 'w').write(s)
print(len(s))
