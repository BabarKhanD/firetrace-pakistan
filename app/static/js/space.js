(function(){'use strict';
const q=s=>document.querySelector(s);
/* ---------- BACKGROUND: stars, globe, Mars, rocket ---------- */
const cv=document.getElementById('space-bg');
if(cv){const ctx=cv.getContext('2d');let W,H;
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
function size(){const d=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;cv.width=W*d;cv.height=H*d;ctx.setTransform(d,0,0,d,0,0)}
size();addEventListener('resize',size);
let sd=7;const rnd=()=>(sd=sd*16807%2147483647,(sd-1)/2147483646),rad=Math.PI/180;
const stars=Array.from({length:230},()=>({x:rnd(),y:rnd(),z:rnd()*.9+.1,t:rnd()*6.28}));
const hot=Array.from({length:170},(_,i)=>i<40?{lat:(30+(rnd()-.5)*12)*rad,lon:(70+(rnd()-.5)*16)*rad,t:rnd()*6}:{lat:(rnd()-.5)*130*rad,lon:rnd()*6.283,t:rnd()*6});
const TILT=.4,PAK=[30*rad,70*rad];
function P(lat,lon,rot){const l=lon+rot,c=Math.cos(lat),x=c*Math.sin(l),y=Math.sin(lat),z=c*Math.cos(l),ct=Math.cos(TILT),st=Math.sin(TILT);return[x,y*ct-z*st,y*st+z*ct]}
function globe(t,sy){const R=Math.min(W,H)*.44,cx=W*.8,cy=H*.8-sy*.03,rot=t*.00005+sy*.0006,S=p=>[cx+R*p[0],cy-R*p[1]];
let g=ctx.createRadialGradient(cx,cy,R*.96,cx,cy,R*1.28);g.addColorStop(0,'rgba(89,217,242,.35)');g.addColorStop(1,'rgba(89,217,242,0)');
ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,R*1.28,0,7);ctx.fill();
g=ctx.createRadialGradient(cx-R*.35,cy-R*.4,R*.1,cx,cy,R);g.addColorStop(0,'#1f5da8');g.addColorStop(.55,'#08224a');g.addColorStop(1,'#020712');
ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,R,0,7);ctx.fill();
ctx.strokeStyle='rgba(89,217,242,.2)';ctx.lineWidth=1;
const line=(f,a,b,st)=>{ctx.beginPath();let on=false;for(let v=a;v<=b;v+=st){const p=f(v);if(p[2]>0){const s=S(p);on?ctx.lineTo(s[0],s[1]):ctx.moveTo(s[0],s[1]);on=true}else on=false}ctx.stroke()};
for(let la=-60;la<=60;la+=30)line(v=>P(la*rad,v,rot),0,6.3,.08);
for(let lo=0;lo<360;lo+=30)line(v=>P(v,lo*rad,rot),-1.57,1.57,.08);
hot.forEach(h=>{const p=P(h.lat,h.lon,rot);if(p[2]<.05)return;const s=S(p),a=.55+.45*Math.sin(t*.003+h.t);
ctx.fillStyle='rgba(255,148,91,'+a*.25+')';ctx.beginPath();ctx.arc(s[0],s[1],5,0,7);ctx.fill();
ctx.fillStyle='rgba(255,200,140,'+a+')';ctx.beginPath();ctx.arc(s[0],s[1],1.6,0,7);ctx.fill()});
const pk=P(PAK[0],PAK[1],rot);if(pk[2]>.1){const s=S(pk),r=8+6*((t*.002)%1);ctx.strokeStyle='rgba(89,217,242,'+(1-((t*.002)%1))+')';ctx.beginPath();ctx.arc(s[0],s[1],r,0,7);ctx.stroke()}}
function mars(sy){const x=W*.1,y=H*.22-sy*.05,r=34,g=ctx.createRadialGradient(x-10,y-10,4,x,y,r);g.addColorStop(0,'#ffb27a');g.addColorStop(.6,'#c4502a');g.addColorStop(1,'#3a1208');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fill()}
let rk=null,next=performance.now()+3500;
function drawRocket(r){ctx.save();ctx.translate(r.x,r.y);ctx.rotate(r.a);ctx.scale(1.5,1.5);
const fl=18+Math.random()*10,g=ctx.createLinearGradient(-24,0,-24-fl,0);g.addColorStop(0,'rgba(255,210,130,.95)');g.addColorStop(1,'rgba(252,61,33,0)');
ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(-24,-4);ctx.lineTo(-24-fl,0);ctx.lineTo(-24,4);ctx.fill();
ctx.fillStyle='#fc3d21';[-1,1].forEach(k=>{ctx.beginPath();ctx.moveTo(-22,k*5);ctx.lineTo(-30,k*12);ctx.lineTo(-10,k*5);ctx.fill()});
ctx.fillStyle='#e8eef7';ctx.beginPath();ctx.moveTo(-24,-5);ctx.lineTo(8,-5);ctx.quadraticCurveTo(26,0,8,5);ctx.lineTo(-24,5);ctx.fill();
ctx.fillStyle='#fc3d21';ctx.beginPath();ctx.moveTo(8,-5);ctx.quadraticCurveTo(26,0,8,5);ctx.quadraticCurveTo(14,0,8,-5);ctx.fill();
ctx.fillStyle='#59d9f2';ctx.beginPath();ctx.arc(-4,0,2.6,0,7);ctx.fill();ctx.restore()}
function frame(t){ctx.clearRect(0,0,W,H);const sy=scrollY;
stars.forEach(s=>{const y=(s.y*H+sy*s.z*.18)%H;ctx.fillStyle='rgba(220,235,255,'+(.35+.4*Math.sin(t*.002*s.z+s.t))*s.z+')';ctx.fillRect(s.x*W,y,s.z*2,s.z*2)});
mars(sy);globe(t,sy);
if(!reduce){if(!rk&&t>next)rk={x:-60,y:H*(.7+rnd()*.25),a:-.55};
if(rk){rk.x+=Math.cos(rk.a)*1.5;rk.y+=Math.sin(rk.a)*1.5;drawRocket(rk);if(rk.x>W+80||rk.y<-80){rk=null;next=t+22000}}requestAnimationFrame(frame)}}
requestAnimationFrame(frame)}
/* ---------- HARMONIZATION promoted to its own section ---------- */
const hs=document.getElementById('harmonizationSummary'),seas=q('.seasonality-panel');
if(hs&&seas){const sec=document.createElement('section');sec.id='harmonization';sec.className='calendar-panel';
sec.innerHTML='<div class="panel-heading"><div><p class="eyebrow">NASA SPACE APPS CHALLENGE 2026</p><h3>Harmonization of MODIS and VIIRS Hot Spots</h3><p class="calendar-description">Both sensor families are placed on the same 0.25° grid and weekly timeline, normalized within each sensor, then compared cell by cell to show where they agree and where they diverge.</p></div></div>';
const pan=hs.closest('.comparison-chart-panel'),st=document.getElementById('harmonizationStatus');
if(pan)sec.appendChild(pan);if(st)sec.appendChild(st);seas.parentNode.insertBefore(sec,seas)}
/* ---------- NAVIGATION ---------- */
const cal=document.getElementById('activityCalendar');
const defs=[['Overview',q('.intro'),'#59d9f2','Mission and headline numbers'],['Mission',q('#mission'),'#4f8dff','Challenge, approach and method'],['Map',q('.workspace'),'#59d9f2','Interactive fire activity map'],['Sensors',q('.comparison-panel'),'#4f8dff','MODIS versus VIIRS comparison'],['Harmonization',q('#harmonization'),'#b58cff','Cross-sensor agreement analysis'],['Seasonality',q('.seasonality-panel'),'#ffd166','Historical monthly patterns'],['Persistence',q('.persistence-panel'),'#ff945b','Locations active year after year'],['Concentration',q('.concentration-panel'),'#fc3d21','Locations with densest detections'],['Calendar',cal&&cal.closest('section'),'#5ce0ad','Burning activity by month and year'],['About',q('.information-grid'),'#8da1b7','How to read this dashboard']].filter(d=>d[1]);
const nav=document.createElement('nav');nav.id='spacenav';
nav.innerHTML='<div class="nb">FireTrace <i>Pakistan</i></div><div class="nav-links"></div><button class="nav-menu" aria-expanded="false">Sections</button>';
const pop=document.createElement('div');pop.id='navpop';
document.body.prepend(nav);document.body.appendChild(pop);
const links=nav.querySelector('.nav-links'),btn=nav.querySelector('.nav-menu');
const go=el=>{el.scrollIntoView({behavior:'smooth',block:'start'});pop.classList.remove('open')};
defs.forEach(([n,el,c,d])=>{el.style.setProperty('--accent',c);el.dataset.sec=n;el.classList.add('reveal');
const b=document.createElement('button');b.textContent=n;b.style.setProperty('--c',c);b.onclick=()=>go(el);links.appendChild(b);
const p=document.createElement('button');p.innerHTML='<b>'+n+'</b><span>'+d+'</span>';p.style.setProperty('--c',c);p.onclick=()=>go(el);pop.appendChild(p)});
const mi=q('#mission');if(mi)mi.style.removeProperty('--accent');
btn.onclick=e=>{e.stopPropagation();btn.setAttribute('aria-expanded',pop.classList.toggle('open'))};
document.addEventListener('click',e=>{if(!pop.contains(e.target))pop.classList.remove('open')});
document.addEventListener('keydown',e=>{if(e.key==='Escape')pop.classList.remove('open')});
document.querySelectorAll('[data-goto]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const t=q(a.dataset.goto);t&&go(t)}));
const pills=[...links.children];let tick=false;
addEventListener('scroll',()=>{if(tick)return;tick=true;requestAnimationFrame(()=>{tick=false;let k=0;defs.forEach((d,i)=>{if(d[1].getBoundingClientRect().top<180)k=i});pills.forEach((p,i)=>p.classList.toggle('on',i===k))})},{passive:true});
/* ---------- REVEAL ON SCROLL ---------- */
if('IntersectionObserver'in window){const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.08});
document.querySelectorAll('.reveal').forEach(el=>io.observe(el))}else document.querySelectorAll('.reveal').forEach(el=>el.classList.add('in'));
/* ---------- TOP-N SELECTORS ---------- */
[['persistenceLimit','refreshPersistence'],['concentrationLimit','refreshConcentration']].forEach(([s,b])=>{const a=document.getElementById(s),c=document.getElementById(b);if(a&&c)a.addEventListener('change',()=>c.click())});
const dl=document.getElementById('downloadHarmonization'),ds=document.getElementById('startDate'),de=document.getElementById('endDate');
if(dl&&ds&&de){
  const base='/api/harmonization/download';
  const upd=()=>{dl.href=(ds.value&&de.value)?base+'?start='+ds.value+'&end='+de.value:base};
  upd();
  ds.addEventListener('change',upd);
  de.addEventListener('change',upd);
  const rs=document.getElementById('resetFilters');
  if(rs)rs.addEventListener('click',()=>setTimeout(upd,0));
}
})();
