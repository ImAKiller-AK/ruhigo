/* ---------------- Readout + panel ---------------- */
function readAt(wx,wy,title){
  if(!N||wx<0||wx>WX||wy<0||wy>1)return;
  const oct=full?full.oct+1:low?low.oct+2:10;
  const h=meters(elev(wx,wy,oct));climate(wx,wy,h,oct);const T=cT,R=cR,b=biome(h,T,R);
  const lat=90-wy*180,lon=wx/2*360-180;
  $("readLabel").textContent=title||"Terrain readout";
  $("readout").innerHTML=
    '<div class="biome"><span class="sw" style="background:'+rgb(B[b][1])+'"></span>'+B[b][0]+'</div>'+
    (isArena()?'<dt>Grid square</dt><dd>'+String.fromCharCode(65+Math.min(P.km-1,Math.floor(wx*P.km)))+Math.min(P.km,Math.floor(wy*P.km)+1)+' · '+(wx*P.km).toFixed(2)+' km, '+(wy*P.km).toFixed(2)+' km</dd>'
      :'<dt>Position</dt><dd>'+Math.abs(lat).toFixed(2)+'°'+(lat>=0?"N":"S")+' '+Math.abs(lon).toFixed(2)+'°'+(lon>=0?"E":"W")+'</dd>')+
    '<dt>'+(h<0?"Depth":"Elevation")+'</dt><dd>'+fmtInt(Math.abs(h))+' m</dd>'+
    '<dt>Mean temperature</dt><dd>'+(T<0?"−":"")+Math.abs(T).toFixed(1)+' °C</dd>'+
    '<dt>Rainfall</dt><dd>'+(h<0?"—":fmtInt(R)+' mm/yr')+'</dd>'+
    (ui.tab==="sim"&&W0.cost?'<dt>Travel cost</dt><dd>'+(h<0?FRICTION[b]:costAt(wx,wy)).toFixed(1)+'×</dd>':'');
}
function updatePanel(){
  $("worldName").textContent=worldName;$("seedTxt").textContent=P.seed;
  document.title=worldName+" · Worldsmith";
  if(W0.kind==="arena")arenaStats();
  else $("stats").innerHTML=
    '<div><strong>'+Math.round(W0.land*100)+'%</strong><span>Land surface</span></div>'+
    '<div><strong>'+W0.masses+'</strong><span>Major landmasses</span></div>'+
    '<div><strong>'+fmtInt(W0.peak.h)+' m</strong><span>'+peakName+'</span></div>'+
    '<div><strong>'+W0.mouths+'</strong><span>Rivers reaching the sea</span></div>';
  const ul=$("cities");ul.innerHTML="";
  W0.cities.forEach((c,i)=>{
    const li=document.createElement("li"),bt=document.createElement("button");bt.type="button";
    bt.innerHTML=W0.kind==="arena"
      ?'<span class="mark'+(c.cls==="city"?" cap":c.cls==="site"?" site":"")+'"></span><span>'+c.name+'<span class="meta">'+c.kind+' · '+B[c.biome][0]+' · '+fmtInt(c.h)+' m</span></span><span class="pop">'+c.pop+' bldg</span>'
      :'<span class="mark'+(c.cap?" cap":"")+'"></span><span>'+c.name+(c.cap?" · capital":"")+'<span class="meta">'+B[c.biome][0]+' · '+fmtInt(c.h)+' m</span></span><span class="pop">'+fmtPop(c.pop)+'</span>';
    bt.addEventListener("click",()=>{const sim=simOn();flyTo(c.x,c.y,isArena()?(c.cls==="city"?3.5:6):sim?10:28);select(sim?{kind:"city",id:i}:{kind:"point",wx:c.x,wy:c.y,title:c.name});});
    li.appendChild(bt);ul.appendChild(li);
  });
  $("oSea").textContent=Math.round(W0.land*100)+"% land";
  const cap=W0.cities[0];if(cap)select({kind:"point",wx:cap.x,wy:cap.y,title:cap.name+(isArena()?" · "+cap.kind.toLowerCase():" · capital")});
}
function updateLegend(){
  const el=$("legend");
  if(mode==="biome"&&isArena()){ // the aerial look: what each colour means on this climate
    const th=AERIAL[P.theme],rows=[["Open ground",th.open],["Dry ground",th.dry],["Woods",th.forest],["Farmland",th.field[0]],["Bare rock",th.rock],["Beach",th.beach],["Shallow water",[72,164,160]],["Deep water",[14,40,64]],["Buildings",[238,227,191]],["Roads",[226,222,210]]];
    $("legendLabel").textContent="Aerial view · "+THEMES[P.theme].name.toLowerCase();
    el.innerHTML='<div class="legend">'+rows.map(r=>'<div><span class="sw" style="background:'+rgb(r[1])+'"></span>'+r[0]+'</div>').join("")+'</div>';
    return;
  }
  if(mode==="biome"){
    $("legendLabel").textContent="Biomes";
    el.innerHTML='<div class="legend">'+B.map(b=>'<div><span class="sw" style="background:'+rgb(b[1])+'"></span>'+b[0]+'</div>').join("")+'</div>';
    return;
  }
  const top=isArena()?arenaTop():6200;
  const map={relief:["Elevation above sea level",RAMPS.reliefL,["0 m",fmtInt(top/2)+" m",fmtInt(top)+" m"]],temp:["Mean annual temperature",RAMPS.temp,["−40 °C","0 °C","35 °C"]],rain:["Annual rainfall",RAMPS.rain,["0 mm","1,500 mm","3,500 mm"]],cost:["Travel cost · open grassland = 1×",RAMPS.cost,["0.4×","3×","24×"]]}[mode];
  $("legendLabel").textContent=map[0];
  const st=map[1],a=st[0][0],z=st[st.length-1][0];
  el.innerHTML='<div class="ramp" style="background:linear-gradient(90deg,'+st.map(s=>'rgb('+s[1]+','+s[2]+','+s[3]+') '+((s[0]-a)/(z-a)*100).toFixed(1)+'%').join(",")+')"></div><div class="rampticks"><span>'+map[2][0]+'</span><span>'+map[2][1]+'</span><span>'+map[2][2]+'</span></div>';
}
function sliderLabels(){
  const sc=+$("sScale").value;$("oScale").textContent=sc>2.6?"Continents":sc>1.7?"Mixed":"Archipelago";
  if(sc<1.7)$("oScale").textContent=sc<1.2?"Archipelago":"Island chains";
  if(sc>2.6)$("oScale").textContent=sc>3.1?"Supercontinent":"Continents";
  $("oRough").textContent=Math.round((+$("sRough").value-0.38)/0.26*100)+"%";
  const t=+$("sTemp").value;$("oTemp").textContent=(t>0?"+":t<0?"−":"±")+Math.abs(t)+" °C";
}
function readParams(){worldRev++;P.sea=+$("sSea").value;P.scale=4.2-+$("sScale").value;P.rough=+$("sRough").value;P.temp=+$("sTemp").value;sliderLabels();}

