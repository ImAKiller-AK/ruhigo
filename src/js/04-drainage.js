/* ---------------- Drainage, rivers, settlements ---------------- */
const GW=560,GH=280,GN=GW*GH;
let W0=null; // world-scale analysis
let names=[],worldName="",peakName="";
function setSeed(seed){
  P.seed=seed;worldRev++;const base=seedHash(seed),r=mulberry32(base);
  N={e:makeNoise(r),w1:makeNoise(r),w2:makeNoise(r),c:makeNoise(r),k:makeNoise(r),r:makeNoise(r),m:makeNoise(r),t:makeNoise(r)};
  const word=makeLanguage(mulberry32(base^0x9e3779b9));
  worldName=word(2);peakName="Mount "+word(1);names=[];for(let i=0;i<24;i++)names.push(word(2));
}
function analyseWorld(){
  const e=new Float32Array(GN),hm=new Float32Array(GN),T=new Float32Array(GN),R=new Float32Array(GN);
  for(let j=0;j<GH;j++)for(let i=0;i<GW;i++){
    const k=j*GW+i,x=(i+0.5)/GW*2,y=(j+0.5)/GH,v=elev(x,y,8);
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
  const thr=Math.max(6,landAcc[Math.floor(landAcc.length*0.965)]||6);
  const isR=new Uint8Array(GN);for(let k=0;k<GN;k++)if(hm[k]>=0&&acc[k]>=thr&&T[k]>-14)isR[k]=1;
  const inflow=new Uint8Array(GN);let mouths=0;
  for(let k=0;k<GN;k++)if(isR[k]){const r=recv[k];if(r>=0){if(isR[r])inflow[r]=1;else if(hm[r]<0)mouths++;}}
  const jr=mulberry32(seedHash(P.seed)^0x51ed27),cw=2/GW,ch=1/GH;
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
  const bio=new Uint8Array(GN);for(let k=0;k<GN;k++)bio[k]=biome(hm[k],T[k],R[k]);
  const f={hm,T,R,isR,acc,recv,thr,bio};
  W0={buckets,cities,land:land/GN,masses,mouths,peak:{x:(peak%GW+0.5)*cw,y:(((peak/GW)|0)+0.5)*ch,h:peakH},f,cost:null,costField:null,net:null,routes:[]};
}

