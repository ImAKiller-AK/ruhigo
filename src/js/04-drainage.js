/* ---------------- Drainage, rivers, settlements ---------------- */
let GW=560,GH=280,GN=GW*GH,CELL_M=WX*MPU/GW; // analysis grid; CELL_M: metres across one cell
// switch between a planet and a battle map: world extent, metres per unit and the analysis grid all follow P.kind
function setKind(){
  if(isArena()){WX=1;MPU=P.km*1000;GW=GH=400;}else{WX=2;MPU=2e7;GW=560;GH=280;}
  GN=GW*GH;CELL_M=WX*MPU/GW;worldRev++;
}
let W0=null; // world-scale analysis
let names=[],worldName="",peakName="";
function setSeed(seed){
  P.seed=seed;worldRev++;const base=seedHash(seed),r=mulberry32(base);
  N={e:makeNoise(r),w1:makeNoise(r),w2:makeNoise(r),c:makeNoise(r),k:makeNoise(r),r:makeNoise(r),m:makeNoise(r),t:makeNoise(r)};
  const word=makeLanguage(mulberry32(base^0x9e3779b9));
  worldName=word(2);peakName="Mount "+word(1);names=[];for(let i=0;i<40;i++)names.push(word(2));
  const a=mulberry32(base^0x7f4a7c15);N.side=a()*Math.PI*2;N.chan=a()<0.72?1+Math.floor(a()*2):0; // battle maps: where the sea comes in, and whether a river channel crosses
}
function analyseWorld(){
  const e=new Float32Array(GN),hm=new Float32Array(GN),T=new Float32Array(GN),R=new Float32Array(GN);
  for(let j=0;j<GH;j++)for(let i=0;i<GW;i++){
    const k=j*GW+i,x=(i+0.5)/GW*WX,y=(j+0.5)/GH,v=elev(x,y,8);
    e[k]=v;const h=meters(v);hm[k]=h;climate(x,y,h);T[k]=cT;R[k]=cR;
  }
  // priority flood: every land cell drains toward the sea along the lowest spill path
  const recv=new Int32Array(GN).fill(-1),order=new Int32Array(GN),vis=new Uint8Array(GN);
  const hk=new Float32Array(GN),hi=new Int32Array(GN);let hn=0,oc=0;
  const push=(i,key)=>{let c=hn++;while(c>0){const p=(c-1)>>1;if(hk[p]<=key)break;hk[c]=hk[p];hi[c]=hi[p];c=p;}hk[c]=key;hi[c]=i;};
  const pop=()=>{const top=hi[0],lk=hk[--hn],li=hi[hn];let c=0;for(;;){let l=2*c+1;if(l>=hn)break;const r=l+1;if(r<hn&&hk[r]<hk[l])l=r;if(hk[l]>=lk)break;hk[c]=hk[l];hi[c]=hi[l];c=l;}hk[c]=lk;hi[c]=li;return top;};
  const fill=new Float32Array(GN);
  for(let k=0;k<GN;k++){const i=k%GW,j=(k/GW)|0;if(hm[k]<0||i===0||j===0||i===GW-1||j===GH-1){vis[k]=1;fill[k]=e[k];push(k,e[k]);}}
  const DX=[-1,0,1,-1,1,-1,0,1],DY=[-1,-1,-1,0,0,1,1,1];
  while(hn>0){
    const c=pop();order[oc++]=c;const ci=c%GW,cj=(c/GW)|0;
    for(let d=0;d<8;d++){const ni=ci+DX[d],nj=cj+DY[d];if(ni<0||nj<0||ni>=GW||nj>=GH)continue;const n=nj*GW+ni;if(vis[n])continue;vis[n]=1;fill[n]=Math.max(e[n],fill[c]+1e-6);recv[n]=c;push(n,fill[n]);}
  }
  const acc=new Float32Array(GN);
  for(let k=0;k<GN;k++)if(hm[k]>=0)acc[k]=R[k]/1000;
  for(let q=oc-1;q>=0;q--){const c=order[q],r=recv[c];if(r>=0&&hm[c]>=0)acc[r]+=acc[c];}
  // threshold: the wettest ~3.5% of land cells become rivers
  const landAcc=[];let land=0,peak=-1,peakH=-1;
  for(let k=0;k<GN;k++)if(hm[k]>=0){land++;landAcc.push(acc[k]);if(hm[k]>peakH){peakH=hm[k];peak=k;}}
  landAcc.sort((a,b)=>a-b);
  const thr=Math.max(6,landAcc[Math.floor(landAcc.length*(isArena()?0.988:0.965))]||6);
  const isR=new Uint8Array(GN);for(let k=0;k<GN;k++)if(hm[k]>=0&&acc[k]>=thr&&T[k]>-14)isR[k]=1;
  const inflow=new Uint8Array(GN);let mouths=0;
  for(let k=0;k<GN;k++)if(isR[k]){const r=recv[k];if(r>=0){if(isR[r])inflow[r]=1;else if(hm[r]<0)mouths++;}}
  const jr=mulberry32(seedHash(P.seed)^0x51ed27),cw=WX/GW,ch=1/GH;
  const buckets=[[],[],[],[],[],[]],seen=new Uint8Array(GN);
  for(let k=0;k<GN;k++){
    if(!isR[k]||inflow[k])continue;
    const pts=[];let c=k;
    for(;;){
      const i=c%GW,j=(c/GW)|0,end=!isR[c]||seen[c];
      const jit=end?0:0.55;
      pts.push((i+0.5+(jr()-0.5)*jit)*cw,(j+0.5+(jr()-0.5)*jit)*ch,acc[c]);
      if(end)break;seen[c]=1;const r=recv[c];if(r<0)break;c=r;
    }
    if(pts.length<6)continue;
    let s=pts;
    for(let it=0;it<2;it++){ // Chaikin smoothing
      const o=[s[0],s[1],s[2]];
      for(let q=0;q<s.length-3;q+=3){
        o.push(.75*s[q]+.25*s[q+3],.75*s[q+1]+.25*s[q+4],s[q+2],.25*s[q]+.75*s[q+3],.25*s[q+1]+.75*s[q+4],s[q+5]);
      }
      o.push(s[s.length-3],s[s.length-2],s[s.length-1]);s=o;
    }
    for(let q=0;q<s.length-3;q+=3){
      const a=Math.min(s[q+2],s[q+5]);
      const b=Math.min(5,Math.floor(Math.log2(Math.max(1,a/thr))/1.3));
      buckets[b].push(s[q],s[q+1],s[q+3],s[q+4]);
    }
  }
  // landmasses
  const lab=new Int32Array(GN);let masses=0;const stack=[];
  for(let k=0;k<GN;k++){
    if(hm[k]<0||lab[k])continue;let size=0;stack.push(k);lab[k]=1;
    while(stack.length){const c=stack.pop();size++;const ci=c%GW,cj=(c/GW)|0;
      for(let d=1;d<8;d+=2){const ni=ci+DX[d],nj=cj+DY[d];if(ni<0||nj<0||ni>=GW||nj>=GH)continue;const n=nj*GW+ni;if(hm[n]>=0&&!lab[n]){lab[n]=1;stack.push(n);}}
    }
    if(size>land*0.03)masses++;
  }
  const bio=new Uint8Array(GN);for(let k=0;k<GN;k++)bio[k]=biome(hm[k],T[k],R[k]);
  const f={hm,T,R,isR,acc,recv,thr,bio};
  if(isArena()){
    const {cities,bld,streets,deco,farms}=arenaPlaces(f);
    W0={kind:"arena",buckets,cities,bld,streets,deco,farms,tracks:[],land:land/GN,masses,mouths,peak:{x:(peak%GW+0.5)*cw,y:(((peak/GW)|0)+0.5)*ch,h:peakH},f,cost:null,costField:null,net:null,routes:[]};
    return;
  }
  // settlements: rivers, coasts, mild climate, low ground
  const cand=[],sr=mulberry32(seedHash(P.seed)^0x2545f491);
  for(let k=0;k<GN;k++){
    const h=hm[k];if(h<0||h>1800)continue;const t=T[k],r=R[k];if(t<-1||t>29||r<220)continue;
    const i=k%GW,j=(k/GW)|0;if(i<2||j<2||i>GW-3||j>GH-3)continue;
    const coast=hm[k-1]<0||hm[k+1]<0||hm[k-GW]<0||hm[k+GW]<0;
    let s=(1-Math.abs(t-15)/20)*1.6+Math.min(r,2400)/2400-h/1400+(coast?1.6:0)+sr()*0.9;
    if(isR[k]){s+=1.8+Math.log(acc[k]/thr)*0.5;const rv=recv[k];if(rv>=0&&hm[rv]<0)s+=1.4;}
    cand.push([s,k]);
  }
  cand.sort((a,b)=>b[0]-a[0]);
  const cities=[],minD=0.12;
  for(const [s,k] of cand){
    if(cities.length>=16)break;
    const x=(k%GW+0.5)*cw,y=(((k/GW)|0)+0.5)*ch;
    if(cities.some(c=>(c.x-x)**2+(c.y-y)**2<minD*minD))continue;
    cities.push({x,y,k,s});
  }
  const capPop=0.6e6+sr()*2.2e6;
  cities.forEach((c,i)=>{c.name=names[i]||("Town "+i);c.cap=i===0;c.pop=i===0?capPop:capPop*(0.05+0.55*sr())/Math.pow(i+1,0.55);c.biome=biome(hm[c.k],T[c.k],R[c.k]);c.h=hm[c.k];});
  cities.sort((a,b)=>b.pop-a.pop);
  // keep the analysis fields: the cost map, the pathfinder and the simulation all read them
  W0={kind:"world",buckets,cities,land:land/GN,masses,mouths,peak:{x:(peak%GW+0.5)*cw,y:(((peak/GW)|0)+0.5)*ch,h:peakH},f,cost:null,costField:null,net:null,routes:[]};
}