let regenTimer=0;
function regenerate(){
  setStatus("Generating…");analyseWorld();
  SIM=null;simGen++;routeGen++;$("timebar").hidden=true; // a new world invalidates the simulation; rebuild it only if its tab is open
  if(isArena()){const rg=routeGen;sched.add(routeTask(rg,(n,total,km,done)=>{if(rg!==routeGen)return;compose();if(done)arenaStats();}));} // a battle map's roads belong to the map itself
  else if(ui.tab==="sim")startSim();
  updatePanel();renderNow();
}
function newSeed(seed){
  seed=(seed||"").toLowerCase().replace(/[^a-z0-9-]/g,"").slice(0,32)||"ember-4";
  $("seed").value=seed;setSeed(seed);readParams();
  try{window.history.replaceState(null,"",hashFor());}catch(e){} // window.: the history engine (06) shadows the name
  view.cx=WX/2;view.cy=0.5;view.zoom=1;regenerate();
}
function randomSeed(){const w=makeLanguage(Math.random)(2).toLowerCase();return w+"-"+(10+Math.floor(Math.random()*90));}


/* ---- map kind: planet or battle map ---- */
// The link names the map: "#seed" for a planet, "#seed@a8.snow.island" for an 8 km snowy island battle map.
// an element shows when it belongs to the open tab (data-pane) and to the current kind of map (data-kind)
function showPanes(){
  document.querySelectorAll("[data-pane],[data-kind]").forEach(e=>{
    e.hidden=(e.dataset.pane&&e.dataset.pane!==ui.tab)||(e.dataset.kind&&e.dataset.kind!==P.kind)||false;
  });
}
const hashFor=()=>"#"+P.seed+(isArena()?"@a"+P.km+"."+P.theme+"."+P.layout:"");
function parseHash(h){ // sets the map kind and options from a link; returns the seed, or "" when the link is not one of ours
  const m=/^([a-z0-9-]{1,32})(?:@a(4|6|8)\.(temperate|snow|desert|jungle)\.(island|coast|inland))?$/.exec(h||"");
  if(!m)return "";
  if(m[2])Object.assign(P,{kind:"arena",km:+m[2],theme:m[3],layout:m[4]});else P.kind="world";
  return m[1];
}
function applyKind(){
  setKind();const a=isArena();
  showPanes();$("layerSeg").querySelector('[data-mode="biome"]').textContent=a?"Aerial":"Biomes";
  document.querySelectorAll("#kindSeg button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.k===P.kind?"true":"false"));
  $("optGrid").checked=$("optGridA").checked=opt.grid;$("aSize").value=P.km;$("aTheme").value=P.theme;$("aLayout").value=P.layout;
  document.querySelector('.tabs [data-tab="sim"]').hidden=a;
  if(a&&ui.tab==="sim")setTab("gen");
  updateLegend();mcSizes();
}
function arenaStats(){
  const net=W0.net,n=W0.cities.length,sites=W0.cities.filter(c=>c.cls==="site").length;
  $("stats").innerHTML=
    '<div><strong>'+P.km+' × '+P.km+' km</strong><span>'+THEMES[P.theme].name+' · '+LAYOUTS[P.layout]+'</span></div>'+
    '<div><strong>'+Math.round(W0.land*100)+'%</strong><span>Land surface</span></div>'+
    '<div><strong>'+n+'</strong><span>Named places · '+sites+' compounds</span></div>'+
    '<div><strong>'+fmtInt(W0.bld.length/5)+'</strong><span>Buildings</span></div>'+
    '<div><strong>'+(net?(net.km<10?net.km.toFixed(1):fmtInt(net.km))+' km':"…")+'</strong><span>Roads</span></div>'+
    '<div><strong>'+(net?net.bridges:"…")+'</strong><span>Bridges</span></div>'+
    '<div><strong>'+fmtInt(W0.peak.h)+' m</strong><span>'+peakName+'</span></div>'+
    '<div><strong>'+W0.mouths+'</strong><span>Streams reaching the sea</span></div>';
}
