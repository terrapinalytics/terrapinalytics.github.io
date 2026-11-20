import json,gzip,urllib.request,concurrent.futures,zipfile,datetime,unicodedata,re
from pathlib import Path
P=Path(__file__).resolve().parents[1];A=P/'assets/fouls';players=json.load(gzip.open(A/'players-2027.json.gz','rt'));teams=sorted(set(p['t'] for p in players));found={};raw={};errors=[]
cached=zipfile.ZipFile(A/'position-roster-sources-2027.zip') if (A/'position-roster-sources-2027.zip').exists() else None
def get(t):
 u=f'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/{t}/roster?season=2027'
 try:
  b=cached.read(t+'.json') if cached and t+'.json' in cached.namelist() else urllib.request.urlopen(u,timeout=25).read();d=json.loads(b)
  if d.get('season',{}).get('year')!=2027:return t,u,None,'Season mismatch'
  return t,u,(b,d),None
 except Exception as e:return t,u,None,str(e)
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
 for i,(t,u,result,error) in enumerate(ex.map(get,teams)):
  if error:errors.append({'team':t,'url':u,'error':error});continue
  b,d=result;raw[t]=b
  for a in d.get('athletes',[]):
   pos=a.get('position',{}).get('abbreviation');ident=str(a['id'])
   if pos:found[ident]={'position':pos,'position_name':a.get('position',{}).get('displayName'),'team':t,'source_url':u}
  if i%60==0:print(i,'of',len(teams),flush=True)
# Source player identifiers differ from ESPN roster identifiers. Match only
# unique exact normalized full name plus team; never fuzzy-match or infer positions.
def norm(s):return re.sub(r'[^a-z0-9]','',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower())
lookup={}
for t,b in raw.items():
 for a in json.loads(b).get('athletes',[]):
  key=(t,norm(a.get('displayName','')));lookup.setdefault(key,[]).append(a)
crosswalk={}
for p in players:
 key=(p['t'],norm(p['name']));hits=lookup.get(key,[])
 if len(hits)==1:
  a=hits[0];position=a.get('position',{}).get('abbreviation')
  if position:crosswalk[p['id']]={'position':position,'position_name':a.get('position',{}).get('displayName'),'team':p['t'],'roster_id':a['id'],'source_name':p['name'],'roster_name':a['displayName'],'join_method':'unique normalized full name plus team; IDs differ','source_url':f'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/{p["t"]}/roster?season=2027'}
found=crosswalk
ids=set(p['id'] for p in players);matched=ids&found.keys();d={'season':2027,'retrieved_date':'2026-11-20','source':'ESPN team roster API; season verified per response','positions':{k:v for k,v in found.items() if k in ids},'coverage':{'players':len(ids),'matched':len(matched),'teams_requested':len(teams),'teams_returned':len(raw)},'errors':errors}
(A/'player-positions-2027.json').write_text(json.dumps(d,separators=(',',':')))
with zipfile.ZipFile(A/'position-roster-sources-2027.zip','w',zipfile.ZIP_DEFLATED) as z:
 for t,b in raw.items():z.writestr(t+'.json',b)
print(d['coverage'],'errors',len(errors),flush=True)