/* ---------------- Arena: named places and their buildings ---------------- */
// Compounds a battle map can hold: name, radius (m), building size range (m), number of buildings, preferred ground
const COMPOUNDS=[
  ["Military Base",300,[26,64],16,"any"],["Power Plant",210,[24,58],7,"any"],["Quarry",170,[12,30],5,"any"],
  ["Factory",190,[30,62],8,"any"],["School",110,[22,42],4,"any"],["Hospital",120,[22,46],4,"any"],
  ["Prison",150,[20,50],6,"any"],["Farm",170,[10,26],7,"flat"],["Ruins",150,[8,22],11,"any"],
  ["Stadium",170,[24,40],4,"flat"],["Lumber Mill",150,[14,34],6,"forest"],["Radio Station",90,[10,22],3,"hill"],
  ["Mansion",110,[22,42],4,"any"],["Harbor",210,[18,44],10,"coast"],["Lighthouse",70,[8,14],2,"coast"],
  ["Shipyard",190,[30,60],7,"coast"],["Observatory",90,[14,28],3,"hill"],["Train Yard",220,[14,60],9,"flat"],
  ["Fuel Depot",130,[14,30],6,"any"],["Monastery",110,[16,36],5,"hill"]
];
const PLACE_CLS={city:"City",town:"Town",village:"Village",site:"Compound"};
function arenaPlaces(f){
  const {hm,isR,bio}=f,hs=seedHash(P.seed),rr=mulberry32(hs^0x1b873593),M=1/MPU,cw=WX/GW,ch=1/GH;
  const slope=k=>(Math.abs(hm[k+1]-hm[k-1])+Math.abs(hm[k+GW]-hm[k-GW]))/(2*CELL_M);
  const waterWithin=(k,r,step)=>{const i=k%GW,j=(k/GW)|0;for(let dj=-r;dj<=r;dj+=step)for(let di=-r;di<=r;di+=step){const i2=i+di,j2=j+dj;if(i2>=0&&j2>=0&&i2<GW&&j2<GH&&hm[j2*GW+i2]<0)return true;}return false;};
  const coastAt=k=>waterWithin(k,8,4);
  const seaAt=k=>{ // the sea or a big lake nearby, not a pond: a third of the ground within ~500 m is water
    if(!waterWithin(k,10,2))return false;const i=k%GW,j=(k/GW)|0,R=25;let w=0,n=0;
    for(let dj=-R;dj<=R;dj+=5)for(let di=-R;di<=R;di+=5){const i2=i+di,j2=j+dj;if(i2<0||j2<0||i2>=GW||j2>=GH)continue;n++;if(hm[j2*GW+i2]<0)w++;}
    return w/n>0.3;
  };
  let top=1;for(let k=0;k<GN;k++)if(hm[k]>top)top=hm[k];
  // candidate sites: dry, gentle ground away from the map edge; water nearby is a bonus, as it is for real towns
  const cand=[],m=8;
  for(let j=m;j<GH-m;j++)for(let i=m;i<GW-m;i++){
    const k=j*GW+i;if(hm[k]<4||isR[k])continue;const sl=slope(k);if(sl>0.14||waterWithin(k,3,1))continue; // the centre stands back from the shore
    cand.push([(0.14-sl)*9+rr()*1.4+(coastAt(k)?0.5:0)+(isR[k-3]||isR[k+3]||isR[k-3*GW]||isR[k+3*GW]?0.5:0),k]);
  }
  cand.sort((a,b)=>b[0]-a[0]);
  const want=Math.round(P.km*2.6),minD=0.78/P.km*WX,picks=[];
  for(const [sc,k] of cand){
    if(picks.length>=want)break;
    const x=(k%GW+0.5)*cw,y=(((k/GW)|0)+0.5)*ch;
    if(picks.some(c=>(c.x-x)**2+(c.y-y)**2<minD*minD))continue;
    picks.push({x,y,k,s:sc});
  }
  // what each place is: one or two cities, a ring of towns, then villages and compounds suited to their ground
  const nCity=P.km>=6?2:1,nTown=Math.round(picks.length*0.28),used=new Set();let ni=0;
  const word=()=>names[ni++]||("Site "+ni);
  picks.forEach((c,i)=>{
    c.cap=i===0;c.h=hm[c.k];c.biome=bio[c.k];
    if(i<nCity){c.cls="city";c.r=380;}
    else if(i<nCity+nTown){c.cls="town";c.r=240;}
    else if(rr()<0.42){c.cls="village";c.r=140;}
    else{
      const site=seaAt(c.k)?"coast":c.h>top*0.3?"hill":[6,9,10,13,14].includes(c.biome)?"forest":slope(c.k)<0.03?"flat":"any";
      const fits=COMPOUNDS.filter(t=>!used.has(t[0])&&(t[4]===site||t[4]==="any"));
      const t=fits.find(t=>t[4]===site&&rr()<0.5)||fits[Math.floor(rr()*fits.length)];
      if(!t){c.cls="village";c.r=140;}
      else{used.add(t[0]);c.cls="site";c.kind=t[0];c.r=t[1];c.spec=t;}
    }
  });
  // every map of 6 km or more has a military base, out in the most remote compound (as on real battle maps)
  const MB=COMPOUNDS[0],sites=picks.filter(c=>c.cls==="site");
  if(P.km>=6&&!used.has(MB[0])&&sites.length){
    const far=sites.reduce((a,c)=>Math.hypot(c.x-WX/2,c.y-0.5)>Math.hypot(a.x-WX/2,a.y-0.5)?c:a);
    used.delete(far.kind);used.add(MB[0]);far.kind=MB[0];far.r=MB[1];far.spec=MB;
  }
  picks.forEach(c=>{
    c.name=c.cls==="site"?(rr()<0.45?word()+" ":"")+c.kind:word();
    if(!c.kind)c.kind=PLACE_CLS[c.cls];
  });
  // buildings: towns are blocks of houses between streets laid out at a local angle; compounds are a few large sheds
  const out=[],streets=[],deco=[],farms=[];
  const street=(x1,y1,x2,y2)=>{ // keep only the stretches over dry land
    const n=Math.max(2,Math.ceil(Math.hypot(x2-x1,y2-y1)*MPU/10));let a=-1;
    for(let q=0;q<=n;q++){const t=q/n,x=x1+(x2-x1)*t,y=y1+(y2-y1)*t,dry=x>=0&&y>=0&&x<WX&&y<1&&hm[Math.floor(y*GH)*GW+Math.floor(x/cw)]>=2;
      if(dry&&a<0)a=t;
      if((!dry||q===n)&&a>=0){const b=dry?t:(q-1)/n;if(b>a)streets.push(x1+(x2-x1)*a,y1+(y2-y1)*a,x1+(x2-x1)*b,y1+(y2-y1)*b);a=-1;}
    }
  };
  const ok=(x,y)=>{if(x<0||y<0||x>=WX||y>=1)return false;const k=Math.floor(y*GH)*GW+Math.floor(x/cw);return hm[k]>=2&&!isR[k]&&slope(k)<0.2;};
  for(const c of picks){
    const r=mulberry32(hs^Math.imul(c.k+1,0x9E3779B1)),ang=r()*Math.PI/2,ca=Math.cos(ang),sa=Math.sin(ang),b0=out.length;
    const add=(u,v,w,h)=>{const x=c.x+(u*ca-v*sa)*M,y=c.y+(u*sa+v*ca)*M;if(ok(x,y))out.push(x,y,w*M,h*M,ang);};
    if(c.cls==="site"){
      const d0=deco.length;
      siteLayout(c,{add,r,ang,M,ok,deco,hm,cw,waterDir:()=>waterDir(c,hm,cw)});
      const [,R,[lo,hi],n]=c.spec,L=hi*1.25;let made=(out.length-b0)/5;
      if(deco.length===d0)for(let ring=0;ring<6&&made<n;ring++)for(let gx=-ring;gx<=ring&&made<n;gx++)for(let gy=-ring;gy<=ring&&made<n;gy++){
        if(Math.max(Math.abs(gx),Math.abs(gy))!==ring||gx*L>R||gy*L>R)continue; // fallback: a plain cluster of sheds
        const n0=out.length;add(gx*L+(r()-0.5)*8,gy*L+(r()-0.5)*8,lo+(hi-lo)*r(),lo+(hi-lo)*r()*0.8);if(out.length>n0)made++;
      }
      c.deco=[d0,deco.length];
    }else{
      const L=c.cls==="city"?30:c.cls==="town"?33:42,dens=c.cls==="village"?0.5:0.86,big=c.cls==="city"?1.35:1;
      const offs=c.cls==="city"?[0,-3.5*L,3.5*L]:c.cls==="town"?[0,2.5*L]:[0]; // street lines, the same both ways
      for(const o of offs){
        const ext=Math.sqrt(Math.max(0,c.r*c.r-o*o))*(c.cls==="village"?0.7:0.9);
        street(c.x+(o*-sa-ext*ca)*M,c.y+(o*ca-ext*sa)*M,c.x+(o*-sa+ext*ca)*M,c.y+(o*ca+ext*sa)*M);
        street(c.x+(o*ca+ext*sa)*M,c.y+(o*sa-ext*ca)*M,c.x+(o*ca-ext*sa)*M,c.y+(o*sa+ext*ca)*M);
      }
      for(let gu=-c.r;gu<=c.r;gu+=L)for(let gv=-c.r;gv<=c.r;gv+=L){
        if(offs.some(o=>Math.abs(gu-o)<L*0.6||Math.abs(gv-o)<L*0.6))continue; // keep the streets clear
        const d=Math.hypot(gu,gv)/c.r;if(d>1||r()>dens*(1-d*d*0.85))continue;
        add(gu+(r()-0.5)*6,gv+(r()-0.5)*6,(10+r()*12)*big,(8+r()*9)*big);
      }
    }
    c.bld=[b0/5,out.length/5];c.pop=(out.length-b0)/5;
  }
  // farmsteads: one to four buildings scattered over gentle open country, the way such maps are dotted with houses
  const fr=mulberry32(hs^0x2f6b1d3c),nFarm=Math.round(P.km*P.km*2),clear=0.16/P.km*WX;
  for(let t=0,made=0;t<nFarm*25&&made<nFarm;t++){
    const x=0.03+fr()*0.94*WX,y=0.03+fr()*0.94,k=Math.floor(y*GH)*GW+Math.floor(x/cw);
    if(hm[k]<5||isR[k]||slope(k)>0.16||waterWithin(k,2,1))continue;
    if(picks.some(c=>Math.hypot(c.x-x,c.y-y)<c.r*M+clear))continue;
    farms.push(k);
    const ang=fr()*Math.PI/2,ca=Math.cos(ang),sa=Math.sin(ang),n=1+Math.floor(fr()*fr()*4);
    for(let q=0;q<n;q++){
      const u=q?(fr()-0.5)*40:0,v=q?(fr()-0.5)*40:0,px=x+(u*ca-v*sa)*M,py=y+(u*sa+v*ca)*M;
      if(ok(px,py))out.push(px,py,(8+fr()*9)*M,(7+fr()*6)*M,ang);
    }
    made++;
  }
  return {cities:picks,bld:Float32Array.from(out),streets:Float32Array.from(streets),deco,farms};
}

