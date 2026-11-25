/* ---------------- Rendering ---------------- */
const canvas=$("map"),ctx=canvas.getContext("2d"),mapEl=$("mapWrap");
const BG=[12,20,28],BGCSS="rgb(12,20,28)";
let cssW=800,cssH=500,dpr=1;
const view={cx:1,cy:0.5,zoom:1};
let mode="biome";
const opt={rivers:true,cities:true,grid:true,borders:true,routes:true,res:false,roads:true,bld:true};
const unit=()=>Math.max(WX/cssW,1/cssH)/view.zoom; // world units per CSS px

const RAMPS={
  oceanB:[[-6200,16,42,72],[-3000,26,64,104],[-1200,40,92,132],[-150,72,134,170],[0,100,162,188]],
  reliefL:[[0,86,138,86],[300,128,166,96],[900,198,190,122],[1800,186,142,90],[3000,142,112,92],[4600,176,170,166],[6200,246,246,244]],
  reliefO:[[-6200,20,48,88],[-2000,46,98,154],[-200,108,168,208],[0,158,204,226]],
  temp:[[-40,40,52,130],[-20,70,112,196],[-5,160,200,228],[5,228,236,220],[15,240,214,140],[25,228,128,60],[35,158,36,40]],
  rain:[[0,226,204,150],[300,214,196,120],[800,150,180,96],[1500,74,150,104],[2500,40,110,140],[3500,34,70,140]],
  cost:[[-1.3,24,52,74],[-0.15,46,110,104],[0.58,120,160,96],[1.58,214,190,110],[2.58,206,120,70],[3.58,150,52,56],[4.58,240,236,232]] // log2 of the cost multiplier
};
const col=[0,0,0];
function ramp(st,v){
  if(v<=st[0][0]){col[0]=st[0][1];col[1]=st[0][2];col[2]=st[0][3];return;}
  for(let i=1;i<st.length;i++){const b=st[i];if(v<=b[0]){const a=st[i-1],t=(v-a[0])/(b[0]-a[0]);col[0]=a[1]+(b[1]-a[1])*t;col[1]=a[2]+(b[2]-a[2])*t;col[2]=a[3]+(b[3]-a[3])*t;return;}}
  const l=st[st.length-1];col[0]=l[1];col[1]=l[2];col[2]=l[3];
}
function makeJob(scale){
  const W=Math.max(8,Math.round(cssW*scale)),H=Math.max(4,Math.round(cssH*W/cssW)),U=unit()*cssW/W;
  const oct=Math.max(3,Math.min(18,Math.round(Math.log2(1/(U*noiseScale())))+1));
  const cv=document.createElement("canvas");cv.width=W;cv.height=H;
  return {W,H,U,oct,cx:view.cx,cy:view.cy,E:(isArena()?1.1:9)/Math.pow(view.zoom,0.08),
    hs:new Float32Array(W*H),ts:new Float32Array(W*H),rs:new Float32Array(W*H),img:new ImageData(W,H),cv,cx2:cv.getContext("2d"),row:0,shaded:0,put:0};
}
function computeRow(j,py){
  const {W,H,U,hs,ts,rs,oct}=j,wy=j.cy+(py+0.5-H/2)*U;
  for(let px=0;px<W;px++){
    const k=py*W+px,wx=j.cx+(px+0.5-W/2)*U;
    if(wx<0||wx>WX||wy<0||wy>1){hs[k]=NaN;continue;}
    const h=meters(elev(wx,wy,oct));hs[k]=h;climate(wx,wy,h,oct);ts[k]=cT;rs[k]=cR;
  }
}
function shadeRow(j,py){
  const {W,H,hs,ts,rs,E}=j,d=j.img.data,mpp=j.U*MPU,ar=isArena(),snow=ar&&P.theme==="snow",top=ar?arenaTop():0;
  const Lx=-0.58,Ly=-0.58,Lz=0.57;
  for(let px=0;px<W;px++){
    const k=py*W+px,o=k*4,h=hs[k];d[o+3]=255;
    if(h!==h){d[o]=BG[0];d[o+1]=BG[1];d[o+2]=BG[2];continue;}
    let hL=px>0?hs[k-1]:h,hR=px<W-1?hs[k+1]:h,hU=py>0?hs[k-W]:h,hD=py<H-1?hs[k+W]:h;
    if(hL!==hL)hL=h;if(hR!==hR)hR=h;if(hU!==hU)hU=h;if(hD!==hD)hD=h;
    const sea=h<0,coast=!sea&&(hL<0||hR<0||hU<0||hD<0);
    const g=v=>v<0?v*(ar?0.4:0.1):v;
    const dzx=(g(hR)-g(hL))/(2*mpp)*E,dzy=(g(hD)-g(hU))/(2*mpp)*E;
    const len=Math.sqrt(dzx*dzx+dzy*dzy+1);
    let f=1+((-dzx*Lx-dzy*Ly+Lz)/len-Lz)*1.7;
    if(sea)f=1+(f-1)*0.5;
    f=f<0.35?0.35:f>1.55?1.55:f;
    const T=ts[k],R=rs[k];
    if(ar&&mode==="biome"){ // battle maps: an aerial-photo look instead of flat biome colours
      const s0=Math.hypot(hR-hL,hD-hU)/(2*mpp);
      aerial(j.cx+(px+0.5-W/2)*j.U,j.cy+(py+0.5-H/2)*j.U,h,R,s0,top,mpp);
      // soft, daylit shading: the relief is there but quiet, and the whole map is lifted a little
      f=(1+(f-1)*(sea?0.2:snow?0.55:0.4))*(sea?1.04:1.1);
      if(snow&&!sea&&f<1.1){col[2]+=(1.1-f)*40;} // snow in shadow turns blue
      const r=col[0]*f,gg=col[1]*f,b=col[2]*f;
      d[o]=r>255?255:r;d[o+1]=gg>255?255:gg;d[o+2]=b>255?255:b;continue;
    }
    if(mode==="biome"){
      if(sea){if(T<-9){col[0]=212;col[1]=224;col[2]=232;}else ramp(RAMPS.oceanB,ar?h*45:h);}
      else{
        const c=B[biome(h,T,R)][1];const lift=1+Math.min(h,3500)/3500*0.1;col[0]=c[0]*lift;col[1]=c[1]*lift;col[2]=c[2]*lift;
        if(snow){const w=0.45+0.5*smooth(300,800,R);col[0]+=(236-col[0])*w;col[1]+=(240-col[1])*w;col[2]+=(244-col[2])*w;} // snow lies thinner where it is dry and windswept
      }
    }else if(mode==="relief"){ramp(sea?RAMPS.reliefO:RAMPS.reliefL,ar?(sea?h*45:h/top*6200):h);}
    else if(mode==="temp"){ramp(RAMPS.temp,T);if(sea){col[0]*=0.55;col[1]*=0.6;col[2]*=0.68;}}
    else if(mode==="rain"){if(sea){col[0]=26;col[1]=40;col[2]=56;}else ramp(RAMPS.rain,R);}
    else ramp(RAMPS.cost,Math.log2(sea?FRICTION[biome(h,T,R)]:costAt(j.cx+(px+0.5-W/2)*j.U,j.cy+(py+0.5-H/2)*j.U)));
    if(coast)f*=0.78;
    const r=col[0]*f,gg=col[1]*f,b=col[2]*f;
    d[o]=r>255?255:r;d[o+1]=gg>255?255:gg;d[o+2]=b>255?255:b;
  }
}
function stepJob(j,budget){
  const t0=performance.now();
  while(j.row<j.H){
    computeRow(j,j.row);
    if(j.row>0){shadeRow(j,j.row-1);j.shaded=j.row;}
    j.row++;
    if(budget&&performance.now()-t0>budget)break;
  }
  if(j.row>=j.H&&j.shaded<j.H){shadeRow(j,j.H-1);j.shaded=j.H;}
  if(j.shaded>j.put){j.cx2.putImageData(j.img,0,0,0,j.put,j.W,j.shaded-j.put);j.put=j.shaded;}
}
function reshade(j){if(!j||j.shaded<j.H)return false;for(let y=0;y<j.H;y++)shadeRow(j,y);j.cx2.putImageData(j.img,0,0);return true;}

