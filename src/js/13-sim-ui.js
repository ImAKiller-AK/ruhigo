/* ---------------- Interface: tabs, selection, inspector, timeline ---------------- */
// One small state object drives everything: which workspace tab is open and what is selected on the map.
// Simulation layers, the Cost layer, the timeline and the faction panels only exist while the Simulation tab is open.
const ui={tab:"gen",sel:{kind:"point"},subtab:0,tabsFor:""};
const ICON_PLAY='<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M3 1.5v9l7.5-4.5z" fill="currentColor"/></svg>';
const ICON_PAUSE='<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2.5 1.5h2.5v9H2.5zM7 1.5h2.5v9H7z" fill="currentColor"/></svg>';
const simOn=()=>ui.tab==="sim"&&!!SIM;
const simSay=t=>{$("simMsg").textContent=t;$("simMsg").hidden=!t;};

function setTab(t){
  ui.tab=t;
  document.querySelectorAll(".tabs button").forEach(b=>b.setAttribute("aria-selected",b.dataset.tab===t?"true":"false"));
  document.querySelectorAll("[data-pane]").forEach(e=>{e.hidden=e.dataset.pane!==t;});
  try{localStorage.setItem("worldsmith-tab",t);}catch(e){}
  if(t==="sim"){if(W0&&!SIM)startSim();}
  else{
    simPause();
    if(ui.sel.kind!=="point")ui.sel={kind:"point",wx:view.cx,wy:view.cy};
    if(mode==="cost")$("layerSeg").querySelector('[data-mode="biome"]').click();
  }
  $("timebar").hidden=!simOn();
  resLegend();renderInspector();compose();
}
// Builds the simulation in the background: routes first, then the factions and their 300 years of history.
function startSim(){
  SIM=null;const gen=++simGen,rg=++routeGen;
  if(!W0.cost)W0.cost=new CostField(W0.f).display();
  $("timebar").hidden=true;$("simStats").innerHTML="";$("factions").innerHTML="";$("chronicle").innerHTML="";simSay("Tracing trade routes…");
  sched.add(routeTask(rg,(n,total)=>{if(gen===simGen)simSay("Tracing trade routes "+n+" / "+total);compose();}));
  sched.add((function*(){
    if(gen!==simGen||!W0.costField)return;
    simSay("Settling the factions…");
    const S=yield* simTask(gen,simSay);if(!S||gen!==simGen)return;
    SIM=S;
    S.terr=document.createElement("canvas");S.terr.width=GW;S.terr.height=GH;S.tctx=S.terr.getContext("2d");S.img=new ImageData(GW,GH);
    simSay("");$("tSpeed").textContent="1×";simFactions();setYear(END_YEAR);$("timebar").hidden=!simOn();renderInspector();compose();
  })());
}

