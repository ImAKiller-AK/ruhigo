/* ---------------- Rendering ---------------- */
const canvas=$("map"),ctx=canvas.getContext("2d"),mapEl=$("mapWrap");
const BG=[12,20,28],BGCSS="rgb(12,20,28)";
let cssW=800,cssH=500,dpr=1;
const view={cx:1,cy:0.5,zoom:1};
let mode="biome";
const opt={rivers:true,cities:true,grid:true,borders:true,routes:true,res:false};
const unit=()=>Math.max(2/cssW,1/cssH)/view.zoom; // world units per CSS px

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
  const oct=Math.max(3,Math.min(18,Math.round(Math.log2(1/(U*P.scale)))+1));
  const cv=document.createElement("canvas");cv.width=W;cv.height=H;
  return {W,H,U,oct,cx:view.cx,cy:view.cy,E:9/Math.pow(view.zoom,0.08),
    hs:new Float32Array(W*H),ts:new Float32Array(W*H),rs:new Float32Array(W*H),img:new ImageData(W,H),cv,cx2:cv.getContext("2d"),row:0,shaded:0,put:0};
}
function computeRow(j,py){
  const {W,H,U,hs,ts,rs,oct}=j,wy=j.cy+(py+0.5-H/2)*U;
  for(let px=0;px<W;px++){
    const k=py*W+px,wx=j.cx+(px+0.5-W/2)*U;
    if(wx<0||wx>2||wy<0||wy>1){hs[k]=NaN;continue;}
    const h=meters(elev(wx,wy,oct));hs[k]=h;climate(wx,wy,h,oct);ts[k]=cT;rs[k]=cR;
  }
}
function shadeRow(j,py){
  const {W,H,hs,ts,rs,E}=j,d=j.img.data,mpp=j.U*2e7;
  const Lx=-0.58,Ly=-0.58,Lz=0.57;
  for(let px=0;px<W;px++){
    const k=py*W+px,o=k*4,h=hs[k];d[o+3]=255;
    if(h!==h){d[o]=BG[0];d[o+1]=BG[1];d[o+2]=BG[2];continue;}
    let hL=px>0?hs[k-1]:h,hR=px<W-1?hs[k+1]:h,hU=py>0?hs[k-W]:h,hD=py<H-1?hs[k+W]:h;
    if(hL!==hL)hL=h;if(hR!==hR)hR=h;if(hU!==hU)hU=h;if(hD!==hD)hD=h;
    const sea=h<0,coast=!sea&&(hL<0||hR<0||hU<0||hD<0);
    const g=v=>v<0?v*0.1:v;
    const dzx=(g(hR)-g(hL))/(2*mpp)*E,dzy=(g(hD)-g(hU))/(2*mpp)*E;
    const len=Math.sqrt(dzx*dzx+dzy*dzy+1);
    let f=1+((-dzx*Lx-dzy*Ly+Lz)/len-Lz)*1.7;
    if(sea)f=1+(f-1)*0.5;
    f=f<0.35?0.35:f>1.55?1.55:f;
    const T=ts[k],R=rs[k];
    if(mode==="biome"){
      if(sea){if(T<-9){col[0]=212;col[1]=224;col[2]=232;}else ramp(RAMPS.oceanB,h);}
      else{const c=B[biome(h,T,R)][1];const lift=1+Math.min(h,3500)/3500*0.1;col[0]=c[0]*lift;col[1]=c[1]*lift;col[2]=c[2]*lift;}
    }else if(mode==="relief"){ramp(sea?RAMPS.reliefO:RAMPS.reliefL,h);}
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
  ctx.strokeStyle="rgba(233,227,211,.25)";ctx.lineWidth=1;ctx.strokeRect(sx(0),sy(0),2/u,1/u);
  if(opt.grid){
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
  if(opt.rivers&&W0){
    const zf=Math.pow(view.zoom,0.42),widths=[0.8,1.1,1.5,2,2.6,3.3];
    ctx.strokeStyle=mode==="biome"||mode==="relief"?"rgba(58,118,166,.95)":"rgba(16,32,56,.75)";
    for(let b=0;b<6;b++){
      const a=W0.buckets[b];if(!a.length)continue;ctx.lineWidth=Math.min(14,widths[b]*zf);ctx.beginPath();
      for(let q=0;q<a.length;q+=4){
        const x1=sx(a[q]),y1=sy(a[q+1]),x2=sx(a[q+2]),y2=sy(a[q+3]);
        if((x1<-20&&x2<-20)||(x1>cssW+20&&x2>cssW+20)||(y1<-20&&y2<-20)||(y1>cssH+20&&y2>cssH+20))continue;
        ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);
      }
      ctx.stroke();
    }
  }
  drawSimRoutes(sx,sy);
  if(opt.cities&&W0){
    const boxes=[];
    const label=(text,x,y,font,color)=>{
      ctx.font=font;const w=ctx.measureText(text).width,bx=x+8,by=y-7;
      if(boxes.some(b=>bx<b[0]+b[2]&&bx+w>b[0]&&by<b[1]+15&&by+15>b[1]))return false;
      boxes.push([bx,by,w,15]);
      ctx.lineWidth=3.5;ctx.strokeStyle="rgba(10,16,22,.82)";ctx.strokeText(text,bx,y+4);ctx.fillStyle=color;ctx.fillText(text,bx,y+4);return true;
    };
    const pk=W0.peak,px=sx(pk.x),py=sy(pk.y);
    if(px>-20&&px<cssW+20&&py>-20&&py<cssH+20){
      ctx.fillStyle="#e9e3d3";ctx.strokeStyle="rgba(10,16,22,.85)";ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(px,py-6);ctx.lineTo(px+5,py+3);ctx.lineTo(px-5,py+3);ctx.closePath();ctx.stroke();ctx.fill();
      label(peakName+" "+fmtInt(pk.h)+" m",px,py,"italic 500 11px Inter, sans-serif","#e9e3d3");
    }
    W0.cities.forEach((c,i)=>{
      const x=sx(c.x),y=sy(c.y);if(x<-40||x>cssW+40||y<-20||y>cssH+20)return;
      if(!c.cap&&view.zoom<1.6&&i>9)return;
      ctx.lineWidth=2;ctx.strokeStyle="rgba(10,16,22,.9)";
      if(c.cap){ctx.fillStyle="#d9a548";ctx.strokeRect(x-4.5,y-4.5,9,9);ctx.fillRect(x-4.5,y-4.5,9,9);}
      else{ctx.fillStyle="#e9e3d3";ctx.beginPath();ctx.arc(x,y,3.4,0,Math.PI*2);ctx.stroke();ctx.fill();}
      label(c.name,x,y,(c.cap?"700 13px":"600 12px")+" Inter, sans-serif",c.cap?"#f1c877":"#e9e3d3");
    });
  }
  drawSimOver(sx,sy);
  if(mc.area==="view"){ // the square a Minecraft export will cover
    const s=mcFramePx(),x=(cssW-s)/2,y=(cssH-s)/2;
    ctx.setLineDash([7,5]);ctx.lineWidth=3.5;ctx.strokeStyle="rgba(10,16,22,.75)";ctx.strokeRect(x,y,s,s);
    ctx.lineWidth=1.5;ctx.strokeStyle="#d9a548";ctx.strokeRect(x,y,s,s);ctx.setLineDash([]);
    ctx.font="500 10px 'JetBrains Mono', monospace";ctx.lineWidth=3;ctx.strokeStyle="rgba(10,16,22,.82)";
    ctx.strokeText("MINECRAFT EXPORT AREA",x+6,y+s-7);ctx.fillStyle="#f1c877";ctx.fillText("MINECRAFT EXPORT AREA",x+6,y+s-7);
  }
}
function updateChrome(){
  const z=view.zoom;$("zoomTxt").textContent="×"+(z<10?z.toFixed(1):Math.round(z));
  const km=unit()*20000,raw=km*110,p=Math.pow(10,Math.floor(Math.log10(raw)));
  const nice=raw/p>=5?5*p:raw/p>=2?2*p:p;
  $("scaleBar").style.width=(nice/km).toFixed(1)+"px";
  $("scaleTxt").textContent=nice>=1?fmtInt(nice)+" km":fmtInt(nice*1000)+" m";
  mcInfo();
}