let low=null,full=null,fullTimer=0,raf=0;
function compose(){
  ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle=BGCSS;ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.imageSmoothingEnabled=true;
  if(low)ctx.drawImage(low.cv,0,0,low.W,low.H,0,0,canvas.width,canvas.height);
  if(full&&full.put>0)ctx.drawImage(full.cv,0,0,full.W,full.put,0,0,canvas.width,full.put*canvas.height/full.H);
  drawOverlay();
}
function renderNow(){
  const s=Math.sqrt(52000/(cssW*cssH));
  low=makeJob(Math.min(1,s));stepJob(low,0);
  full=null;compose();updateChrome();
  clearTimeout(fullTimer);fullTimer=setTimeout(startFull,170);
  setStatus("Sketching…");
}
function request(){if(raf)return;raf=requestAnimationFrame(()=>{raf=0;renderNow();});}
function startFull(){
  const s=Math.min(dpr,1.6,Math.sqrt(1.15e6/(cssW*cssH)));
  const j=full=makeJob(s);
  const run=()=>{
    if(full!==j)return;
    stepJob(j,16);compose();
    if(j.shaded<j.H){setStatus("Surveying "+Math.round(j.shaded/j.H*100)+"%");setTimeout(run,0);}
    else setStatus(j.oct+" noise octaves · "+(j.W*j.H/1e6).toFixed(2)+" MP");
  };
  run();
}
function setStatus(t){$("status").textContent=t;}