/* ---- time ---- */
const WARM=[226,150,84],HOT=[232,82,70],WAR=[255,232,206],ALLY=[138,186,238],NB4=[-1,1,-GW,GW];
function paintTerritory(y){ // faction tint: faint inside, strong along borders and the open frontier; strained, hostile and warring frontiers glow
  const S=SIM,own=stateAt(y),d=S.img.data,hm=W0.f.hm,nF=S.nF,heat=new Uint8Array(nF*nF);
  for(let A=0;A<nF;A++)for(let B=A+1;B<nF;B++){
    if(!frontAt(A,B,y))continue;const t=tension(A,B,y);
    heat[A*nF+B]=heat[B*nF+A]=warAt(A,B,y)?4:t>=WAR_AT?3:t>=0.5?2:alliedAt(A,B,y)?1:0;
  }
  for(let k=0;k<GN;k++){
    const o=own[k],p=k*4;
    if(o<0){d[p+3]=0;continue;}
    const i=k%GW;let edge=false,hot=0;
    for(let q=0;q<4;q++){
      if((q===0&&i===0)||(q===1&&i===GW-1))continue;
      const n=k+NB4[q];if(n<0||n>=GN||hm[n]<0)continue;
      const b=own[n];
      if(b<0)edge=true;
      else if(b!==o){edge=true;const h=heat[o*nF+b];if(h>hot)hot=h;}
    }
    const c=hot===4?WAR:hot===3?HOT:hot===2?WARM:hot===1?ALLY:S.factions[o].color;
    d[p]=c[0];d[p+1]=c[1];d[p+2]=c[2];d[p+3]=hot?245:edge?215:62;
  }
  S.tctx.putImageData(S.img,0,0);
}
function setYear(y){
  const S=SIM;S.year=y;const yi=Math.floor(y);if(yi===S.yi)return;S.yi=yi;
  const now=performance.now(),lazy=S.playing&&yi<END_YEAR; // while playing, repaint borders and panels a few times a second, not once per year
  if(!lazy||now-(S.paintAt||0)>45){S.paintAt=now;S.painted=yi;paintTerritory(yi);}
  let open=0;for(const r of W0.routes)if(r.open<=yi)open++;
  if(open!==S.openCount){ // the road network only contains routes that exist yet
    S.openCount=open;const seg=new Map();
    for(const r of W0.routes){if(r.open>yi)continue;for(let q=1;q<r.path.length;q++){const sk=segKey(r.path[q-1],r.path[q]);seg.set(sk,(seg.get(sk)||0)+r.w);}}
    S.net=seg.size?traceNetwork(seg,W0.costField):{land:[[],[],[],[]],sea:[],km:0};
  }
  $("tYear").value=yi;$("tLabel").textContent="Year "+yi;
  if(!lazy||now-(S.uiAt||0)>150){S.uiAt=now;simPanel();if(ui.sel.kind!=="point")renderInspector();}
}
let simRaf=0,simLast=0;
function simFrame(now){
  simRaf=0;const S=SIM;if(!S||!S.playing||ui.tab!=="sim")return;
  const dt=Math.min(0.1,(now-simLast)/1000);simLast=now;
  S.clock+=dt*S.speed;
  if(S.year<END_YEAR)setYear(Math.min(END_YEAR,S.year+dt*S.speed*5)); // 5 years a second at 1x; flows keep moving once history catches up
  compose();
  simRaf=requestAnimationFrame(simFrame);
}
function simPlay(){
  const S=SIM;if(!S)return;
  if(S.year>=END_YEAR){S.yi=-1;setYear(0);}
  S.playing=true;$("tPlay").innerHTML=ICON_PAUSE;$("tPlay").setAttribute("aria-label","Pause");
  simLast=performance.now();if(!simRaf)simRaf=requestAnimationFrame(simFrame);
}
function simPause(){
  $("tPlay").innerHTML=ICON_PLAY;$("tPlay").setAttribute("aria-label","Play");
  const S=SIM;if(!S||!S.playing)return;
  S.playing=false;
  if(S.painted!==S.yi){S.painted=S.yi;paintTerritory(S.yi);compose();}
  simPanel();if(ui.sel.kind!=="point")renderInspector();
}

