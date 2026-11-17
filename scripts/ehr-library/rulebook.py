# Reads work/rulebook.xlsx (Adit Integration Rulebook export) into work/rulebook.json.
import os
W=os.path.dirname(os.path.abspath(__file__))
import openpyxl, json, re, html
wb=openpyxl.load_workbook(os.path.join(W,'work','rulebook.xlsx'))
CFG={'Dental':(1,2,6),'Optometry':(1,None,3),'Chiropractic':(1,None,6),'Orthodontics':(1,2,6)}
RED={'FFF4CCCC','FFFF0000','FFEA9999'}; BLUE={'FFC9DAF8','FFA4C2F4'}; YEL={'FFFFE599','FFFFF2CC','FFF1C232'}
def clean(s): return re.sub(r'\s+',' ',str(s)).strip()
out={}
for sname,(hrow,vrow,last) in CFG.items():
  ws=wb[sname]; cols={}; cur=None
  for c in range(2,ws.max_column+1):
    v=ws.cell(hrow,c).value
    if v and re.search(r'blue|Red =',str(v)): cur=None; continue
    if v: cur=clean(v)
    if cur: cols[c]=(cur, clean(ws.cell(vrow,c).value) if vrow and ws.cell(vrow,c).value else '')
  ehrs={}
  for c,(e,var) in cols.items(): ehrs.setdefault(e,[]).append((c,var))
  vr2=(vrow+1) if vrow else None
  for e,cl in ehrs.items():
    names=[v for _,v in cl]
    for i,(c,v) in enumerate(cl):
      if v and names.count(v)>1 and vr2 and ws.cell(vr2,c).value: cl[i]=(c, v+' ('+clean(ws.cell(vr2,c).value).strip('() ')+')')
  for e,cl in ehrs.items():
    d={'sheet':sname,'variants':[v for _,v in cl],'header':[],'cats':[],'notes':[]}
    cat='General'
    for r in range(2,ws.max_row+1):
      lab=ws.cell(r,1).value
      vals=[(c,var,ws.cell(r,c)) for c,var in cl]
      have=[x for x in vals if x[2].value not in (None,'',' ')]
      if lab and not have and r>last: cat=clean(lab); continue
      if not lab and not have: continue
      lab=clean(lab or '')
      if r<=last:
        hv='; '.join(f"{var+': ' if var and len(cl)>1 else ''}{clean(x.value)}" for c,var,x in have)
        if hv: d['header'].append((lab,hv))
        for c,var,x in vals:
          if x.comment: d['notes'].append(f"{lab}: {clean(x.comment.text)}")
        continue
      states=[]
      for c,var,x in vals:
        v=x.value; f=x.fill.fgColor.rgb if x.fill and x.fill.fill_type else None
        f=f if isinstance(f,str) else None
        if v in (None,'',' '): st='blank'
        elif v is True or str(v).upper()=='TRUE': st='limited' if f in YEL else 'yes'
        elif v is False or str(v).upper()=='FALSE':
          st='dev' if f in YEL else 'ehr_lacks' if f in BLUE else 'adit_cant' if f in RED else 'no'
        else: st='text:'+clean(v)
        note=clean(x.comment.text) if x.comment else ''
        states.append((var,st,note))
      d['cats'].append((cat,lab,states))
    out[e]=d
json.dump(out,open(os.path.join(W,'work','rulebook.json'),'w'),indent=1)
print(list(out.keys()))