function drawOverlay(){
  const u=unit(),hw=cssW/2,hh=cssH/2,cx=view.cx,cy=view.cy;
  const sx=x=>(x-cx)/u+hw,sy=y=>(y-cy)/u+hh;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.lineCap="round";ctx.lineJoin="round";
  // world frame
  ctx.strokeStyle="rgba(233,227,211,.25)";ctx.lineWidth=1;ctx.strokeRect(sx(0),sy(0),WX/u,1/u);
  if(isArena())drawArenaBorder(sx,sy,u);
  if(opt.grid&&isArena())drawArenaGrid(sx,sy,u);
  else if(opt.grid){
    const z=view.zoom,step=z<2.5?30:z<7?10:z<20?5:z<80?1:z<400?0.25:0.05;
    ctx.strokeStyle="rgba(233,227,211,.13)";ctx.lineWidth=1;ctx.beginPath();
    ctx.font="500 10px 'JetBrains Mono', monospace";ctx.fillStyle="rgba(233,227,211,.6)";
    const labels=[];
    const lon0=Math.max(-180,Math.ceil(((cx-hw*u)/2*360-180)/step)*step),lon1=Math.min(180,(cx+hw*u)/2*360-180);
    for(let lon=lon0;lon<=lon1+1e-9;lon+=step){const x=sx((lon+180)/360*2);ctx.moveTo(x,Math.max(0,sy(0)));ctx.lineTo(x,Math.min(cssH,sy(1)));labels.push([fmtDeg(lon,"E","W"),x+4,Math.max(sy(0),0)+52]);}
    const lat0=Math.max(-90,Math.ceil((90-(cy+hh*u)*180)/step)*step),lat1=Math.min(90,90-(cy-hh*u)*180);
    for(let lat=lat0;lat<=lat1+1e-9;lat+=step){const y=sy((90-lat)/180);ctx.moveTo(Math.max(0,sx(0)),y);ctx.lineTo(Math.min(cssW,sx(2)),y);labels.push([fmtDeg(lat,"N","S"),Math.max(sx(0),0)+6,y-4]);}
    ctx.stroke();
    for(const [t,x,y] of labels)if(x>0&&x<cssW-30&&y>12&&y<cssH-30)ctx.fillText(t,x,y);
  }
  drawSimUnder(sx,sy,u);
  if(opt.rivers&&W0){const arR=W0.kind==="arena";
    const zf=Math.pow(view.zoom,0.42),widths=[0.8,1.1,1.5,2,2.6,3.3];
    ctx.strokeStyle=arR&&mode==="biome"?"rgba(52,112,122,.8)":mode==="biome"||mode==="relief"?"rgba(58,118,166,.95)":"rgba(16,32,56,.75)";
    for(let b=0;b<6;b++){
      const a=W0.buckets[b];if(!a.length)continue;ctx.lineWidth=arR?Math.min(7,widths[b]*0.6*zf):Math.min(14,widths[b]*zf);ctx.beginPath();
      for(let q=0;q<a.length;q+=4){
        const x1=sx(a[q]),y1=sy(a[q+1]),x2=sx(a[q+2]),y2=sy(a[q+3]);
        if((x1<-20&&x2<-20)||(x1>cssW+20&&x2>cssW+20)||(y1<-20&&y2<-20)||(y1>cssH+20&&y2>cssH+20))continue;
        ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);
      }
      ctx.stroke();
    }
  }
  if(W0&&W0.deco&&opt.bld)drawDecor(sx,sy,u,0);
  drawSimRoutes(sx,sy);
  if(W0&&W0.bld&&opt.bld){drawBuildings(sx,sy,u);if(W0.deco)drawDecor(sx,sy,u,1);}
  if(opt.cities&&W0){
    const boxes=[];
    const label=(text,x,y,font,color)=>{
      ctx.font=font;const w=ctx.measureText(text).width,bx=x+8,by=y-7;
      if(boxes.some(b=>bx<b[0]+b[2]&&bx+w>b[0]&&by<b[1]+15&&by+15>b[1]))return false;
      boxes.push([bx,by,w,15]);
      ctx.lineWidth=3.5;ctx.strokeStyle="rgba(10,16,22,.82)";ctx.strokeText(text,bx,y+4);ctx.fillStyle=color;ctx.fillText(text,bx,y+4);return true;
    };
    const pk=W0.peak,px=sx(pk.x),py=sy(pk.y);
    if(W0.kind!=="arena"&&px>-20&&px<cssW+20&&py>-20&&py<cssH+20){
      ctx.fillStyle="#e9e3d3";ctx.strokeStyle="rgba(10,16,22,.85)";ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(px,py-6);ctx.lineTo(px+5,py+3);ctx.lineTo(px-5,py+3);ctx.closePath();ctx.stroke();ctx.fill();
      label(peakName+" "+fmtInt(pk.h)+" m",px,py,"italic 500 11px Inter, sans-serif","#e9e3d3");
    }
    if(W0.kind==="arena")arenaLabels(sx,sy);
    else W0.cities.forEach((c,i)=>{
      const x=sx(c.x),y=sy(c.y);if(x<-40||x>cssW+40||y<-20||y>cssH+20)return;
      if(!c.cap&&view.zoom<1.6&&i>9)return;
      ctx.lineWidth=2;ctx.strokeStyle="rgba(10,16,22,.9)";
      if(c.cap){ctx.fillStyle="#d9a548";ctx.strokeRect(x-4.5,y-4.5,9,9);ctx.fillRect(x-4.5,y-4.5,9,9);}
      else{ctx.fillStyle="#e9e3d3";ctx.beginPath();ctx.arc(x,y,3.4,0,Math.PI*2);ctx.stroke();ctx.fill();}
      label(c.name,x,y,(c.cap?"700 13px":"600 12px")+" Inter, sans-serif",c.cap?"#f1c877":"#e9e3d3");
    });
  }
  drawSimOver(sx,sy);
  if(mc.area==="view"&&!isArena()){ // the square a Minecraft export will cover
    const s=mcFramePx(),x=(cssW-s)/2,y=(cssH-s)/2;
    ctx.setLineDash([7,5]);ctx.lineWidth=3.5;ctx.strokeStyle="rgba(10,16,22,.75)";ctx.strokeRect(x,y,s,s);
    ctx.lineWidth=1.5;ctx.strokeStyle="#d9a548";ctx.strokeRect(x,y,s,s);ctx.setLineDash([]);
    ctx.font="500 10px 'JetBrains Mono', monospace";ctx.lineWidth=3;ctx.strokeStyle="rgba(10,16,22,.82)";
    ctx.strokeText("MINECRAFT EXPORT AREA",x+6,y+s-7);ctx.fillStyle="#f1c877";ctx.fillText("MINECRAFT EXPORT AREA",x+6,y+s-7);
  }
}
function updateChrome(){
  const z=view.zoom;$("zoomTxt").textContent="×"+(z<10?z.toFixed(1):Math.round(z));
  const km=unit()*MPU/1000,raw=km*110,p=Math.pow(10,Math.floor(Math.log10(raw)));
  const nice=raw/p>=5?5*p:raw/p>=2?2*p:p;
  $("scaleBar").style.width=(nice/km).toFixed(1)+"px";
  $("scaleTxt").textContent=nice>=1?fmtInt(nice)+" km":fmtInt(nice*1000)+" m";
  mcInfo();
}