/* ---- Simulation tab panels ---- */
const tile=(v,l)=>'<div><strong>'+v+'</strong><span>'+l+'</span></div>';
function simPanel(){
  const S=SIM;if(!S)return;
  const e=simEconomy(S.yi);let claimed=0;
  for(let F=0;F<S.nF;F++)claimed+=e.cells[F];
  $("simStats").innerHTML=tile(S.yi,"Year")+tile(Math.round(claimed/S.landCells*100)+"%","Land claimed")+tile(S.openCount+" / "+W0.routes.length,"Routes open")+tile(fmtInt(S.net.km)+" km","Roads and sea lanes")+tile(pactsAt(S.yi).length,"Pacts in force")+tile(warsAt(S.yi).length,"Wars under way");
  S.factions.forEach((fa,F)=>{
    $("fshare"+F).textContent=Math.round(e.cells[F]/S.landCells*100)+"%";
    $("fmeta"+F).textContent=W0.cities[fa.cap].name+" · "+e.towns[F]+(e.towns[F]===1?" town":" towns");
  });
}
const warPos=(W,y)=>{const q=Math.max(0,Math.min(W.px.length-1,y-W.start));return [(W.px[q]+0.5)*2/GW,(W.py[q]+0.5)/GH];};
function simFactions(){ // the two lists of the Simulation tab: factions and the chronicle of wars
  const S=SIM,ul=$("factions");ul.innerHTML="";
  S.factions.forEach((fa,F)=>{
    const li=document.createElement("li"),bt=document.createElement("button");bt.type="button";
    bt.innerHTML='<span class="mark cap" style="background:'+rgb(fa.color)+'"></span><span>'+fa.name+'<span class="meta" id="fmeta'+F+'"></span></span><span class="pop" id="fshare'+F+'"></span>';
    bt.addEventListener("click",()=>{const c=W0.cities[fa.cap];flyTo(c.x,c.y,4);select({kind:"faction",id:F});});
    li.appendChild(bt);ul.appendChild(li);
  });
  // chronicle: wars and pacts in the order they happened
  const ch=$("chronicle");ch.innerHTML="";
  const items=S.wars.map(W=>({y:W.start,W})).concat(S.pacts.map(P=>({y:P.start,P}))).sort((a,b)=>a.y-b.y||(a.P?-1:1));
  if(!items.length)ch.innerHTML='<li class="none">No frontier turned hostile in these 300 years.</li>';
  for(const it of items){
    const li=document.createElement("li"),bt=document.createElement("button");bt.type="button";
    if(it.W){
      const W=it.W,net=W.gain[0]-W.gain[1],win=S.factions[net>=0?W.a:W.b];
      bt.innerHTML='<span class="mark cap" style="background:'+rgb(HOT)+'"></span><span>'+W.name+'<span class="meta">'+(Math.abs(net)<25?"Stalemate":W0.cities[win.cap].name+" gained "+landArea(Math.abs(net),true))+(W.joint?" · joint attack":"")+'</span></span><span class="pop">'+W.start+"–"+(W.end<0?"":W.end)+'</span>';
      bt.addEventListener("click",()=>{simPause();setYear(Math.min(END_YEAR,W.start+1));const p=warPos(W,SIM.yi);flyTo(p[0],p[1],5);select({kind:"war",id:W.id});});
    }else{
      const P=it.P,X=S.factions[P.target];
      bt.innerHTML='<span class="mark cap" style="background:'+rgb(ALLY)+'"></span><span>'+P.name+'<span class="meta">'+P.members.length+' factions against '+W0.cities[X.cap].name+'</span></span><span class="pop">'+P.start+"–"+(P.end<0?"":P.end)+'</span>';
      bt.addEventListener("click",()=>{simPause();setYear(Math.min(END_YEAR,P.start+1));flyTo(X.cx,X.cy,3);select({kind:"pact",id:P.id});});
    }
    li.appendChild(bt);ch.appendChild(li);
  }
}
function resLegend(){ // extra legend rows for whichever simulation layers are on
  const sim=ui.tab==="sim";let h="";
  if(sim&&opt.borders)h+='<div class="label">Frontiers</div><div class="legend">'+[["Allied",ALLY],["Strained",WARM],["Hostile",HOT],["At war",WAR]].map(r=>'<div><span class="sw" style="background:'+rgb(r[1])+'"></span>'+r[0]+'</div>').join("")+'</div>';
  if(sim&&opt.res)h+='<div class="label">Resources</div><div class="legend">'+RES.map(r=>'<div><span class="sw dia" style="background:'+rgb(r[1])+'"></span>'+r[0]+'</div>').join("")+'</div>';
  $("legendRes").hidden=!h;$("legendRes").innerHTML=h;
}

