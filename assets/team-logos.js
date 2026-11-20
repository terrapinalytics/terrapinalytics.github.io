'use strict';
/* Shared school marks for dashboard labels. Use local artwork when available;
   ESPN CDN identifiers otherwise. A failed image falls back to readable text. */
window.TeamLogos=(()=>{
const local=new Set("Alabama|Arkansas|Baylor|Boston College|Clemson|Colorado|Florida State|Kansas|Maryland|Michigan|Mississippi State|NC State|Nebraska|North Carolina|Penn State|Purdue|Rutgers|South Carolina|Syracuse|TCU|Texas|Texas A&M|USC|Washington|Wisconsin".split('|'));
const ids={
"Arizona":12,"Arizona State":9,"Auburn":2,"BYU":252,"California":25,"Cincinnati":2132,"Duke":150,"Florida":57,"Georgia":61,"Georgia Tech":59,"Houston":248,"Illinois":356,"Indiana":84,"Iowa":2294,"Iowa State":66,"Kansas State":2306,"Kentucky":96,"Louisville":97,"LSU":99,"Miami":2390,"Michigan State":127,"Minnesota":135,"Missouri":142,"Northwestern":77,"Notre Dame":87,"Ohio State":194,"Oklahoma":201,"Oklahoma State":197,"Ole Miss":145,"Oregon":2483,"Oregon State":204,"Pittsburgh":221,"SMU":2567,"Stanford":24,"Tennessee":2633,"Texas Tech":2641,"UCLA":26,"Utah":254,"Vanderbilt":238,"Virginia":258,"Virginia Tech":259,"Wake Forest":154,"West Virginia":277,"UCF":2116,"Washington State":265,"Kansas":2305,"Maryland":120,"NC State":152,"Penn State":213,"Wisconsin":275,"Nebraska":158,"USC":30,"TCU":2628,"North Carolina":153,"South Carolina":2579,"Texas":251,"Texas A&M":245,"Alabama":333,"Arkansas":8,"Baylor":239,"Boston College":103,"Clemson":228,"Colorado":38,"Florida State":52,"Michigan":130,"Mississippi State":344,"Purdue":2509,"Rutgers":164,"Syracuse":183};
const alias={"Miami (FL)":"Miami","Miami (Florida)":"Miami","Miami FL":"Miami","Mississippi":"Ole Miss","N.C. State":"NC State","North Carolina State":"NC State","California-Berkeley":"California","Cal":"California","Southern California":"USC","Central Florida":"UCF","Brigham Young":"BYU","Pitt":"Pittsburgh","UConn":"Connecticut","Connecticut":41,"Maryland Terrapins":"Maryland"};
function escape(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function image(name,id){
 const key=alias[name]||name;
 if(local.has(key))return '../coaching/logos/'+encodeURIComponent(key.replace(/ /g,'_'))+'.png';
 const num=id&&/^\d+$/.test(String(id))?id:ids[key];
 return num?'https://a.espncdn.com/i/teamlogos/ncaa/500/'+num+'.png':null;
}
function label(name,id){
 const src=image(name,id),text=escape(name);
 return '<span class="team-label">'+(src?'<img class="team-logo" src="'+escape(src)+'" alt="" loading="lazy" onerror="this.style.display=\'none\'">':'')+'<span>'+text+'</span></span>';
}
return {label,image};
})();