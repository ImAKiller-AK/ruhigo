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
    const {cities,bld,streets}=arenaPlaces(f);
    W0={kind:"arena",buckets,cities,bld,streets,land:land/GN,masses,mouths,peak:{x:(peak%GW+0.5)*cw,y:(((peak/GW)|0)+0.5)*ch,h:peakH},f,cost:null,costField:null,net:null,routes:[]};
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
  ["Military Base",300,[26,64],16,"any"],["Power Plant",210,[24,58],7,"any"],["Quarry",170,[12,30],5,"hill"],
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
      const site=coastAt(c.k)?"coast":c.h>top*0.55?"hill":[6,9,10,13,14].includes(c.biome)?"forest":slope(c.k)<0.03?"flat":"any";
      const fits=COMPOUNDS.filter(t=>!used.has(t[0])&&(t[4]===site||t[4]==="any"));
      const t=fits.find(t=>t[4]===site&&rr()<0.7)||fits[Math.floor(rr()*fits.length)];
      if(!t){c.cls="village";c.r=140;}
      else{used.add(t[0]);c.cls="site";c.kind=t[0];c.r=t[1];c.spec=t;}
    }
    c.name=c.cls==="site"?(rr()<0.45?word()+" ":"")+c.kind:word();
    if(!c.kind)c.kind=PLACE_CLS[c.cls];
  });
  // buildings: towns are blocks of houses between streets laid out at a local angle; compounds are a few large sheds
  const out=[],streets=[];
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
      const [,R,[lo,hi],n]=c.spec,L=hi*1.25;let made=0;
      for(let ring=0;ring<6&&made<n;ring++)for(let gx=-ring;gx<=ring&&made<n;gx++)for(let gy=-ring;gy<=ring&&made<n;gy++){
        if(Math.max(Math.abs(gx),Math.abs(gy))!==ring||gx*L>R||gy*L>R)continue;
        const n0=out.length;add(gx*L+(r()-0.5)*8,gy*L+(r()-0.5)*8,lo+(hi-lo)*r(),lo+(hi-lo)*r()*0.8);if(out.length>n0)made++;
      }
    }else{
      const L=c.cls==="city"?30:c.cls==="town"?33:42,dens=c.cls==="village"?0.5:0.86,big=c.cls==="city"?1.35:1;
      const offs=c.cls==="city"?[0,-3.5*L,3.5*L]:c.cls==="town"?[0,2.5*L]:[0]; // street lines, the same both ways
      for(const o of offs){
        const ext=Math.sqrt(Math.max(0,c.r*c.r-o*o))*(c.cls==="village"?0.8:1.05);
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
  return {cities:picks,bld:Float32Array.from(out),streets:Float32Array.from(streets)};
}
