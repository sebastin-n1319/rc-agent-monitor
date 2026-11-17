# Screenshots inside the Ortho reference documents (Google Docs exported as Markdown into work/ortho/<doc>.md,
# images embedded as data URIs). Each was checked by eye: EXCLUDE has patient names, birth dates, photos,
# personal emails or real client practice names; BLUR boxes (x1, y1, x2, y2, original pixels) hide a staff email.
# Writes content/guides/img/ortho/<doc>_<ref>.webp and rewrites ortho-docs/<doc>.md with {{IMG:<ref>}} markers.
import re, os, io, base64, json
from PIL import Image, ImageFilter
W = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(W, '..', '..', 'content', 'guides', 'img', 'ortho')
DOCS = ['os_changes', 'orthotrac_ob', 'contact_status', 'multiloc_sales', 'multiloc_os', 'multisingle_ob']
EXCLUDE = {'os_changes_image3', 'os_changes_image5', 'os_changes_image11', 'orthotrac_ob_image2', 'orthotrac_ob_image8',
           'contact_status_image1', 'contact_status_image2', 'contact_status_image3', 'contact_status_image5', 'contact_status_image11',
           'contact_status_image12', 'contact_status_image13', 'multiloc_sales_image3', 'multiloc_sales_image4', 'multiloc_os_image1'}
BLUR = {'os_changes_image1': [(215, 64, 390, 84)]}
os.makedirs(OUT, exist_ok=True)
kept = {}
for d in DOCS:
    s = open(os.path.join(W, 'work', 'ortho', d + '.md')).read()
    refs = dict(re.findall(r'^\[([^\]]+)\]:\s*<data:image/[a-z]+;base64,([^>]+)>', s, re.M))
    s = re.sub(r'^\[[^\]]+\]:\s*<data:image[^>]*>\s*$', '', s, flags=re.M)
    def rep(m):
        ref = m.group(1); key = d + '_' + ref
        if ref not in refs or key in EXCLUDE: return ''
        if key not in kept:
            im = Image.open(io.BytesIO(base64.b64decode(refs[ref]))).convert('RGB')
            for box in BLUR.get(key, []): im.paste(im.crop(box).filter(ImageFilter.GaussianBlur(6)), box)
            if im.width > 1400: im = im.resize((1400, int(im.height * 1400 / im.width)), Image.LANCZOS)
            im.save(os.path.join(OUT, key + '.webp'), 'WEBP', quality=82, method=6); kept[key] = True
        return ' {{IMG:' + ref + '}} '
    s = re.sub(r'!\[[^\]]*\]\[([^\]]+)\]', rep, s)
    # client practice names and a demo agreement link stay out of the library
    s = re.sub(r'\s*E\.g\. Depew Ortho using Rooster Grin', '', s)
    s = '\n'.join(l for l in s.split('\n') if 'enfolytics.com' not in l)
    open(os.path.join(W, 'ortho-docs', d + '.md'), 'w').write(s)
print(len(kept), 'images kept')
