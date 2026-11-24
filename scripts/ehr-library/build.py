# Builds content/guides/ehr-library.html from work/*.json, notes/*.md, tickets.json and doc-images.json. See README.md.
import json,re,html,os
W=os.path.dirname(os.path.abspath(__file__)); J=lambda *p: os.path.join(W,*p)
RB=json.load(open(J('work','rulebook.json'))); TK=json.load(open(J('tickets.json'))); DF=json.load(open(J('work','dentalfields.json'))); MAN=json.load(open(J('doc-images.json'))); DOCMAP={'revolution':'revolution','dentrix-ascend':'ascend','opendental':'opendental','curve':'curve'}; PMS=json.load(open(J('work','pms.json'))); KB=json.load(open(J('work','kb_ehr.json')))
E=lambda s: html.escape(str(s),quote=False)
LIB=[ # id, title, specialty, rulebook keys, pms keys, notes file, kb key, deep guide name
 ('dentrix','Dentrix (G6, G7)','Dental',['Dentrix'],['Dentrix'],'dentrix','dentrix','Dentrix (G6, G7)'),
 ('dentrix-ascend','Dentrix Ascend','Dental',['Dentrix Ascend'],['Dentrix Ascend'],'dentrixascend','ascend','Dentrix Ascend'),
 ('opendental','Open Dental (server and Open Dental Cloud)','Dental',['OpenDental','Opendental Cloud'],['OpenDental'],'opendental','opendental','Open Dental'),
 ('eaglesoft','Eaglesoft','Dental',['Eaglesoft'],['D:Eaglesoft'],'eaglesoft','eaglesoft','Eaglesoft'),
 ('cleardent','ClearDent','Dental',['Cleardent'],['D:Cleardent'],'cleardent','cleardent',None),
 ('softdent','SoftDent','Dental',['Softdent'],[],'softdent','softdent',None),
 ('tracker','Tracker','Dental',['Tracker'],['D:Tracker'],'tracker','tracker',None),
 ('practiceworks','PracticeWorks','Dental',['PracticeWork'],[],'practiceworks','practiceworks',None),
 ('easydental','Easy Dental','Dental',['EasyDental'],[],'easydental','easydental',None),
 ('denticon','Denticon (Planet DDS)','Dental',['Denticon (Planet DDS)'],['Denticon'],'denticon','denticon','Denticon'),
 ('practiceweb','PracticeWeb','Dental',['PracticeWeb (GOOD TO SELL)'],[],None,'practiceweb',None),
 ('abeldent','ABELDent','Dental',['Abledent'],['AbelDent'],'abeldent','abeldent',None),
 ('curve','Curve Dental','Dental',['Curve'],['Curve'],'curve','curve','Curve Dental'),
 ('officemate','OfficeMate','Optometry',['OfficeMate (On Prem)'],['Officemate'],'officemate','officemate',None),
 ('crystalpm','Crystal PM','Optometry',['Crystal PM (On Prem)'],['Crystal PM'],'crystalpm','crystal',None),
 ('revolution','RevolutionEHR','Optometry',['Revolution (Web)','RevEHR (Cloud)'],['Revolution'],None,'revolution','RevolutionEHR'),
 ('eyefinity','Eyefinity (Encompass)','Optometry',['Eyefinity','EyeFinity (Cloud)'],['Eyefinity'],None,'eyefinity','Eyefinity'),
 ('compulink','Compulink','Optometry',['Compulink ( On Prem )'],['Compulink'],'compulink','compulink',None),
 ('chirotouch','ChiroTouch (server and cloud)','Chiropractic',['Chirotouch (On Prem)','Chirotouch (Cloud)'],['ChiroTouch Server','ChiroTouch Cloud'],'chirotouch','chirotouch','ChiroTouch Cloud'),
 ('jane','Jane','Chiropractic',['Jane'],['Jane Chiro'],None,'jane','Jane'),
 ('eclipse','Eclipse','Chiropractic',['Eclips ( On Prem )'],[],'eclipse','eclipse',None),
 ('orthotrac','OrthoTrac','Orthodontics',['Orthotrac'],['OrthoTrac'],'orthotrac','orthotrac',None),
 ('dolphin','Dolphin Management','Orthodontics',['Dolphin'],['Dolphin'],'dolphin','dolphin',None),
 ('cloud9','Cloud 9','Orthodontics',['Cloud 9'],['Cloud9'],None,'cloud9','Cloud 9'),
 ('ortho2','Ortho2 Edge (not in the Integration Rulebook)','Orthodontics',[],[],'ortho2','ortho2',None),
]
ST={'yes':'Supported','limited':'Supported with limits','dev':'In development','ehr_lacks':'Not available (the EHR does not have this)','adit_cant':'Not offered by Adit (the EHR has it, Adit does not integrate it)','no':'Not supported','blank':None}
def rb_section(key,eid,name):
  d=RB[key]; h=[]
  label=key
  hdr=[f"{a}: {b}" for a,b in d['header'] if a and b and not a.startswith('Server App')]
  vs=[v for v in d['variants'] if v]
  h.append(f'<h2 id="lib-{eid}-rb-{re.sub(r"[^a-z0-9]+","-",key.lower()).strip("-")}">{E(name)}: what Adit supports ({E(key)}, Integration Rulebook)</h2>')
  p=[]
  if hdr: p+= [E(x) for x in hdr]
  if len(vs)>1: p.append('Rulebook columns (server app or build variants): '+E(', '.join(vs)))
  for n in sorted(set(d['notes'])): p.append('Note: '+E(n))
  if p: h.append('<p>'+'<br>'.join(p)+'</p>')
  cats={}
  for cat,lab,states in d['cats']:
    if not lab: continue
    ss=[s for s in states if s[1]!='blank']
    if not ss: continue
    kinds=set(s[1] for s in ss)
    notes=sorted(set(s[2] for s in ss if s[2]))
    if len(kinds)==1 and not str(list(kinds)[0]).startswith('text:'):
      k=list(kinds)[0]; txt=E(lab)
    else:
      parts=[]; grp={}
      for v,k,nn in ss:
        st=k[5:] if k.startswith('text:') else ST.get(k,k).split(' (')[0].lower()
        grp.setdefault(st,[]).append(v or 'default')
      for st,vv in grp.items(): parts.append(f"{st} on {', '.join(vv)}")
      k='mixed'; txt=E(lab)+' ('+E('; '.join(parts))+')'
    if notes: txt+=' ['+E(' / '.join(notes))+']'
    cats.setdefault(cat,{}).setdefault(k,[]).append(txt)
  for cat,g in cats.items():
    lines=[]
    for k in ['yes','limited','mixed','dev','ehr_lacks','adit_cant','no']:
      if k in g: lines.append(f"<b>{'Depends on version or build' if k=='mixed' else ST[k]}:</b> "+'; '.join(g[k]))
    for k in g:
      if k.startswith('text:'): lines.append(E(k[5:])+': '+'; '.join(g[k]))
    h.append(f'<h3 id="lib-{eid}-{re.sub(r"[^a-z0-9]+","-",(key+" "+cat).lower()).strip("-")}">{E(name)} ({E(key)}): {E(cat)}</h3><p>'+'<br>'.join(lines)+'</p>')
  return '\n'.join(h)