/* ---- battle map overlays ---- */
// a 1 km grid lettered A, B, C… across and numbered down, the way such maps are read; 100 m lines once zoomed in
function drawArenaGrid(sx,sy,u){
  const km=1000/MPU,fine=km/10;
  const lines=(step,alpha)=>{
    ctx.strokeStyle="rgba(233,227,211,"+alpha+")";ctx.lineWidth=1;ctx.beginPath();
    for(let x=0;x<=WX+1e-9;x+=step){const X=sx(x);if(X<-1||X>cssW+1)continue;ctx.moveTo(X,Math.max(0,sy(0)));ctx.lineTo(X,Math.min(cssH,sy(1)));}
    for(let y=0;y<=1+1e-9;y+=step){const Y=sy(y);if(Y<-1||Y>cssH+1)continue;ctx.moveTo(Math.max(0,sx(0)),Y);ctx.lineTo(Math.min(cssW,sx(WX)),Y);}
    ctx.stroke();
  };
  if(fine/u>14)lines(fine,0.07);
  lines(km,0.16);
  ctx.font="500 10px 'JetBrains Mono', monospace";ctx.fillStyle="rgba(233,227,211,.62)";
  const n=Math.round(P.km),top=Math.max(sy(0),0)+52,left=Math.max(sx(0),0)+6;
  for(let i=0;i<n;i++){const X=sx((i+0.5)*km);if(X>30&&X<cssW-30&&top<cssH-30)ctx.fillText(String.fromCharCode(65+i),X-3,top);}
  for(let j=0;j<n;j++){const Y=sy((j+0.5)*km);if(Y>70&&Y<cssH-40)ctx.fillText(String(j+1),left,Y+4);}
}
// buildings: pale footprints, drawn as soon as they are a pixel or more across
// roofs: mostly cream, then grey, terracotta, slate blue and white, fixed per building; from afar all read cream
const ROOFS=[["#eee3bf",0.55],["#c9c7c0",0.75],["#b8735e",0.87],["#8f9cab",0.95],["#f4f3ee",1]];
function drawBuildings(sx,sy,u){
  const b=W0.bld,px=12/(u*MPU);if(px<0.6)return;
  if(px<2){drawRoofs(sx,sy,u,b,-1,"rgba(246,236,196,.95)",false);return;}
  for(let g=0;g<ROOFS.length;g++)drawRoofs(sx,sy,u,b,g,ROOFS[g][0],px>=3);
}
function drawRoofs(sx,sy,u,b,group,fill,outline){
  ctx.fillStyle=fill;ctx.lineWidth=1;const px=12/(u*MPU);
  if(outline){ctx.shadowColor="rgba(0,0,0,.45)";ctx.shadowBlur=Math.min(6,px*0.25);ctx.shadowOffsetX=ctx.shadowOffsetY=Math.min(4,px*0.15);}
  ctx.beginPath();
  for(let q=0;q<b.length;q+=5){
    if(group>=0){const h=hash2(q,77),g=ROOFS.findIndex(r=>h<r[1]);if(g!==group)continue;}
    const x=sx(b[q]),y=sy(b[q+1]);if(x<-40||x>cssW+40||y<-40||y>cssH+40)continue;
    const w=Math.max(1,b[q+2]/u),h=Math.max(1,b[q+3]/u),a=b[q+4],c=Math.cos(a)/2,s=Math.sin(a)/2;
    ctx.moveTo(x-w*c+h*s,y-w*s-h*c);ctx.lineTo(x+w*c+h*s,y+w*s-h*c);ctx.lineTo(x+w*c-h*s,y+w*s+h*c);ctx.lineTo(x-w*c-h*s,y-w*s+h*c);ctx.closePath();
  }
  ctx.fill();ctx.shadowColor="transparent";ctx.shadowBlur=ctx.shadowOffsetX=ctx.shadowOffsetY=0;
  if(outline){ctx.strokeStyle="rgba(70,60,40,.55)";ctx.stroke();}
}
// place names: cities large, towns and villages plain, compounds smaller; minor names wait for zoom or room
// white names with a soft shadow, centred on the place, as on aerial game maps; no markers
function arenaLabels(sx,sy){
  const rank={city:0,town:1,site:2,village:3},list=W0.cities.slice().sort((a,b)=>rank[a.cls]-rank[b.cls]),boxes=[];
  const zs=Math.min(1.25,0.85+0.15*Math.log2(view.zoom+1));
  ctx.save();ctx.textAlign="center";ctx.textBaseline="middle";
  for(const c of list){
    const x=sx(c.x),y=sy(c.y);if(x<-80||x>cssW+80||y<-20||y>cssH+20)continue;
    const size=(c.cls==="city"?19:c.cls==="town"?14:c.cls==="site"?11.5:12.5)*zs;
    ctx.font=(c.cls==="city"?"600 ":c.cls==="town"?"600 ":"500 ")+size.toFixed(1)+"px Inter, sans-serif";
    const w=ctx.measureText(c.name).width,b=[x-w/2-3,y-size*0.6,w+6,size*1.2];
    if(boxes.some(o=>b[0]<o[0]+o[2]&&b[0]+b[2]>o[0]&&b[1]<o[1]+o[3]&&b[1]+b[3]>o[1]))continue;
    boxes.push(b);
    // a soft dark halo first, so names read on snow and sand as well as on forest
    ctx.shadowColor="rgba(0,0,0,.9)";ctx.shadowBlur=7;ctx.lineJoin="round";ctx.lineWidth=size*0.28;ctx.strokeStyle="rgba(20,22,24,.42)";ctx.strokeText(c.name,x,y);
    ctx.shadowBlur=3;ctx.shadowOffsetY=1;
    ctx.fillStyle=c.cls==="site"?"rgba(236,238,240,.92)":"rgba(248,248,246,.98)";ctx.fillText(c.name,x,y);
    ctx.shadowBlur=0;ctx.shadowOffsetY=0;
  }
  ctx.restore();
}

