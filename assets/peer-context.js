/* Shared descriptive peer comparisons. No missing-value imputation. */
(function(root){
'use strict';
const numeric=v=>v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function stats(value,values,lower=false){
 const a=values.filter(numeric).map(Number).sort((a,b)=>a-b),n=a.length;
 if(!numeric(value)||!n)return {n,mean:null,median:null,rank:null,percentile:null};
 const v=Number(value),less=a.filter(x=>x<v).length,equal=a.filter(x=>x===v).length;
 return {n,mean:a.reduce((x,y)=>x+y,0)/n,median:n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2,rank:n>=5?1+a.filter(x=>lower?x<v:x>v).length:null,percentile:n>=5?100*(less+(equal-1)/2)/(n-1):null};
}
function comparison({value,cohorts,format=v=>Number(v).toFixed(1),lower=false,label=''}){
 if(!numeric(value))return '<p class="peer-note">Peer context unavailable: selected value is missing.</p>';
 const rows=cohorts.map(c=>{const s=stats(value,c.values,lower),inside=c.includesSelected!==false;
 return '<tr><th scope="row">'+esc(c.label)+'</th><td>'+s.n+'</td><td>'+(inside&&s.rank!==null?'#'+s.rank:'—')+'</td><td>'+(inside&&s.percentile!==null?s.percentile.toFixed(0)+'%ile':'—')+'</td><td>'+(s.mean===null?'—':esc(format(s.mean)))+'</td><td>'+(s.median===null?'—':esc(format(s.median)))+'</td></tr>';}).join('');
 return '<div class="peer-context"><p><strong>'+esc(label||'Peer context')+'</strong></p><div class="peer-scroll"><table><thead><tr><th>Comparison group</th><th>n</th><th>Rank ('+(lower?'lowest':'highest')+' first)</th><th>Value percentile</th><th>Peer mean</th><th>Peer median</th></tr></thead><tbody>'+rows+'</tbody></table></div><p class="peer-note">Available observations only; missing values excluded. Percentiles describe higher numerical values, not quality. Tied values share ranks; percentiles use midranks. Rank and percentile withheld below 5 observations or outside the group. Means weight each entity equally.</p></div>';
}
function badges({value,cohorts,lower=false}) {
 const items=cohorts.filter(c=>c.includesSelected!==false).map(c=>{
   const sample=stats(value,c.values,lower);
   if(sample.rank===null)return '';
   const direction=lower?'lowest first':'highest first';
   return '<span class="peer-badge" title="'+direction+'"><strong>#'+sample.rank+' <span>of '+sample.n+'</span></strong> '+esc(c.shortLabel||c.label)+'</span>';
 }).filter(Boolean);
 return items.length?'<span class="peer-badges">'+items.join('')+'</span>':'';
}
const api={stats,comparison,badges,numeric};root.PeerContext=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