def pms_section(keys,eid,name):
  h=[]
  for k in keys:
    rows=PMS[k] if not k.startswith('D:') else DF[k[2:]]; lines=[]
    for v,notes in rows[1:]:
      if v[0] in ('True','PMS Fields','Patient Field Name'): continue
      f=v[0]; syn=next((x for x in v[1:] if x in ('True','False')),None)
      path=[x for x in v[1:] if x not in ('True','False')]
      path=[x for x in path if not re.search(r'(?i)insert into|select |update in|where |alter table|^-?>?\s*\(',x)]
      s=f
      if syn=='False': s+=': does not sync'
      elif syn=='True': s+=': syncs'
      if path: s+=(' to ' if syn!='False' else ' (')+ '; '.join(p.lstrip('-> ').strip() for p in path)[:220]+('' if syn!='False' else ')')
      if notes: s+=' ('+'; '.join(notes)+')'
      lines.append(E(s))
    if lines:
      h.append(f'<h3 id="lib-{eid}-pms-{re.sub(r"[^a-z0-9]+","-",k.lower())}">{E(name)}: patient form fields that write into the EHR ({E(k[2:]+', Patient Forms EHR Fields List' if k.startswith('D:') else k)})</h3><p>Form field to EHR field, from the Patient Form PMS field integration sheet. A field writes only when the form field is mapped (green cloud icon) and the form is approved and imported.<br>'+'<br>'.join(lines)+'</p>')
  return '\n'.join(h)
def notes_section(nf,eid,name):
  if not nf: return ''
  t=open(J('notes',nf+'.md')).read().split('\n')
  body=[l[2:].strip() for l in t if l.startswith('- ')]
  head=[l[3:] for l in t if l.startswith('## ')]
  return f'<h2 id="lib-{eid}-howitworks">{E(name)}: how the EHR itself works (public vendor and partner help)</h2><p>'+E(head[0] if head else name)+'<br>'+'<br>'.join(E(b) for b in body)+'<br>Vendor screenshots are on the linked pages; open them for the pictures.</p>'
