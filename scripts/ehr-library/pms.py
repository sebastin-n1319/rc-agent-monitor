# Reads work/pmsfields.xlsx (Patient Form PMS field integration sheet) into work/pms.json.
import openpyxl,re,json,os
W=os.path.dirname(os.path.abspath(__file__))
wb=openpyxl.load_workbook(os.path.join(W,'work','pmsfields.xlsx'),data_only=True)
out={}
for t in wb.sheetnames:
  if t in ('Sheet1','Sheet2','Abeldent_O'): continue
  ws=wb[t]; rows=[]
  for r in ws.iter_rows():
    v=[re.sub(r'\s+',' ',str(c.value)).strip() for c in r if c.value not in (None,'')]
    notes=[re.sub(r'\s+',' ',c.comment.text).strip() for c in r if c.comment]
    if v: rows.append((v,notes))
  out[t]=rows
json.dump(out,open(os.path.join(W,'work','pms.json'),'w'),indent=0)
print(sorted(out))