/* ---- selection and the contextual inspector ---- */
function select(s){
  const prev=ui.sel;ui.sel=s;
  if(s.kind!==prev.kind||s.id!==prev.id)ui.subtab=0;
  renderInspector();
  if(s.kind!=="point"||prev.kind!=="point")compose();
}
function routeNear(wx,wy,u){
  let best=-1,bd=(9*u)*(9*u);
  W0.routes.forEach((r,ri)=>{
    if(r.open>SIM.yi||!r.pts)return;const p=r.pts;
    for(let q=0;q<p.length-2;q+=2){
      const ax=p[q],ay=p[q+1],dx=p[q+2]-ax,dy=p[q+3]-ay,l=dx*dx+dy*dy;let t=l?((wx-ax)*dx+(wy-ay)*dy)/l:0;t=t<0?0:t>1?1:t;
      const ex=ax+dx*t-wx,ey=ay+dy*t-wy,d=ex*ex+ey*ey;if(d<bd){bd=d;best=ri;}
    }
  });
  return best;
}
// a tap picks the most specific thing under it: town, then conflict, then route, then territory, then bare terrain
function pickAt(mx,my){
  const u=unit(),wx=view.cx+(mx-cssW/2)*u,wy=view.cy+(my-cssH/2)*u;
  if(simOn()){
    const S=SIM;
    if(opt.cities){let best=-1,bd=14*14;W0.cities.forEach((c,i)=>{const dx=(c.x-wx)/u,dy=(c.y-wy)/u,d=dx*dx+dy*dy;if(d<bd){bd=d;best=i;}});if(best>=0)return select({kind:"city",id:best});}
    if(opt.borders)for(const W of warsAt(S.yi)){const p=warPos(W,S.yi),dx=(p[0]-wx)/u,dy=(p[1]-wy)/u;if(dx*dx+dy*dy<15*15)return select({kind:"war",id:W.id});}
    if(opt.routes){const ri=routeNear(wx,wy,u);if(ri>=0)return select({kind:"route",id:ri});}
    if(opt.borders&&wx>=0&&wx<2&&wy>=0&&wy<1){const o=stateAt(S.yi)[Math.floor(wy*GH)*GW+Math.floor(wx/2*GW)];if(o>=0)return select({kind:"faction",id:o});}
  }
  select({kind:"point",wx,wy,title:"Surveyed point"});
}
const row=(k,v)=>'<dt>'+k+'</dt><dd>'+v+'</dd>';
const tag=(t,cls)=>'<span class="tag '+cls+'">'+t+'</span>';
const head=(color,text)=>'<div class="biome"><span class="sw" style="background:'+color+'"></span>'+text+'</div>';
function economyHTML(F,y){
  const e=simEconomy(y);let h='<div class="cap">Production against demand</div>';
  for(let r=1;r<8;r++){
    const b=balance(e,F,r),w=Math.abs(b)*50;
    h+='<div class="bal"><span>'+RES[r-1][0]+'</span><div class="meter mid"><i style="left:'+(b>=0?50:50-w)+'%;width:'+w+'%;background:var(--'+(b>=0?"accent":"hostile")+')"></i></div><b>'+(b>=0?"+":"−")+Math.round(Math.abs(b)*100)+'%</b></div>';
  }
  return h;
}
function factionHTML(F,y){
  const S=SIM,e=simEconomy(y),fa=S.factions[F];
  const mine=pactOfAt(F,y),on=pactOnAt(F,y);
  return row("Capital",W0.cities[fa.cap].name)+row("Population",fmtPop(e.pop[F]))+row("Territory",Math.round(e.cells[F]/S.landCells*100)+"% of land")+row("Towns",e.towns[F])
    +row("Diplomacy",mine?'<button type="button" class="lnk" data-pact="'+mine.id+'">Member of the '+mine.name+'</button>':on?'<button type="button" class="lnk" data-pact="'+on.id+'">Target of the '+on.name+'</button>':"No pacts")+economyHTML(F,y);
}
function relationsHTML(F,y){
  const S=SIM;let h="";
  S.factions.forEach((o,B)=>{
    if(B===F)return;const fr=frontAt(F,B,y);if(!fr&&!linked(F,B,y))return;
    const ally=alliedAt(F,B,y),l=warAt(F,B,y)?["At war","hostile"]:ally?["Allied","ally"]:level(tension(F,B,y));
    h+='<div class="rel"><span><span class="sw" style="background:'+rgb(o.color)+'"></span>'+o.name+'</span>'+tag(l[0],l[1])+'</div>';
    h+='<p class="quiet fine">'+(fr?'Frontier since year '+Math.ceil(fr.first)+' · '+fmtInt(fr.len*40000/GW)+' km of '+(fr.barrier<1.8?"open country":fr.barrier<3.2?"broken country":"mountain and river barriers")+' · capitals '+(fr.reach<90?"close together":fr.reach<170?"some way apart":"far apart"):'No shared frontier · linked by trade')+(ally?' · bound by the '+pactOfAt(F,y).name:pactOnAt(B,y)&&pactOnAt(B,y)===pactOfAt(F,y)?' · the pact is aimed at it':pactOnAt(F,y)&&pactOnAt(F,y)===pactOfAt(B,y)?' · sworn against this faction':'')+'</p>';
  });
  return h||'<p class="quiet">No neighbours or trade partners yet.</p>';
}
function cityHTML(i,y,tab){
  const S=SIM,c=W0.cities[i],F=cityFAt(i,y),fa=F>=0?S.factions[F]:null;
  if(y<S.settled[i])return head("var(--muted)","Not yet settled")+'<p class="quiet">'+c.name+' is founded in year '+Math.ceil(S.settled[i])+'.</p>';
  if(tab===2)return '<p>'+cityLore(i)+'</p>';
  if(tab===1){
    let h='<div class="cap">Routes from '+c.name+'</div>',n=0;
    W0.routes.forEach((r,ri)=>{
      if(r.a!==i&&r.b!==i)return;const st=routeStatus(r,y);n++;
      h+='<button type="button" class="rel" data-route="'+ri+'"><span>'+W0.cities[r.a===i?r.b:r.a].name+'</span>'+tag(st.label,st.cls)+'</button>';
    });
    if(!n)h+='<p class="quiet">No routes reach this town.</p>';
    if(fa)h+='<div class="cap">'+fa.name+' and its neighbours</div>'+relationsHTML(F,y);
    return h;
  }
  let h=head(fa?rgb(fa.color):"var(--muted)",fa?fa.name:"Independent town");
  h+=row("Standing",fa?(fa.cap===i?"Capital":(S.cityTaken[i].some(t=>t[0]<=y)?"Taken in year ":"Joined in year ")+heldSince(i,y)):"Self-governing")+row("Town population",fmtPop(cityPop(S,i,y)))+row("Local trade good",RES[S.good[i]-1][0]);
  if(fa)h+=economyHTML(F,y);
  return h;
}
function warHTML(wi,y,tab){
  const S=SIM,W=S.wars[wi],A=S.factions[W.a],Bf=S.factions[W.b];
  if(tab===1)return '<p>'+warLore(wi)+'</p>';
  const st=y<W.start?["Begins in year "+W.start,"muted"]:W.end<0||y<W.end?["At war","hostile"]:["Ended in year "+W.end,"calm"];
  let h='<div class="biome">'+tag(st[0],st[1])+'</div>';
  h+=row("Between",A.name)+row("and",Bf.name)+row("Fought","Year "+W.start+(W.end<0?" onward":" to "+W.end))+row("Frontier at the start",fmtInt(W.km)+" km");
  if(W.pact>=0)h+=row(W.joint?"Joint attack":"Fought under",'<button type="button" class="lnk" data-pact="'+W.pact+'">'+S.pacts[W.pact].name+'</button>');
  h+='<div class="cap">Land taken over the whole war · thousand km²</div>';
  const mx=Math.max(1,W.gain[0],W.gain[1]);
  [A,Bf].forEach((fa,q)=>{h+='<div class="bal"><span>'+W0.cities[fa.cap].name+'</span><div class="meter"><i style="left:0;width:'+Math.round(W.gain[q]/mx*100)+'%;background:'+rgb(fa.color)+'"></i></div><b>'+fmtInt(W.gain[q]*5.1)+'</b></div>';});
  if(W.towns.length){
    h+='<div class="cap">Towns that changed hands</div>';
    for(const t of W.towns)h+='<div class="rel"><span>'+W0.cities[t.city].name+'</span><span class="quiet">year '+t.year+' · to '+W0.cities[S.factions[t.to].cap].name+'</span></div>';
  }
  return h;
}
function pactHTML(pi,y,tab){
  const S=SIM,P=S.pacts[pi],X=S.factions[P.target];
  if(tab===1)return '<p>'+pactLore(pi)+'</p>';
  const st=y<P.start?["Sworn in year "+P.start,"muted"]:P.end<0||y<P.end?["In force","ally"]:["Lapsed in year "+P.end,"muted"];
  let h='<div class="biome">'+tag(st[0],st[1])+'</div>';
  h+=row("Against",X.name)+row("Because of",P.why==="wars"?"its victories in war":"its growing strength")+row("Held","Year "+P.start+(P.end<0?" onward":" to "+P.end));
  h+='<div class="cap">Members</div>';
  for(const N of P.members){const fa=S.factions[N];h+='<div class="rel"><span><span class="sw" style="background:'+rgb(fa.color)+'"></span>'+fa.name+'</span><span class="quiet">'+Math.round(simEconomy(y).cells[N]/S.landCells*100)+'% of land</span></div>';}
  h+='<div class="rel"><span><span class="sw" style="background:'+rgb(X.color)+'"></span>'+X.name+'</span><span class="quiet">'+Math.round(simEconomy(y).cells[P.target]/S.landCells*100)+'% of land · target</span></div>';
  if(P.wars.length){
    h+='<div class="cap">Wars fought under it</div>';
    for(const wi of P.wars){const W=S.wars[wi];h+='<button type="button" class="rel" data-war="'+wi+'"><span>'+W.name+'</span><span class="quiet">'+W.start+"–"+(W.end<0?"":W.end)+'</span></button>';}
  }
  return h;
}
function routeHTML(ri,y,tab){
  const S=SIM,r=W0.routes[ri],st=routeStatus(r,y);
  if(tab===1)return '<p>'+routeLore(ri)+'</p>';
  const ga=RES[S.good[r.a]-1][0],gb=RES[S.good[r.b]-1][0];
  let h='<div class="biome">'+tag(st.label,st.cls)+'</div>';
  h+=row("Length",fmtInt(r.km)+" km")+row("By sea",Math.round(r.sea*100)+"%")+row("Opened",r.open<=y?"Year "+r.open:"—");
  h+=row("Traffic",r.open>y?"—":st.cls==="hostile"?"Suspended":r.w>8?"Heavy":r.w>2?"Steady":"Light")+row("Cargo",ga===gb?ga:ga+" ⇄ "+gb);
  if(st.A>=0&&st.B>=0&&st.A!==st.B&&r.open<=y){
    const l=level(st.t);
    h+='<div class="cap">Tension · '+S.factions[st.A].name+' and '+S.factions[st.B].name+'</div>';
    h+='<div class="bal"><span>'+l[0]+'</span><div class="meter"><i style="left:0;width:'+Math.round(st.t*100)+'%;background:var(--'+l[1]+')"></i></div><b>'+Math.round(st.t*100)+'</b></div>';
  }
  return h;
}
function renderInspector(){
  const s=ui.sel,tabs=$("selTabs");
  if(s.kind==="point"||!simOn()){tabs.hidden=true;ui.tabsFor="";if(s.kind==="point"&&s.wx!==undefined)readAt(s.wx,s.wy,s.title);return;}
  const S=SIM,y=S.yi,names=s.kind==="route"?["Route","Lore"]:s.kind==="war"?["Conflict","Lore"]:s.kind==="pact"?["Pact","Lore"]:["Faction","Relations","Lore"];
  if(ui.tabsFor!==s.kind+ui.subtab){
    ui.tabsFor=s.kind+ui.subtab;
    tabs.innerHTML=names.map((n,i)=>'<button type="button" role="tab" data-i="'+i+'" aria-selected="'+(i===ui.subtab)+'">'+n+'</button>').join("");
  }
  tabs.hidden=false;let title,html;
  if(s.kind==="city"){title="Settlement · "+W0.cities[s.id].name;html=cityHTML(s.id,y,ui.subtab);}
  else if(s.kind==="war"){title="Conflict · "+S.wars[s.id].name;html=warHTML(s.id,y,ui.subtab);}
  else if(s.kind==="pact"){title="Pact · "+S.pacts[s.id].name;html=pactHTML(s.id,y,ui.subtab);}
  else if(s.kind==="route"){const r=W0.routes[s.id];title="Route · "+W0.cities[r.a].name+" to "+W0.cities[r.b].name;html=routeHTML(s.id,y,ui.subtab);}
  else{
    const fa=S.factions[s.id];title="Territory · "+fa.name;
    html=ui.subtab===2?'<p>'+factionLore(s.id)+'</p>':ui.subtab===1?'<div class="cap">Neighbours and partners</div>'+relationsHTML(s.id,y):head(rgb(fa.color),fa.name)+factionHTML(s.id,y);
  }
  $("readLabel").textContent=title;$("readout").innerHTML=html;
}