def ticket_section(eid,name):
  t=TK.get(eid)
  if not t or t['tot'] in ('0',''): return ''
  return (f'<h2 id="lib-{eid}-tickets">{E(name)}: what practices on it raise with us (Desk tickets, last 12 months)</h2><p>'
    f'Live deals on this EHR: {E(t["live"])}. Tickets from these practices in the last 12 months: {E(t["tot"])}.<br>'
    f'Most common ticket topics overall: {E(t["top"])}.<br>'
    f'EHR, server and form topics (most common first): {E(t["ehr"])}.<br>'
    'Use this to know what to check first for this EHR. Counts are from the AI category on each Desk ticket, matched to the practice deal.</p>')
def shots_section(eid,name):
  d=DOCMAP.get(eid)
  if not d: return ''
  groups={}
  for x in MAN[d]: groups.setdefault(x['section'],[]).append(x)
  h=[f'<h2 id="lib-{eid}-screens">{E(name)}: screenshots from Adit technical documentation</h2><p>Screens of {E(name)} and the Adit connection, from Adit\'s own {E(name)} technical documentation (test data). Adit Expert shows them with answers about these screens.</p>']
  for i,(sec,xs) in enumerate(groups.items()):
    ctx=xs[0]['ctx'] or ''
    imgs=''.join(f'<img src="/api/guides/doc-img/{d}/{x["file"]}" alt="{E(name)}: {E(sec)}">' for x in xs)
    h.append(f'<h3 id="lib-{eid}-screens-{i}">{E(name)} screenshots: {E(sec)}</h3><p>{E(name)}, {E(sec)}. {E(ctx)}</p>{imgs}')
  return '\n'.join(h)
ORTHO_DOCS=[('os_changes','Ortho OS Changes in Details (Dolphin, OrthoTrac, Cloud 9)'),('presentation','Ortho OS Presentation: differences between Dolphin, OrthoTrac and Cloud 9'),
 ('quick_guide','Ortho OS Quick Guide'),('training_manual','Adit OS Ortho Training Manual'),('aifd_rulebook','AI Front Desk Webchat and SMS Agent: Ortho EHR Rulebook'),
 ('cloud9_notes','Online Scheduling and Schedule Build for Ortho (Cloud 9 notes)'),('orthotrac_ob','OrthoTrac Training for OB'),('contact_status','Contact Number and Patient Status: Ortho EHRs'),
 ('multiloc_sales','Multi-Location PMS into Single Adit Location: Sales Guide'),('multiloc_os','Multi-Location PMS into Single Adit Location: Online Scheduling'),('multisingle_ob','Multi-Single Build: Onboarding Guide')]
def ortho_docs():
  import subprocess
  h=['<h1 id="lib-ortho-ref">Ortho EHR reference documents (Dolphin, OrthoTrac, Cloud 9)</h1><p>Adit\'s own reference documents listed in the Orthodontics tab of the Integration Rulebook: how online scheduling, availabilities, appointments, the booking link, AI Front Desk, contact numbers, patient status and the multi-location (multi to single) build work for Dolphin, OrthoTrac and Cloud 9. Struck-out (old) logic is left out.</p>']
  for key,title in ORTHO_DOCS:
    md=open(J('ortho-docs',key+'.md')).read()
    md=re.sub(r'~~.*?~~','',md,flags=re.S)
    md=re.sub(r'`?\[image\]`?','',md)
    fmt='markdown' if key!='presentation' else 'plain'
    if fmt=='plain': md='\n\n'.join(l.strip() for l in md.split('\n') if l.strip())
    x=subprocess.run(['pandoc','-f','markdown','-t','html','--id-prefix=ortho-'+key+'-'],input=md,capture_output=True,text=True).stdout
    x=re.sub(r'<img[^>]*>','',x); x=re.sub(r'<(/?)del>','',x)
    # screenshots kept by orthoimages.py (checked for patient details) go back where they were in the document
    x=re.sub(r'\{\{IMG:([A-Za-z0-9_-]+)\}\}',lambda m:('<img src="/api/guides/doc-img/ortho/'+key+'_'+m.group(1)+'.webp" alt="'+E(title)+'">') if os.path.exists(J('..','..','content','guides','img','ortho',key+'_'+m.group(1)+'.webp')) else '',x)
    x=re.sub(r'<h1 ',r'<h3 ',x); x=re.sub(r'</h1>','</h3>',x); x=re.sub(r'<h2 ','<h3 ',x); x=re.sub(r'</h2>','</h3>',x)
    x=re.sub(r'<h([4-6])[^>]*>',r'<p><b>',x); x=re.sub(r'</h[4-6]>','</b></p>',x)
    # a short bold-only line is a heading in these documents, so each gets its own section (and keeps its screenshots)
    cnt=[0]
    def boldh(m):
      t=re.sub('<[^>]+>','',m.group(1)).strip()
      if not t or len(t)>70: return m.group(0)
      cnt[0]+=1; return f'<h3 id="ortho-{key}-b{cnt[0]}">{t}</h3>'
    x=re.sub(r'<p><strong>(.*?)</strong>\s*</p>',boldh,x,flags=re.S)
    x=re.sub(r'<h3>(.*?)</h3>',lambda m:'<p><b>'+m.group(1)+'</b></p>',x)
    # headings get the document name so a section found alone still says where it is from
    # headings under an EHR heading (Dolphin, OrthoTrac, Cloud 9) say which EHR they are about
    curE=['']
    def ehrh(m):
      t=re.sub('<[^>]+>','',m.group(3))
      f=re.search(r'(?i)dolphin|ortho ?trac|cloud ?9',t)
      if f: curE[0]={'d':'Dolphin','o':'OrthoTrac','c':'Cloud 9'}[f.group(0)[0].lower()]
      elif curE[0]: t=t+' ('+curE[0]+')'
      return '<h3 id="'+m.group(1)+'"'+m.group(2)+'>'+t+'</h3>'
    x=re.sub(r'<h3 id="([^"]+)"([^>]*)>(.*?)</h3>',ehrh,x,flags=re.S)
    x=re.sub(r'<h3 id="([^"]+)"([^>]*)>(.*?)</h3>',lambda m:'<h3 id="'+m.group(1)+'">'+E(title.split(':')[0])+': '+re.sub('<[^>]+>','',m.group(3))+'</h3>',x,flags=re.S)
    x=re.sub(r'<p>\s*</p>','',x)
    h.append(f'<h2 id="lib-ortho-ref-{key}">{E(title)}</h2>'+x)
  return '\n'.join(h)
