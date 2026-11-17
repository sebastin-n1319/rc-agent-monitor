# Lists Adit Help Center articles per EHR into work/kb_ehr.json (public Help Center API).
import json,urllib.request,re,os
W=os.path.dirname(os.path.abspath(__file__))
P='edbsn16f89f92a8e41d5ebe9e0a9d047fe6ff8a54944972cb43d0d242ca8c767c966f'
arts=[]
for f in range(1,5000,100):
  d=json.load(urllib.request.urlopen(f'https://help.adit.com/portal/api/kbArticles?portalId={P}&limit=100&from={f}&locale=en'))['data']
  arts+=[{'id':x['id'],'title':x['title'].strip(),'url':x.get('webUrl','')} for x in d]
  if len(d)<100: break
E={'dentrix':r'dentrix(?! ?ascend)','ascend':r'ascend','opendental':r'open ?dental','eaglesoft':r'eagle ?soft','cleardent':r'clear ?dent','softdent':r'soft ?dent','tracker':r'\btracker\b','practiceworks':r'practice ?works?\b','easydental':r'easy ?dental','denticon':r'denticon','practiceweb':r'practice ?web','abeldent':r'abel ?dent','curve':r'\bcurve\b','officemate':r'office ?mate','crystal':r'crystal','revolution':r'revolution|rev ?ehr','eyefinity':r'eyefinity|encompass','compulink':r'compulink','chirotouch':r'chiro ?touch','jane':r'\bjane\b','eclipse':r'eclipse','orthotrac':r'ortho ?trac','dolphin':r'dolphin','cloud9':r'cloud ?9','ortho2':r'ortho ?2|edge cloud'}
json.dump({k:[a for a in arts if re.search(p,a['title'],re.I)] for k,p in E.items()},open(os.path.join(W,'work','kb_ehr.json'),'w'))
print(len(arts),'articles')
