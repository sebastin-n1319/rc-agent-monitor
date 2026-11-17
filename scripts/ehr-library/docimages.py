# Turns Adit's EHR technical documentation (Google Docs exported as .zip into work/docs/<doc>/) into
# content/guides/img/<doc>/*.webp and doc-images.json (section and context for each image).
# Images are checked by eye first: EXCLUDE lists any image with patient names, birth dates, real practice
# names or anything else private; BLUR lists boxes (x1, y1, x2, y2 in the original pixels) to blur, such as
# a staff email on a test record. A new image is never added without that check.
import re, glob, html, os, json
from PIL import Image, ImageFilter
W = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(W, '..', '..', 'content', 'guides', 'img')
DOCS = {'revolution': 'RevolutionEHR', 'ascend': 'Dentrix Ascend', 'opendental': 'Open Dental', 'curve': 'Curve Dental'}
EXCLUDE = {'ascend/images/image14.png', 'ascend/images/image18.png', 'ascend/images/image20.png', 'curve/images/image9.png',
           'revolution/images/image9.png', 'revolution/images/image4.png'}
BLUR = {f: [(725, y - 6, 850, y + 18)] for f, y in [('revolution/images/image11.png', 87), ('revolution/images/image2.png', 82), ('revolution/images/image21.png', 85),
        ('revolution/images/image22.png', 85), ('revolution/images/image3.png', 89), ('revolution/images/image6.png', 86), ('revolution/images/image8.png', 84)]}
BLUR['revolution/images/image17.png'] = [(885, 95, 1055, 128), (905, 795, 1330, 840)]
BLUR['revolution/images/image20.png'] = [(885, 95, 1055, 128)]
T = lambda x: html.unescape(re.sub('<[^>]+>', '', x)).strip()
manifest = {}
for d in DOCS:
    src_dir = os.path.join(W, 'work', 'docs', d)
    s = open(glob.glob(src_dir + '/*.html')[0]).read()
    ev = []
    for m in re.finditer(r'<h([1-4])[^>]*>(.*?)</h\1>', s, re.S): ev.append((m.start(), 'h', T(m.group(2))))
    for m in re.finditer(r'<img[^>]*src="([^"]+)"', s): ev.append((m.start(), 'i', m.group(1)))
    for m in re.finditer(r'<p[^>]*>(.*?)</p>', s, re.S): ev.append((m.start(), 'p', T(m.group(1))))
    ev.sort()
    cur, paras, order, seen = 'Overview', {}, [], set()
    for _, k, v in ev:
        if k == 'h':
            if v: cur = v
        elif k == 'p':
            if v: paras.setdefault(cur, []).append(v)
        else:
            p = d + '/' + v
            if p in EXCLUDE or p in seen: continue
            seen.add(p); order.append((cur, v))
    os.makedirs(os.path.join(OUT, d), exist_ok=True)
    out = []
    for cur, src in order:
        im = Image.open(os.path.join(src_dir, src)).convert('RGB')
        for box in BLUR.get(d + '/' + src, []): im.paste(im.crop(box).filter(ImageFilter.GaussianBlur(9)), box)
        if im.width > 1400: im = im.resize((1400, int(im.height * 1400 / im.width)), Image.LANCZOS)
        fn = os.path.splitext(os.path.basename(src))[0] + '.webp'
        im.save(os.path.join(OUT, d, fn), 'WEBP', quality=82, method=6)
        out.append({'section': cur, 'file': fn, 'ctx': ' '.join(paras.get(cur, []))[:700]})
    manifest[d] = out
json.dump(manifest, open(os.path.join(W, 'doc-images.json'), 'w'), indent=1)
print({d: len(v) for d, v in manifest.items()})