def kb_section(k,eid,name):
  a=KB.get(k) or []
  if not a: return ''
  return f'<h2 id="lib-{eid}-helpcenter">{E(name)}: Adit Help Center articles for this EHR</h2><p>These Adit articles have step-by-step screenshots; Adit Expert shows them when it uses the article.<br>'+'<br>'.join(E(x['title'])+': '+E(x['url']) for x in a)+'</p>'
out=['<h1 id="lib-ehr-library">EHR library (Nov 2026)</h1>',
 '<p>One section per EHR Adit integrates with: what Adit supports for it (from the Adit Integration Rulebook, including its cell notes and colour codes), which patient form fields write into it and where, how the EHR itself works from its public help (with links to the vendor pages, which carry the screenshots), and the Adit Help Center articles for it. Where the EHR integration notes cover an EHR in depth (how our sync works, known issues, troubleshooting), use those too.<br>Rulebook colour codes: Supported = Adit offers it; Supported with limits = offered with a limitation in the note; Not available = the EHR does not have the function; Not offered by Adit = the EHR has it but Adit does not integrate it; In development.<br>Forms PDFs are stored in: Open Dental > Images > Patient information; Eaglesoft > Patient details > SmartDoc; ClearDent > Patient details > Document > ElectronicDoc; Dentrix > Family File > Doc. Center > Patient Information; Dentrix Ascend > Patient > Document Manager; Tracker > Patient > Correspondence.<br>When a value looks different in the EHR after a form syncs (for example a name changes case), first type the same value by hand in the EHR: if the EHR changes it too, it is an EHR setting (OrthoTrac, for example, has an Automatic Capitalization system option); if not, send it to T2 Core with screenshots.</p>']
for eid,name,spec,rbk,pmsk,nf,kbk,deep in LIB:
  out.append(f'<h1 id="lib-{eid}">{E(name)} ({spec})</h1>')
  if eid in ('dolphin','orthotrac','cloud9'): out.append(f'<p>How online scheduling, availabilities, appointments, the booking link, AI Front Desk, contact numbers and patient status work for {E(name)}: see the Ortho EHR reference documents section of this library.</p>')
  if deep: out.append(f'<p>{E(name)} is also covered in depth in the EHR integration notes (section "{E(deep)} integration"): how the Adit sync works, known issues and the troubleshooting flow.</p>')
  out.append(notes_section(nf,eid,name))
  for k in rbk: out.append(rb_section(k,eid,name))
  out.append(pms_section(pmsk,eid,name))
  out.append(kb_section(kbk,eid,name))
  out.append(ticket_section(eid,name))
  out.append(shots_section(eid,name))
out.append(ortho_docs())
s='\n'.join(x for x in out if x)+'\n'
s=s.replace('\u2013','-').replace('\u2014','-')
open(J('..','..','content','guides','ehr-library.html'),'w').write(s)
print(len(s))
