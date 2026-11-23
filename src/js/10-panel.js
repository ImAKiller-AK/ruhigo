/* ---------------- Readout + panel ---------------- */
function readAt(wx,wy,title){
  if(!N||wx<0||wx>2||wy<0||wy>1)return;
  const oct=full?full.oct+1:low?low.oct+2:10;
  const h=meters(elev(wx,wy,oct));climate(wx,wy,h,oct);const T=cT,R=cR,b=biome(h,T,R);
  const lat=90-wy*180,lon=wx/2*360-180;
  $("readLabel").textContent=title||"Terrain readout";
  $("readout").innerHTML=
    '<div class="biome"><span class="sw" style="background:'+rgb(B[b][1])+'"></span>'+B[b][0]+'</div>'+
    '<dt>Position</dt><dd>'+Math.abs(lat).toFixed(2)+'°'+(lat>=0?"N":"S")+' '+Math.abs(lon).toFixed(2)+'°'+(lon>=0?"E":"W")+'</dd>'+
    '<dt>'+(h<0?"Depth":"Elevation")+'</dt><dd>'+fmtInt(Math.abs(h))+' m</dd>'+
    '<dt>Mean temperature</dt><dd>'+(T<0?"−":"")+Math.abs(T).toFixed(1)+' °C</dd>'+
    '<dt>Rainfall</dt><dd>'+(h<0?"—":fmtInt(R)+' mm/yr')+'</dd>'+
    (ui.tab==="sim"&&W0.cost?'<dt>Travel cost</dt><dd>'+(h<0?FRICTION[b]:costAt(wx,wy)).toFixed(1)+'×</dd>':'');
}
function updatePanel(){
  $("worldName").textContent=worldName;$("seedTxt").textContent=P.seed;
  document.title=worldName+" · Worldsmith";
  $("stats").innerHTML=
    '<div><strong>'+Math.round(W0.land*100)+'%</strong><span>Land surface</span></div>'+
    '<div><strong>'+W0.masses+'</strong><span>Major landmasses</span></div>'+
    '<div><strong>'+fmtInt(W0.peak.h)+' m</strong><span>'+peakName+'</span></div>'+
    '<div><strong>'+W0.mouths+'</strong><span>Rivers reaching the sea</span></div>';
  const ul=$("cities");ul.innerHTML="";
  W0.cities.forEach((c,i)=>{
    const li=document.createElement("li"),bt=document.createElement("button");bt.type="button";
    bt.innerHTML='<span class="mark'+(c.cap?" cap":"")+'"></span><span>'+c.name+(c.cap?" · capital":"")+'<span class="meta">'+B[c.biome][0]+' · '+fmtInt(c.h)+' m</span></span><span class="pop">'+fmtPop(c.pop)+'</span>';
    bt.addEventListener("click",()=>{const sim=simOn();flyTo(c.x,c.y,sim?10:28);select(sim?{kind:"city",id:i}:{kind:"point",wx:c.x,wy:c.y,title:c.name});});
    li.appendChild(bt);ul.appendChild(li);
  });
  $("oSea").textContent=Math.round(W0.land*100)+"% land";
  const cap=W0.cities[0];if(cap)select({kind:"point",wx:cap.x,wy:cap.y,title:cap.name+" · capital"});
}
function updateLegend(){
  const el=$("legend");
  if(mode==="biome"){
    $("legendLabel").textContent="Biomes";
    el.innerHTML='<div class="legend">'+B.map(b=>'<div><span class="sw" style="background:'+rgb(b[1])+'"></span>'+b[0]+'</div>').join("")+'</div>';
    return;
  }
  const map={relief:["Elevation above sea level",RAMPS.reliefL,["0 m","3,000 m","6,200 m"]],temp:["Mean annual temperature",RAMPS.temp,["−40 °C","0 °C","35 °C"]],rain:["Annual rainfall",RAMPS.rain,["0 mm","1,500 mm","3,500 mm"]],cost:["Travel cost · open grassland = 1×",RAMPS.cost,["0.4×","3×","24×"]]}[mode];
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
  if(ui.tab==="sim")startSim();
  updatePanel();renderNow();
}
function newSeed(seed){
  seed=(seed||"").toLowerCase().replace(/[^a-z0-9-]/g,"").slice(0,32)||"ember-4";
  $("seed").value=seed;setSeed(seed);readParams();
  try{history.replaceState(null,"","#"+seed);}catch(e){}
  view.cx=1;view.cy=0.5;view.zoom=1;regenerate();
}
function randomSeed(){const w=makeLanguage(Math.random)(2).toLowerCase();return w+"-"+(10+Math.floor(Math.random()*90));}