/* ---- landmark layouts: each kind of compound gets the silhouette that makes it readable from the air ---- */
// Ground marks (deco) are shapes in world units: rect {t,x,y,w,h,a} for paving, fields, runways, piers and pools;
// circ {t,x,y,r} for tanks, towers and pads; oval {t,x,y,rx,ry,a} for a stadium bowl; line {t,p,closed} for walls,
// fences and rails; pit {t,x,y,r} for a quarry's terraces. Buildings go through add() like any other.
function waterDir(c,hm,cw){ // direction (radians) and distance (m) to the nearest water within reach, or null
  let best=null;
  for(let a=0;a<16;a++){
    const th=a*Math.PI/8,dx=Math.cos(th),dy=Math.sin(th);
    for(let d=20;d<=c.r+260;d+=10){
      const x=c.x+dx*d/MPU,y=c.y+dy*d/MPU;if(x<0||y<0||x>=WX||y>=1)break;
      if(hm[Math.floor(y*GH)*GW+Math.floor(x/cw)]<0){if(!best||d<best.d)best={th,d};break;}
    }
  }
  return best;
}
function siteLayout(c,o){
  const {add,r,ang,M,ok,deco}=o,ca=Math.cos(ang),sa=Math.sin(ang);
  const W=(u,v)=>[c.x+(u*ca-v*sa)*M,c.y+(u*sa+v*ca)*M];
  const rect=(t,u,v,w,h,force)=>{const [x,y]=W(u,v);if(force||ok(x,y))deco.push({t,x,y,w:w*M,h:h*M,a:ang});};
  const circ=(t,u,v,rad)=>{const [x,y]=W(u,v);if(ok(x,y))deco.push({t,x,y,r:rad*M});};
  const line=(t,pts,closed)=>{const p=[];for(const [u,v] of pts)p.push(...W(u,v));deco.push({t,p,closed:!!closed});};
  const box=(t,hw,hh)=>line(t,[[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]],true);
  const dry=(u,v)=>{const [x,y]=W(u,v);return ok(x,y);};
  const alongDry=(u0,v0,u1,v1)=>{for(let s=0;s<=1;s+=0.1)if(!dry(u0+(u1-u0)*s,v0+(v1-v0)*s))return false;return true;};
  switch(c.kind){
    case "Military Base":{
      let L=560;while(L>240&&!alongDry(-L/2,-70,L/2,-70))L-=80;
      if(L>240){rect("runway",0,-70,L,34,true);}
      rect("pave",0,10,240,70);
      for(const u of [-80,0,80])add(u,10,44,32); // hangars
      for(let i=0;i<8;i++)add(-120+(i%4)*80,70+Math.floor(i/4)*34,34,13); // barracks
      add(150,40,14,14);circ("pad",150,-10,12);
      box("fence",Math.max(L/2,170)+20,140);break;
    }
    case "Power Plant":{
      rect("pave",0,0,240,160);
      for(const u of [-70,-15,40])circ("tower",u,-45,23);
      add(-20,30,80,30);add(70,35,30,20);circ("tank",95,-30,10);circ("tank",95,-5,10);
      box("fence",130,90);break;
    }
    case "Stadium":{
      const [x,y]=W(0,0);deco.push({t:"oval",x,y,rx:95*M,ry:72*M,a:ang});
      rect("pitch",0,0,92,58,true);rect("pave",0,120,150,50);add(-60,120,24,14);add(60,120,24,14);break;
    }
    case "Quarry":{
      const [x,y]=W(0,0);deco.push({t:"pit",x,y,r:115*M});
      add(150,-40,26,14);add(150,-10,18,12);add(140,40,30,16);rect("pave",150,0,70,120);break;
    }
    case "Factory":{
      rect("pave",0,0,220,150);add(-40,-20,90,54);add(60,30,62,40);add(-70,50,30,18);
      circ("tank",80,-45,11);circ("tank",56,-45,11);box("fence",125,90);break;
    }
    case "Prison":{
      rect("yard",0,0,180,180);box("wall",95,95);
      add(0,0,70,16);add(0,-45,70,16);add(0,45,70,16);add(-60,0,16,60);
      for(const [u,v] of [[-95,-95],[95,-95],[95,95],[-95,95]])add(u,v,8,8);break;
    }
    case "Fuel Depot":{
      rect("pave",0,0,150,110);for(let i=0;i<6;i++)circ("tank",-45+(i%3)*45,-22+Math.floor(i/3)*44,15);
      add(0,62,30,14);box("fence",85,70);break;
    }
    case "Train Yard":{
      let L=520;while(L>200&&!alongDry(-L/2,0,L/2,0))L-=80;
      for(let i=0;i<6;i++){const v=-20+i*8;line("rail",[[-L/2,v],[L/2,v]]);}
      add(0,-45,110,22);add(-150,30,40,18);add(140,30,26,16);rect("pave",0,-45,150,40);break;
    }
    case "Harbor":case "Shipyard":case "Lighthouse":{
      const wd=o.waterDir();
      if(c.kind==="Lighthouse"){circ("lighthouse",0,0,7);add(18,0,14,10);}
      else{for(let i=0;i<5;i++)add(-80+i*40,-10+(i%2)*28,c.kind==="Shipyard"?46:32,18);rect("pave",0,0,220,70);}
      if(wd&&c.kind!=="Lighthouse"){ // piers or a slipway reaching out from the shore
        const dx=Math.cos(wd.th),dy=Math.sin(wd.th),px=-dy,py=dx,n=c.kind==="Shipyard"?2:4;
        for(let i=0;i<n;i++){
          const off=(i-(n-1)/2)*45,len=c.kind==="Shipyard"?130:90,d=wd.d-15+len/2;
          deco.push({t:"pier",x:c.x+(dx*d+px*off)*M,y:c.y+(dy*d+py*off)*M,w:len*M,h:(c.kind==="Shipyard"?30:10)*M,a:wd.th});
        }
      }
      break;
    }
    case "School":{
      add(-40,-20,70,16);add(-75,10,16,50);const [x,y]=W(60,10);deco.push({t:"oval",x,y,rx:55*M,ry:36*M,a:ang,track:true});
      rect("pitch",60,10,70,40,true);break;
    }
    case "Hospital":{
      add(-30,0,14,64);add(30,0,14,64);add(0,0,46,14);circ("pad",80,-30,11);rect("pave",80,30,60,40);break;
    }
    case "Mansion":{
      rect("lawn",0,0,130,100);box("wall",68,54);add(0,-10,44,30);rect("pool",0,30,22,10,true);add(45,30,14,12);break;
    }
    case "Monastery":{
      rect("yard",0,0,90,90);box("wall",48,48);add(0,-40,80,12);add(-40,0,12,70);add(40,0,12,70);add(0,10,22,40);break;
    }
    case "Ruins":{
      for(let i=0;i<14;i++){const u=(r()-0.5)*220,v=(r()-0.5)*160;add(u,v,6+r()*14,5+r()*10);}
      line("wall",[[-90,-60],[-20,-70],[30,-55]]);line("wall",[[60,20],[80,70]]);break;
    }
    case "Lumber Mill":{
      add(-20,0,60,24);add(50,-30,30,16);rect("pave",0,0,170,110);
      for(let i=0;i<6;i++)rect("logs",-60+(i%3)*30,35+Math.floor(i/3)*16,22,8);break;
    }
    case "Radio Station":case "Observatory":{
      if(c.kind==="Observatory"){circ("dome",0,0,13);add(30,10,24,14);}
      else{circ("mast",0,0,5);add(25,10,18,10);add(-20,18,12,8);}
      box("fence",45,35);break;
    }
    case "Farm":{add(0,0,34,18);add(30,22,14,10);circ("silo",-28,-14,5);circ("silo",-28,0,5);break;}
  }
}
