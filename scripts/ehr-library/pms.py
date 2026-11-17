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

# The Dental patient form field list (Google Sheet 11lRwVlOOScGRyoAf0BQN8wv09omyWYCcehsxxtVQGPc, linked from the rulebook) adds Eaglesoft, ClearDent and Tracker.
wb=openpyxl.load_workbook(os.path.join(W,'work','dentalfields.xlsx'),data_only=True)
df={}
for t in wb.sheetnames:
  ws=wb[t]; rows=[]
  for r in ws.iter_rows():
    v=[re.sub(r'\s+',' ',str(c.value)).strip() for c in r if c.value not in (None,'')]
    if v: rows.append((v,[]))
  df[t]=rows
json.dump(df,open(os.path.join(W,'work','dentalfields.json'),'w'),indent=0)
print(sorted(df))