/* ---- battle maps: aerial-photo colouring ---- */
// Muted ground colours per climate, mixed by moisture, slope and height, with texture laid in world space (so it
// holds still while panning): patches of ~150 m, clumps of ~35 m, tree crowns of ~12 m and a fine grain of ~4 m.
// Farmland appears as parcels on low, gentle ground where a slow noise allows it.
const AERIAL={
  temperate:{open:[100,108,68],dry:[134,126,90],soil:[122,100,72],forest:[50,64,40],rock:[116,108,94],beach:[180,166,132],field:[[118,126,70],[150,140,86],[112,96,68],[96,112,62]],farm:0.62},
  snow:{open:[222,226,231],dry:[200,205,211],soil:[168,160,150],forest:[62,74,68],rock:[100,100,103],beach:[160,158,152],field:[[214,218,222],[198,202,206]],farm:0.75},
  desert:{open:[150,118,84],dry:[182,150,106],soil:[126,94,66],forest:[106,98,64],rock:[106,80,60],beach:[196,174,134],field:[[132,118,72],[170,140,96],[120,104,70]],farm:0.5},
  jungle:{open:[86,108,56],dry:[128,118,78],soil:[124,98,66],forest:[42,68,36],rock:[108,98,82],beach:[182,168,130],field:[[110,126,60],[136,130,78],[92,116,52]],farm:0.58}
};
const mixc=(c,t)=>{col[0]+=(c[0]-col[0])*t;col[1]+=(c[1]-col[1])*t;col[2]+=(c[2]-col[2])*t;};
const hash2=(a,b)=>{let h=Math.imul(a,374761393)^Math.imul(b,668265263);h=Math.imul(h^h>>>13,1274126177);return ((h^h>>>16)>>>0)/4294967296;};
function aerial(wx,wy,h,R,sl,top,mpp){
  const th=AERIAL[P.theme]||AERIAL.temperate,mx=wx*MPU,my=wy*MPU; // metres
  if(h<0){ // turquoise over the shallows, slate blue in deep water
    const dd=-h,t1=smooth(0,9,dd),t2=smooth(9,50,dd),w=0.04*N.t(mx/90,my/90);
    col[0]=72;col[1]=164;col[2]=160;mixc([30,98,118],t1);mixc([14,40,64],t2);
    const rocky=smooth(0.02,0.28,N.c(mx/1100+2.7,my/1100-6.3));if(rocky>0)mixc([34,92,106],rocky*0.55*(1-t2)); // no turquoise off rocks
    col[0]*=1+w;col[1]*=1+w;col[2]*=1+w;return;
  }
  const lo=THEMES[P.theme].R[0],hi=THEMES[P.theme].R[1],m=(R-lo)/(hi-lo);
  const p1=N.t(mx/160+31,my/160),p2=N.t(mx/38-17,my/38+5),p3=N.t(mx/12+3,my/12-9);
  // open ground, drier where the clumps say so, then forest where it is wet enough
  col[0]=th.open[0];col[1]=th.open[1];col[2]=th.open[2];
  mixc(th.dry,Math.max(0,Math.min(1,0.45+0.7*p2-0.5*m+0.3*p1+0.9*smooth(top*0.2,top*0.65,h)))); // highland turns brown and dry
  // bare brown earth: patches of soil of a few hundred metres, more on dry ground and slopes, never one colour
  const soil=smooth(0.12,0.55,N.k(mx/260+9.4,my/260-2.2)+0.35*p2+0.2*p1-0.35*m+0.6*sl);
  mixc(th.soil,soil*(0.5+0.25*p3)*(P.theme==="snow"?0.15:1)); // under snow, earth shows only here and there
  // woods: a regional density shaded continuously, so a wood fades through scrub into open ground instead of
  // ending in a cut-out edge; single crowns (light tops, dark gaps, ~7 m) only show once they are a few pixels
  // wide, and from afar a wood reads as soft dark mottling, as on an aerial photo
  const fine=smooth(7,2.5,mpp);
  let dens=smooth(0.3,0.85,m+0.28*p1+0.12*p2-0.35*smooth(top*0.3,top*0.75,h));
  if(P.theme==="desert")dens*=0.5;else if(P.theme==="snow")dens*=smooth(0.4,0.85,m+0.2*p1);
  const p4=N.e(mx/6.5+7,my/6.5-3);
  let cl=0; // towns and compounds stand in cleared, trodden ground: fewer trees, each still crisp
  if(W0&&W0.kind==="arena")for(const c of W0.cities){const dx=mx-c.x*MPU,dy=my-c.y*MPU,R=c.r*1.2+40;if(dx*dx+dy*dy<R*R)cl=Math.max(cl,smooth(R,c.r*0.75,Math.sqrt(dx*dx+dy*dy)+30*p2));}
  if(cl>0){dens*=1-cl*0.9;mixc(th.soil,cl*0.25);}
  let fo=Math.max(0,Math.min(1,(dens-0.12)*1.35+0.22*p2+0.18*p3+0.3*p4*fine));
  fo=fo*fo*(3-2*fo);
  const scrub=(1-fo)*smooth(0.15,0.75,p3*0.6+p2*0.5+0.3*m)*(P.theme==="desert"?0.25:P.theme==="snow"?0.15:0.38)*(1-cl*0.6); // bushes and lone trees, soft

  // farmland: parcels of 70–160 m with thin darker margins, never on slopes or high ground
  const fm=smooth(th.farm,th.farm+0.05,N.c(mx/1400+4.1,my/1400))*smooth(0.12,0.05,sl)*smooth(top*0.45,top*0.2,h);
  if(fm>0.02){
    const ux=mx/150+0.6*N.k(mx/900,my/900),uy=my/75,ix=Math.floor(ux),iy=Math.floor(uy),fx=ux-ix,fy=uy-iy;
    const pick=hash2(ix,iy),fc=th.field[Math.floor(pick*th.field.length)],edge=Math.min(fx,1-fx)*150<3||Math.min(fy,1-fy)*75<3;
    mixc(fc,fm*(edge?0.55:0.92));if(edge)mixc([60,62,44],fm*0.25);fo*=1-fm;
  }
  if(scrub>0)mixc([th.forest[0]*1.12,th.forest[1]*1.1,th.forest[2]*1.08],scrub*(1-fm));
  if(fo>0){
    const crown=1+fine*0.42*p4+0.1*p3; // sunlit crowns and the shade between them
    mixc([th.forest[0]*crown,th.forest[1]*crown,th.forest[2]*crown],fo*0.92);
    if(P.theme==="snow")mixc([224,228,232],fo*(0.1+0.3*fine*smooth(0,0.7,p4))); // snow lying on the crowns
  }
  // bare rock on steep slopes and the highest ground; sand on the beach
  const rk=P.theme==="snow"?0.5:1; // snow clings to all but the steepest ground
  mixc(th.rock,rk*Math.min(0.8,0.85*smooth(0.45,1.0,sl+0.12*p2)+0.4*smooth(top*0.75,top,h)));
  // the shore alternates: sand in the bays, dark rock and boulders along rocky stretches
  const rocky=smooth(0.02,0.28,N.c(mx/1100+2.7,my/1100-6.3));
  mixc(th.beach,smooth(9,5,h)*(1-rocky));
  if(rocky>0){const sh=smooth(16,5,h)*rocky;mixc([th.rock[0]*0.72,th.rock[1]*0.72,th.rock[2]*0.74],sh*(0.75+0.25*p3));}
  const g=1+0.05*p3+0.05*fine*(hash2(Math.floor(mx/4),Math.floor(my/4))-0.5); // grain, only where it can be seen
  col[0]*=g;col[1]*=g;col[2]*=g;
}