/* ---- map drawing for the simulation layers (called from drawOverlay) ---- */
function drawSimUnder(sx,sy,u){
  if(!simOn()||!opt.borders)return;
  ctx.imageSmoothingEnabled=true;ctx.drawImage(SIM.terr,sx(0),sy(0),2/u,1/u);
}
function drawSimRoutes(sx,sy){
  if(ui.tab!=="sim"||!W0)return;
  const S=SIM,net=S?S.net:W0.net,zf=Math.pow(view.zoom,0.3);
  const trace=list=>{ctx.beginPath();for(const s of list){ctx.moveTo(sx(s[0]),sy(s[1]));for(let q=2;q<s.length;q+=2)ctx.lineTo(sx(s[q]),sy(s[q+1]));}ctx.stroke();};
  if(opt.routes&&net){ // dotted sea lanes, cased roads whose width follows traffic
    const ws=[1.1,1.6,2.3,3.2],lw=Math.min(4,1.5*zf);
    ctx.lineWidth=lw;ctx.setLineDash([0.01,lw*2.4]);ctx.strokeStyle="rgba(233,227,211,.9)";trace(net.sea);ctx.setLineDash([]);
    ctx.strokeStyle="rgba(10,16,22,.72)";for(let b=0;b<4;b++){ctx.lineWidth=Math.min(11,ws[b]*zf)+2;trace(net.land[b]);}
    ctx.strokeStyle="#e7c27a";for(let b=0;b<4;b++){ctx.lineWidth=Math.min(11,ws[b]*zf);trace(net.land[b]);}
    if(S){
      if(ui.sel.kind==="route"){const r=W0.routes[ui.sel.id];if(r&&r.pts&&r.open<=S.yi){ctx.strokeStyle="#fff6dc";ctx.lineWidth=Math.min(12,2.4*zf)+1.5;trace([r.pts]);}}
      const rad=Math.min(3.6,1.7*zf);ctx.fillStyle="#fff6dc";ctx.strokeStyle="rgba(10,16,22,.85)";ctx.lineWidth=1; // caravans and ships
      W0.routes.forEach((r,ri)=>{
        if(r.open>S.yi||routeStatus(r,S.yi).cls==="hostile")return;
        const p=r.pts,L=p.length/2-1,n=r.w>8?3:r.w>2?2:1;if(L<1)return;
        for(let c=0;c<n;c++){
          let s=(S.clock*9+(c/n+ri*0.37)*2*L)%(2*L);if(s>L)s=2*L-s;
          const q=Math.min(L-1,Math.floor(s)),t=s-q,x=sx(p[q*2]+(p[q*2+2]-p[q*2])*t),y=sy(p[q*2+1]+(p[q*2+3]-p[q*2+1])*t);
          if(x<-5||x>cssW+5||y<-5||y>cssH+5)continue;
          ctx.beginPath();ctx.arc(x,y,rad,0,6.2832);ctx.fill();ctx.stroke();
        }
      });
    }
  }
  if(S&&opt.borders){ // conflicts under way: a cross on the middle of the front, named once there is room
    for(const W of warsAt(S.yi)){
      const p=warPos(W,S.yi),x=sx(p[0]),y=sy(p[1]);if(x<-20||x>cssW+20||y<-20||y>cssH+20)continue;
      const r=6,sel=ui.sel.kind==="war"&&ui.sel.id===W.id;
      for(const [w,c] of [[5.5,"rgba(10,16,22,.85)"],[2.4,sel?"#fff6dc":rgb(HOT)]]){ctx.lineWidth=w;ctx.strokeStyle=c;ctx.beginPath();ctx.moveTo(x-r,y-r);ctx.lineTo(x+r,y+r);ctx.moveTo(x+r,y-r);ctx.lineTo(x-r,y+r);ctx.stroke();}
      if(view.zoom>=2.5||sel){ctx.font="600 11px Inter, sans-serif";ctx.lineWidth=3.5;ctx.strokeStyle="rgba(10,16,22,.82)";ctx.strokeText(W.name,x+r+6,y+4);ctx.fillStyle="#ffd9cf";ctx.fillText(W.name,x+r+6,y+4);}
    }
  }
  if(S&&opt.res){ // resource sites: a sparse set from afar, the full set and their names once zoomed in
    const r=Math.min(6.5,3.4*Math.pow(view.zoom,0.25)),named=view.zoom>=5;
    ctx.lineWidth=1.2;ctx.font="500 10px 'JetBrains Mono', monospace";
    for(const s of S.sites[view.zoom<2.5?0:1]){
      const x=sx(s.x),y=sy(s.y);if(x<-10||x>cssW+10||y<-10||y>cssH+10)continue;
      ctx.beginPath();ctx.moveTo(x,y-r);ctx.lineTo(x+r,y);ctx.lineTo(x,y+r);ctx.lineTo(x-r,y);ctx.closePath();
      ctx.fillStyle=rgb(RES[s.r-1][1]);ctx.strokeStyle="rgba(10,16,22,.9)";ctx.fill();ctx.stroke();
      if(named){ctx.lineWidth=3;ctx.strokeStyle="rgba(10,16,22,.8)";ctx.strokeText(RES[s.r-1][0],x+r+4,y+3.5);ctx.fillStyle="#e9e3d3";ctx.fillText(RES[s.r-1][0],x+r+4,y+3.5);ctx.lineWidth=1.2;}
    }
  }
  if(S&&opt.borders&&view.zoom<8){ // faction names, atlas style: shown only where the realm is wide enough on screen to carry them
    const e=simEconomy(S.yi);ctx.font="600 11px 'JetBrains Mono', monospace";ctx.textAlign="center";
    try{ctx.letterSpacing="2px";}catch(err){}
    for(const fa of S.factions){
      if(e.cells[fa.id]<S.landCells*0.012)continue;
      const c=fa.color,t=fa.name.toUpperCase(),tw=ctx.measureText(t).width,x=sx(fa.cx);let y=sy(fa.cy);
      if(tw>Math.sqrt(e.cells[fa.id])*1.5*(2/GW)/unit())continue;
      if(opt.cities)for(let n=0;n<3;n++){ // step clear of town labels
        if(W0.cities.some(o=>{const ox=sx(o.x),oy=sy(o.y);return Math.abs(oy-y)<13&&ox+70>x-tw/2&&ox-8<x+tw/2;}))y-=17;else break;
      }
      ctx.lineWidth=3.5;ctx.strokeStyle="rgba(10,16,22,.8)";ctx.strokeText(t,x,y);
      ctx.fillStyle="rgb("+Math.round(c[0]*0.45+140)+","+Math.round(c[1]*0.45+140)+","+Math.round(c[2]*0.45+140)+")";ctx.fillText(t,x,y);
    }
    try{ctx.letterSpacing="0px";}catch(err){}
    ctx.textAlign="start";
  }
}
function drawSimOver(sx,sy){
  if(!simOn()||ui.sel.kind!=="city")return;
  const c=W0.cities[ui.sel.id];ctx.lineWidth=2;ctx.strokeStyle="#f1c877";ctx.beginPath();ctx.arc(sx(c.x),sy(c.y),10,0,6.2832);ctx.stroke();
}

/* ---- wiring ---- */
document.querySelectorAll(".tabs button").forEach(b=>b.addEventListener("click",()=>setTab(b.dataset.tab)));
$("selTabs").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;ui.subtab=+b.dataset.i;renderInspector();});
$("readout").addEventListener("click",e=>{ // links inside the inspector lead to the route, pact or war they name
  const b=e.target.closest("[data-route],[data-pact],[data-war]");if(!b)return;
  if(b.dataset.route!==undefined)select({kind:"route",id:+b.dataset.route});
  else if(b.dataset.pact!==undefined)select({kind:"pact",id:+b.dataset.pact});
  else select({kind:"war",id:+b.dataset.war});
});
$("tPlay").addEventListener("click",()=>{if(SIM&&SIM.playing)simPause();else simPlay();});
$("tSpeed").addEventListener("click",()=>{if(!SIM)return;SIM.speed=SIM.speed===1?4:SIM.speed===4?16:1;$("tSpeed").textContent=SIM.speed+"×";});
$("tYear").addEventListener("input",e=>{if(!SIM)return;setYear(+e.target.value);compose();});
$("tPlay").innerHTML=ICON_PLAY;