/* ---- landmark ground marks (see siteLayout): layer 0 lies under roads and buildings, layer 1 sits on top ---- */
const DECO_FILL={pave:"rgba(152,150,140,.92)",yard:"rgba(146,140,126,.92)",lawn:"rgb(98,128,68)",pitch:"rgb(88,140,68)",
  runway:"rgb(72,74,74)",pier:"rgb(156,146,124)",pool:"rgb(84,176,204)",logs:"rgb(122,92,60)"};
const DECO_CIRC={tower:["#cfcdc6","rgba(60,58,52,.8)"],tank:["#e2dfd6","rgba(70,66,58,.75)"],pad:["#8d8f8c","rgba(240,240,236,.9)"],
  silo:["#d8d4c8","rgba(70,66,58,.7)"],lighthouse:["#f2f0ea","rgba(170,60,50,.9)"],dome:["#f0efea","rgba(90,90,90,.7)"],mast:["#c8c8c2","rgba(40,40,40,.9)"]};
function drawDecor(sx,sy,u,layer){
  const m=1/(u*MPU),list=W0.deco; // m: pixels per metre
  if(m<0.05)return;
  const rectPath=(d,grow)=>{const x=sx(d.x),y=sy(d.y),w=d.w/u+grow,h=d.h/u+grow,c=Math.cos(d.a)/2,s=Math.sin(d.a)/2;
    ctx.beginPath();ctx.moveTo(x-w*c+h*s,y-w*s-h*c);ctx.lineTo(x+w*c+h*s,y+w*s-h*c);ctx.lineTo(x+w*c-h*s,y+w*s+h*c);ctx.lineTo(x-w*c-h*s,y-w*s+h*c);ctx.closePath();};
  for(const d of list){
    const x=sx(d.x!==undefined?d.x:d.p[0]),y=sy(d.y!==undefined?d.y:d.p[1]);
    if(x<-400||x>cssW+400||y<-400||y>cssH+400)continue;
    if(layer===0){
      if(DECO_FILL[d.t]){
        rectPath(d,0);ctx.fillStyle=DECO_FILL[d.t];ctx.fill();
        if(d.t==="runway"&&m>0.15){ // centre-line dashes
          const c=Math.cos(d.a),s=Math.sin(d.a),L=d.w/u;ctx.strokeStyle="rgba(240,240,232,.85)";ctx.lineWidth=Math.max(0.6,1*m);ctx.setLineDash([12*m,10*m]);
          ctx.beginPath();ctx.moveTo(x-c*L*0.45,y-s*L*0.45);ctx.lineTo(x+c*L*0.45,y+s*L*0.45);ctx.stroke();ctx.setLineDash([]);
        }
        if(d.t==="pitch"){ctx.strokeStyle="rgba(240,244,236,.75)";ctx.lineWidth=Math.max(0.5,0.8*m);rectPath(d,-2*m);ctx.stroke();}
        if(d.t==="pier"){ctx.strokeStyle="rgba(40,38,32,.55)";ctx.lineWidth=0.8;ctx.stroke();}
      }else if(d.t==="pit"){ // quarry: terraces stepping down into a pale pit
        const R=d.r/u;
        for(let i=0;i<5;i++){
          const rr=R*(1-i*0.18);ctx.beginPath();
          for(let a=0;a<=24;a++){const th=a/24*Math.PI*2,q=rr*(1+0.1*Math.sin(3*th+i)+0.05*Math.cos(5*th));a?ctx.lineTo(x+Math.cos(th)*q,y+Math.sin(th)*q*0.85):ctx.moveTo(x+Math.cos(th)*q,y+Math.sin(th)*q*0.85);}
          ctx.fillStyle=i%2?"rgb(150,142,128)":"rgb(176,168,152)";ctx.fill();
          if(m>0.12){ctx.strokeStyle="rgba(80,74,64,.45)";ctx.lineWidth=1;ctx.stroke();}
        }
      }else if(d.t==="oval"){ // stadium bowl or running track
        ctx.save();ctx.translate(x,y);ctx.rotate(d.a);ctx.beginPath();ctx.ellipse(0,0,d.rx/u,d.ry/u,0,0,Math.PI*2);
        if(d.track){ctx.strokeStyle="rgb(170,92,72)";ctx.lineWidth=Math.max(1,8*m);ctx.stroke();}
        else{ctx.strokeStyle="rgba(20,20,18,.45)";ctx.lineWidth=Math.max(2,22*m)+2;ctx.stroke();ctx.strokeStyle="rgb(214,210,200)";ctx.lineWidth=Math.max(2,22*m);ctx.stroke();
          if(m>0.1){ctx.strokeStyle="rgba(120,116,108,.6)";ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,0,d.rx/u,d.ry/u,0,0,Math.PI*2);ctx.stroke();}}
        ctx.restore();
      }else if(d.t==="rail"){
        ctx.strokeStyle="rgba(62,58,52,.85)";ctx.lineWidth=Math.max(0.6,1.8*m);ctx.beginPath();ctx.moveTo(sx(d.p[0]),sy(d.p[1]));
        for(let q=2;q<d.p.length;q+=2)ctx.lineTo(sx(d.p[q]),sy(d.p[q+1]));ctx.stroke();
      }
    }else{
      if(d.t==="wall"||d.t==="fence"){
        ctx.strokeStyle=d.t==="wall"?"rgba(70,66,58,.9)":"rgba(60,60,54,.55)";ctx.lineWidth=Math.max(d.t==="wall"?1:0.6,(d.t==="wall"?3:1.4)*m);
        ctx.beginPath();ctx.moveTo(sx(d.p[0]),sy(d.p[1]));for(let q=2;q<d.p.length;q+=2)ctx.lineTo(sx(d.p[q]),sy(d.p[q+1]));if(d.closed)ctx.closePath();ctx.stroke();
      }else if(DECO_CIRC[d.t]){
        const R=Math.max(1,d.r/u),[fc,sc]=DECO_CIRC[d.t];ctx.beginPath();ctx.arc(x,y,R,0,Math.PI*2);ctx.fillStyle=fc;ctx.fill();
        ctx.strokeStyle=sc;ctx.lineWidth=Math.max(0.6,R*(d.t==="tower"?0.35:0.15));
        if(d.t==="tower"&&R>3){ctx.beginPath();ctx.arc(x,y,R*0.62,0,Math.PI*2);ctx.stroke();}
        else if(R>2){ctx.stroke();}
      }
    }
  }
}

// the edge of the playable area: a wavering reddish line a little inside the map edge, the ground beyond it
// dimmed, and diagonal hatching outside the map, as battle maps mark their bounds
function drawArenaBorder(sx,sy,u){
  const x0=sx(0),y0=sy(0),x1=sx(WX),y1=sy(1),pts=[],n=120;
  for(let i=0;i<4*n;i++){
    const t=(i%n)/n,side=Math.floor(i/n),edge=[[t,0],[1,t],[1-t,1],[0,1-t]][side],nrm=[[0,1],[-1,0],[0,-1],[1,0]][side];
    const inset=(40+45*(N.c(i*0.09+3.3,side*7.1)*0.5+0.5))/MPU;
    pts.push([edge[0]*WX+nrm[0]*inset,edge[1]+nrm[1]*inset]);
  }
  ctx.save();
  ctx.beginPath();ctx.rect(x0,y0,x1-x0,y1-y0);ctx.moveTo(sx(pts[0][0]),sy(pts[0][1]));for(const p of pts)ctx.lineTo(sx(p[0]),sy(p[1]));ctx.closePath();
  ctx.fillStyle="rgba(8,10,12,.38)";ctx.fill("evenodd");
  ctx.beginPath();ctx.rect(0,0,cssW,cssH);ctx.rect(x0,y0,x1-x0,y1-y0);ctx.clip("evenodd");
  ctx.strokeStyle="rgba(233,227,211,.05)";ctx.lineWidth=5;ctx.beginPath();
  for(let k=-cssH;k<cssW;k+=14){ctx.moveTo(k,0);ctx.lineTo(k+cssH,cssH);}ctx.stroke();
  ctx.restore();
  ctx.beginPath();ctx.moveTo(sx(pts[0][0]),sy(pts[0][1]));for(const p of pts)ctx.lineTo(sx(p[0]),sy(p[1]));ctx.closePath();
  ctx.strokeStyle="rgba(10,12,14,.5)";ctx.lineWidth=4.5;ctx.stroke();ctx.strokeStyle="rgba(168,104,92,.95)";ctx.lineWidth=2.4;ctx.stroke();
}
