/* ---------------- Simulation: factions, resources, economy, wars, lore ---------------- */
const RES=[["Grain",[214,190,96]],["Timber",[96,150,92]],["Fish",[98,166,206]],["Ore",[176,170,184]],["Salt",[238,234,222]],["Furs",[186,136,100]],["Spice",[220,116,94]]];
const FCOL=[[208,92,74],[84,146,214],[160,116,214],[222,176,72],[72,180,160],[220,124,170]];
const END_YEAR=300,KEY=10,WAR_AT=0.75;
// balance of power: a faction holding a third of the land stops absorbing free land, and past a quarter its armies
// thin out, and no faction can be pushed below KEEP of the most land it ever held. Grudges: a frontier that stays strained (tension above GRUDGE_AT) builds up grievances year after year.
const CLAIM_CAP=1/3,KEEP=0.5,STRETCH_AT=0.25,GRUDGE_AT=0.45,GRUDGE_RATE=0.012,GRUDGE_MAX=0.3;
let SIM=null,simGen=0;

// one resource per land cell, from biome, altitude, rivers and coast (res: 0 none, 1..7 index into RES)
function buildResources(f,hs){
  const res=new Uint8Array(GN),yld=new Float32Array(GN);
  for(let k=0;k<GN;k++){
    const h=f.hm[k];if(h<0)continue;
    const b=f.bio[k],r=((Math.imul(k^hs,0x9E3779B1)>>>0)%1000)/1000,i=k%GW;let t=0,y=0;
    switch(b){
      case 5:t=6;y=0.6;break;
      case 6:if(r<0.3){t=6;y=0.5;}else{t=2;y=0.7;}break;
      case 7:t=1;y=0.3;break;
      case 8:t=1;y=1;break;
      case 9:t=2;y=1;break;
      case 10:t=2;y=1.2;break;
      case 11:if(r<0.3){t=5;y=0.6;}break;
      case 12:t=1;y=0.6;break;
      case 13:if(r<0.4){t=7;y=0.6;}else{t=2;y=0.6;}break;
      case 14:if(r<0.5){t=7;y=1;}else{t=2;y=0.8;}break;
      case 15:t=3;y=1;break;
      case 16:t=4;y=1;break;
    }
    if(t===1&&f.isR[k])y*=1.6;
    if(h>1400&&b!==16&&b!==17&&b!==4&&r>0.78){t=4;y=0.8;}
    if(t!==3&&r>0.55&&((i>0&&f.hm[k-1]<0)||(i<GW-1&&f.hm[k+1]<0)||(k>=GW&&f.hm[k-GW]<0)||(k<GN-GW&&f.hm[k+GW]<0))){t=3;y=0.8;}
    res[k]=t;yld[k]=y;
  }
  return {res,yld};
}
// map markers: the standout resource of each block of cells, rarer goods weighted up so the map is not all grain and timber
function resourceSites(res,yld,bs,hs){
  const out=[],wt=[0,1,1,2,3,4,3,3],cw=2/GW,ch=1/GH;
  for(let bj=0;bj<GH;bj+=bs)for(let bi=0;bi<GW;bi+=bs){
    const tot=new Float32Array(8);let land=0;
    for(let j=bj;j<Math.min(GH,bj+bs);j++)for(let i=bi;i<Math.min(GW,bi+bs);i++){const k=j*GW+i;if(res[k]){tot[res[k]]+=yld[k]*wt[res[k]];land++;}}
    if(land<bs*bs*0.12)continue;
    let best=1;for(let r=2;r<8;r++)if(tot[r]>tot[best])best=r;
    let pick=-1,ph=-1;
    for(let j=bj;j<Math.min(GH,bj+bs);j++)for(let i=bi;i<Math.min(GW,bi+bs);i++){const k=j*GW+i;if(res[k]!==best)continue;const h=Math.imul(k^hs,0x85EBCA6B)>>>0;if(h>ph){ph=h;pick=k;}}
    if(pick>=0)out.push({x:(pick%GW+0.5)*cw,y:(((pick/GW)|0)+0.5)*ch,r:best});
  }
  return out;
}
function smoothPath(path,city){ // same jitter and Chaikin passes as the drawn network, so caravans ride the roads
  let s=[];for(const k of path){const p=cellPoint(k,city[k]);s.push(p[0],p[1]);}
  for(let it=0;it<2&&s.length>4;it++){
    const o=[s[0],s[1]];
    for(let q=0;q<s.length-2;q+=2)o.push(.75*s[q]+.25*s[q+2],.75*s[q+1]+.25*s[q+3],.25*s[q]+.75*s[q+2],.25*s[q+1]+.75*s[q+3]);
    o.push(s[s.length-2],s[s.length-1]);s=o;
  }
  return s;
}

// Dijkstra over the cost field from one or many sources; claims and armies cross water at triple cost.
// With owner given it also records which source reaches each cell first.
function* spread(sources,cost,gen,owner){
  const f=cost.f,dist=new Float32Array(GN).fill(1e9),done=new Uint8Array(GN),heap=new MinHeap(1<<16);
  sources.forEach((k,i)=>{dist[k]=0;if(owner)owner[k]=i;heap.push(k,0);});
  let pops=0;
  while(heap.n){
    const k=heap.pop();if(done[k])continue;done[k]=1;
    const ki=k%GW,kj=(k/GW)|0,wet=f.hm[k]<0,dk=dist[k];
    for(let d=0;d<8;d++){
      const ni=ki+DX8[d],nj=kj+DY8[d];if(ni<0||nj<0||ni>=GW||nj>=GH)continue;
      const n=nj*GW+ni;if(done[n])continue;
      let c=cost.step(k,n,DIAG[d]);if(wet||f.hm[n]<0)c*=3;
      if(dk+c<dist[n]){dist[n]=dk+c;if(owner)owner[n]=owner[k];heap.push(n,dk+c);}
    }
    if((++pops&4095)===0){yield;if(gen!==simGen)return null;}
  }
  return dist;
}

const cityPop=(S,i,y)=>y<S.settled[i]?0:W0.cities[i].pop*(0.3+0.7*Math.min(1,(y-S.settled[i])/180));
// surplus (+) or shortage (-) of resource r for faction F, as a share of the larger of supply and need
function bal(S,e,F,r){const p=e.prod[F][r],d=S.totProd[r]*e.pop[F]/S.totPop;return (p-d)/Math.max(p,d,1e-6);}
// 0 calm .. 1 hostile. Geography sets the level: a long frontier across open country between capitals that sit close
// together is tense; mountains and wide rivers on the line calm it. A new or freshly settled border takes 40 years to
// heat up. Competing shortages add to it, and complementary trade along an open route takes some away.
function tensionCalc(S,e,A,B,y,len,bar,reach,since,link){
  if(!len&&!link)return 0;
  let rival=0,compl=0;
  for(let r=1;r<8;r++){const a=bal(S,e,A,r),b=bal(S,e,B,r);if(a<-0.15&&b<-0.15)rival++;else if((a>0.15&&b<-0.15)||(b>0.15&&a<-0.15))compl++;}
  let geo=0.06;
  if(len){
    const heat=Math.min(1,(y-since)/40),open=Math.max(0.15,Math.min(1,2.6/bar)),expo=Math.min(1,len/60),near=Math.exp(-reach/140);
    geo=heat*(0.12+0.4*expo*open+0.45*near*open);
  }
  return Math.max(0,Math.min(1,geo+0.5*rival/7-0.45*compl/7*(link?1:0.3)));
}
// fighting strength: people, fed by grain and armed by ore
const might=(S,e,F)=>Math.max(0.2,Math.sqrt(e.pop[F]/1e5+0.05)*(1+0.4*bal(S,e,F,1)+0.4*bal(S,e,F,4)));

// Builds the whole simulation: where each faction would spread unopposed, then 300 years of history on top of that.
function* simTask(gen,say){
  const f=W0.f,cities=W0.cities,cost=W0.costField,hs=seedHash(P.seed),nC=cities.length;
  const seeds=[];
  for(let i=0;i<nC&&seeds.length<FCOL.length;i++){const c=cities[i];if(seeds.every(j=>(cities[j].x-c.x)**2+(cities[j].y-c.y)**2>0.04))seeds.push(i);}
  const nF=seeds.length,owner0=new Int8Array(GN).fill(-1);
  const arr=yield* spread(seeds.map(ci=>cities[ci].k),cost,gen,owner0);if(!arr)return null;
  let nl=0;for(let k=0;k<GN;k++)if(f.hm[k]>=0)nl++;
  const la=new Float32Array(nl);for(let k=0,q=0;k<GN;k++)if(f.hm[k]>=0)la[q++]=arr[k];
  la.sort();const sc=110/Math.max(1e-6,la[nl>>1]); // the median land cell is first claimed in year 110
  for(let k=0;k<GN;k++)arr[k]*=sc;
  say("Measuring supply lines…");
  const capDist=[]; // cost distance from each capital on its own: how hard it is to supply an army at any cell
  for(const ci of seeds){const d=yield* spread([cities[ci].k],cost,gen,null);if(!d)return null;for(let k=0;k<GN;k++)d[k]*=sc;capDist.push(d);}
  yield;

  // cost of crossing between a land cell and its right / lower neighbour: the terrain a frontier runs through
  const crossR=new Float32Array(GN),crossD=new Float32Array(GN);
  for(let k=0;k<GN;k++){
    if(f.hm[k]<0)continue;
    if(k%GW<GW-1&&f.hm[k+1]>=0)crossR[k]=0.5*(cost.step(k,k+1,0)+cost.step(k+1,k,0));
    if(k<GN-GW&&f.hm[k+GW]>=0)crossD[k]=0.5*(cost.step(k,k+GW,0)+cost.step(k+GW,k,0));
  }
  yield;
  const fort=new Uint8Array(GN),cityAt=new Int16Array(GN).fill(-1); // capitals cannot fall; the land around them is fortified
  cities.forEach((c,i)=>{cityAt[c.k]=i;});
  for(const ci of seeds){const k=cities[ci].k,ki=k%GW,kj=(k/GW)|0;for(let dj=-3;dj<=3;dj++)for(let di=-3;di<=3;di++){const i2=ki+di,j2=kj+dj;if(i2>=0&&j2>=0&&i2<GW&&j2<GH)fort[j2*GW+i2]=1;}fort[k]=2;}

  const word=makeLanguage(mulberry32(hs^0x5bd1e995)),KIND=["League","Kingdom","Compact","Dominion","Confederacy","Marches"];
  const factions=seeds.map((ci,i)=>{
    const c=cities[ci],kind=KIND[(hs+i*7)%6];
    return {id:i,cap:ci,color:FCOL[i],kind,name:kind==="Kingdom"||kind==="Dominion"?kind+" of "+c.name:c.name+" "+kind,cx:c.x,cy:c.y};
  });
  yield;
  const {res,yld}=buildResources(f,hs),settled=[],good=[];
  cities.forEach((c,i)=>{
    settled.push(seeds.indexOf(i)>=0?0:Math.min(arr[c.k],240)*0.8);
    const tot=new Float32Array(8),ci=c.k%GW,cj=(c.k/GW)|0;
    for(let dj=-5;dj<=5;dj++)for(let di=-5;di<=5;di++){const i2=ci+di,j2=cj+dj;if(i2<0||j2<0||i2>=GW||j2>=GH)continue;const k=j2*GW+i2;if(res[k])tot[res[k]]+=yld[k]*[0,1,1,1.5,2.5,3,2.5,2.5][res[k]];}
    let best=1;for(let r=2;r<8;r++)if(tot[r]>tot[best])best=r;good.push(best);
  });
  yield;
  for(const r of W0.routes){
    r.pts=smoothPath(r.path,cost.city);
    r.open=Math.min(290,Math.round(Math.max(settled[r.a],settled[r.b])+4+r.path.length*0.15));
    let sea=0;for(const k of r.path)if(f.hm[k]<0)sea++;r.sea=sea/r.path.length;
    let km=0;for(let q=1;q<r.path.length;q++){const d=Math.abs(r.path[q]-r.path[q-1]);km+=(d===1||d===GW?1:Math.SQRT2)*40000/GW;}r.km=km;
  }
  const S={hs,nF,nC,owner0,arr,capDist,crossR,crossD,fort,cityAt,factions,settled,good,res,yld,landCells:nl,
    cityWho:cities.map(()=>word(2)),routeWho:W0.routes.map(()=>word(2)), // names fixed once so lore reads the same every time
    sites:[resourceSites(res,yld,40,hs),resourceSites(res,yld,20,hs)],
    own:new Int8Array(GN).fill(-1),ownYear:-1,year:END_YEAR,yi:-1,playing:false,speed:1,clock:0,net:null,openCount:-1};
  say("Writing 300 years of history…");
  yield;
  if(!(yield* history(S,gen)))return null;
  return S;
}

// The history engine. It runs once, year by year, in the background, and records everything the timeline needs:
//   chCell/chTo + yearStart  every change of ownership, in order, with where each year begins in the log
//   keys                     a full ownership snapshot every KEY years
//   ecoY, tens, fLen/fBar/fReach, cityFY, wars   one value per year for the panels
// Showing any year afterwards is a snapshot copy plus a few years of logged changes: see stateAt.
function* history(S,gen){
  const f=W0.f,cities=W0.cities,routes=W0.routes,{nF,nC,owner0,arr,res,yld,capDist,crossR,crossD,fort,cityAt,hs}=S,nP=nF*nF,Y=END_YEAR+1;
  const order=[];for(let k=0;k<GN;k++)if(f.hm[k]>=0&&owner0[k]>=0&&arr[k]<=END_YEAR)order.push(k);
  order.sort((a,b)=>arr[a]-arr[b]);
  S.totProd=new Float32Array(8);for(const k of order)if(res[k])S.totProd[res[k]]+=yld[k]; // world supply and people at the end, the yardstick for demand
  S.totPop=1;for(let i=0;i<nC;i++)S.totPop+=cityPop(S,i,END_YEAR);
  const own=new Int8Array(GN).fill(-1),cells=new Int32Array(nF),peak=new Int32Array(nF),prod=[];for(let F=0;F<nF;F++)prod.push(new Float32Array(8));
  const chCell=[],chTo=[],yearStart=new Int32Array(Y+1),keys=[];
  const set=(k,o)=>{
    const p=own[k];if(p===o)return;
    if(p>=0){cells[p]--;if(res[k])prod[p][res[k]]-=yld[k];}
    own[k]=o;cells[o]++;if(cells[o]>peak[o])peak[o]=cells[o];if(res[k])prod[o][res[k]]+=yld[k];
    chCell.push(k);chTo.push(o);
  };
  const ecoY=[],tens=[],fLen=[],fBar=[],fReach=[],first=new Float32Array(nP).fill(-1),since=new Float32Array(nP),cityFY=new Int8Array(Y*nC).fill(-1);
  for(let p=0;p<nP;p++){tens.push(null);fLen.push(null);fBar.push(null);fReach.push(null);}
  for(let A=0;A<nF;A++)for(let B=A+1;B<nF;B++)tens[A*nF+B]=new Float32Array(Y);
  const wars=[],active=new Int32Array(nP).fill(-1),truce=new Float32Array(nP),lastT=new Float32Array(nP),segs=[];for(let p=0;p<nP;p++)segs.push([]);
  const fl=new Float32Array(nP),fb=new Float32Array(nP),fr=new Float32Array(nP),fx=new Float64Array(nP),fy=new Float64Array(nP);
  const cityTaken=cities.map(()=>[]);
  // coalitions: a pact binds the neighbours of one faction that has grown too strong or won too much
  const pacts=[],pactOf=new Int32Array(nF).fill(-1),pactOn=new Int32Array(nF).fill(-1),pactCool=new Float32Array(nF),won=[],lostTo=new Float32Array(nP).fill(-1e9);
  for(let F=0;F<nF;F++)won.push([]);
  const versus=(X,foe)=>pactOf[X]>=0&&pacts[pactOf[X]].target===foe; // X belongs to a pact aimed at foe
  // an offensive pact backs every war against its target; a defensive one only answers the target's own attacks
  const pactActs=(P,W,tgt)=>P.mode==="offensive"||W.att===tgt||W.joint;
  const stretch=F=>{const s=cells[F]/S.landCells;return s<=STRETCH_AT?1:Math.max(0.35,1-3*(s-STRETCH_AT));};
  const grudge=new Float32Array(nP),deferred=[];
  // which faction takes a free cell: the one that reached it first, unless a rival already holds the ground beside it;
  // a faction at the claim cap leaves it to a rival or to later (-1)
  const claimer=k=>{
    let o=owner0[k],mine=false,alt=-1;const ki=k%GW,kj=(k/GW)|0;
    for(let d=0;d<8;d++){const ni=ki+DX8[d],nj=kj+DY8[d];if(ni<0||nj<0||ni>=GW||nj>=GH)continue;const q=own[nj*GW+ni];if(q===o)mine=true;else if(q>=0&&(alt<0||cells[q]<cells[alt]))alt=q;}
    if(!mine&&alt>=0)o=alt;
    if(cells[o]>=CLAIM_CAP*S.landCells)o=alt>=0&&cells[alt]<CLAIM_CAP*S.landCells?alt:-1;
    return o;
  };
  let oi=0;
  for(let y=0;y<=END_YEAR;y++){
    yearStart[y]=chCell.length;
    // 1. wars under way push their front: on each frontier segment the side that is stronger there may take the cell opposite
    if(y>0){
      const e=ecoY[y-1];
      for(let p=0;p<nP;p++){
        const wi=active[p];if(wi<0)continue;const W=wars[wi],list=segs[p],m=[];m[W.a]=might(S,e,W.a)*stretch(W.a);m[W.b]=might(S,e,W.b)*stretch(W.b);
        for(const X of [W.a,W.b]){ // pact partners send men and grain to whoever is fighting the pact's target
          const foe=X===W.a?W.b:W.a;if(!versus(X,foe)||!pactActs(pacts[pactOf[X]],W,foe))continue;
          for(const N of pacts[pactOf[X]].members)if(N!==X)m[X]+=0.45*might(S,e,N);
        }
        for(let q=0;q<list.length;q+=3){
          const k=list[q],n=list[q+1],a=own[k],b=own[n];if(a===b||m[a]===undefined||m[b]===undefined)continue; // already moved this year
          const sa=m[a]/(1+capDist[a][n]/90),sb=m[b]/(1+capDist[b][k]/90); // strength fades with the length of the supply line
          const att=sa>=sb?a:b,target=sa>=sb?n:k,ratio=sa>=sb?sa/sb:sb/sa;
          if(fort[target]===2||cells[own[target]]<=KEEP*peak[own[target]])continue; // capitals hold, and so does a faction's last core
          let pr=Math.min(0.55,0.045+0.5*(ratio-1))/(0.6+0.4*list[q+2]); // rough ground and rivers hold the line
          if(fort[target])pr*=0.15;
          if(((Math.imul((target*307+y)^hs,0x9E3779B1)>>>0)%10000)/10000<pr){
            const loser=own[target];set(target,att);W.gain[att===W.a?0:1]++;
            const ci=cityAt[target];if(ci>=0){W.towns.push({city:ci,year:y,to:att,from:loser});cityTaken[ci].push([y,att]);}
          }
        }
      }
    }
    // 2. peaceful claims: each cell joins at its year, with the faction that reached it first unless a rival now holds the ground beside it
    //    cells held back by the claim cap are offered again every year
    if(deferred.length){let w=0;for(const k of deferred){if(own[k]>=0)continue;const o=claimer(k);if(o>=0)set(k,o);else deferred[w++]=k;}deferred.length=w;}
    while(oi<order.length&&arr[order[oi]]<=y){
      const k=order[oi++];if(own[k]>=0)continue;
      const o=claimer(k);if(o>=0)set(k,o);else deferred.push(k);
    }
    // 3. frontier scan: length, crossing cost, closest approach of the two capitals and centre of every shared border
    fl.fill(0);fb.fill(0);fr.fill(1e9);fx.fill(0);fy.fill(0);for(let p=0;p<nP;p++)if(segs[p].length)segs[p].length=0;
    for(let k=0;k<GN;k++){
      const a=own[k];if(a<0)continue;
      for(let s=0;s<2;s++){
        if(s===0?k%GW===GW-1:k>=GN-GW)continue;
        const n=s===0?k+1:k+GW,b=own[n];if(b<0||b===a)continue;
        const p=a<b?a*nF+b:b*nF+a,c=s===0?crossR[k]:crossD[k],r=capDist[a][k]+capDist[b][n];
        fl[p]++;fb[p]+=c;if(r<fr[p])fr[p]=r;fx[p]+=k%GW;fy[p]+=(k/GW)|0;
        if(active[p]>=0||lastT[p]>=0.6)segs[p].push(k,n,c);
      }
    }
    // 4. economy of the year
    const pop=new Float64Array(nF),towns=new Int32Array(nF),border=[];
    for(let F=0;F<nF;F++){border.push(new Float32Array(nF));for(let G=0;G<nF;G++)border[F][G]=fl[F<G?F*nF+G:G*nF+F];}
    for(let i=0;i<nC;i++){const F=y>=S.settled[i]?own[cities[i].k]:-1;cityFY[y*nC+i]=F;if(F>=0){pop[F]+=cityPop(S,i,y);towns[F]++;}}
    const e={y,prod:prod.map(a=>a.slice()),cells:cells.slice(),pop,towns,border};ecoY.push(e);
    // 5a. pacts end with time or once their target has been cut down; new ones form around a faction that is
    //     much stronger than its neighbours or keeps winning wars
    const mt=[];for(let F=0;F<nF;F++)mt.push(might(S,e,F));
    for(const P of pacts){
      if(P.end>=0)continue;
      if(y-P.start>=P.dur||cells[P.target]<0.7*P.cells0){P.end=y;for(const N of P.members)pactOf[N]=-1;pactOn[P.target]=-1;pactCool[P.target]=y+30;}
    }
    if(y>=20)for(let X=0;X<nF;X++){
      if(pactOn[X]>=0||pactOf[X]>=0||y<pactCool[X])continue;
      const others=mt.filter((v,F)=>F!==X).sort((a,b)=>a-b),med=others[others.length>>1]||1;
      const recent=won[X].filter(w=>y-w[0]<=80);let taken=0;for(const w of recent)taken+=w[1];
      const strong=mt[X]>=1.5*med&&cells[X]>=0.25*S.landCells*0.75,aggressive=recent.length>=2||taken>=250;
      if(!strong&&!aggressive)continue;
      let members=[];
      for(let N=0;N<nF;N++){
        if(N===X||pactOf[N]>=0||pactOn[N]>=0)continue;const p=N<X?N*nF+X:X*nF+N;if(!fl[p])continue;
        if(mt[N]<mt[X]||y-lostTo[N*nF+X]<=80||lastT[p]>=0.5)members.push(N); // the weaker, the recently beaten and the already worried
      }
      members=members.filter(N=>!members.some(M=>M!==N&&active[N<M?N*nF+M:M*nF+N]>=0)); // no pact between two sides of a war
      if(members.length<2)continue;
      pacts.push({id:pacts.length,target:X,members,mode:aggressive?"offensive":"defensive",start:y,end:-1,dur:25+(Math.imul((X*131+y)^hs,0x9E3779B1)>>>0)%20,cells0:cells[X],why:aggressive?"wars":"strength",wars:[]});
      for(const N of members)pactOf[N]=pacts.length-1;pactOn[X]=pacts.length-1;
    }
    // 5b. tension of every pair, then wars starting and ending
    for(let A=0;A<nF;A++)for(let B=A+1;B<nF;B++){
      const p=A*nF+B,len=fl[p];
      if(len){
        if(first[p]<0){first[p]=y;since[p]=y;fLen[p]=new Float32Array(Y);fBar[p]=new Float32Array(Y);fReach[p]=new Float32Array(Y);}
        fLen[p][y]=len;fBar[p][y]=fb[p]/len;fReach[p][y]=fr[p];
      }
      const link=routes.some(r=>{if(r.open>y)return false;const a=cityFY[y*nC+r.a],b=cityFY[y*nC+r.b];return (a===A&&b===B)||(a===B&&b===A);});
      let t=tensionCalc(S,e,A,B,y,len,len?fb[p]/len:1,fr[p],since[p],link);
      const allied=pactOf[A]>=0&&pactOf[A]===pactOf[B],tgt=versus(A,B)?B:versus(B,A)?A:-1,TP=tgt>=0?pacts[pactOn[tgt]]:null;
      if(allied)t*=0.55;            // partners set their own quarrels aside
      else if(TP&&TP.mode==="offensive")t=Math.min(1,t+0.15); // and an offensive pact closes ranks against the target
      // grievances pile up on a frontier that stays strained and fade on one that calms down
      if(len&&active[p]<0){if(t>=GRUDGE_AT)grudge[p]=Math.min(GRUDGE_MAX,grudge[p]+(t-GRUDGE_AT)*GRUDGE_RATE);else grudge[p]*=0.9;t=Math.min(1,t+grudge[p]);}
      // joint attack: once the target is at war with one member (and, for a defensive pact, it was the target that
      // attacked), the others open their own fronts
      const joint=!!TP&&TP.members.some(N=>{if(N===A||N===B)return false;const wi=active[N<tgt?N*nF+tgt:tgt*nF+N];return wi>=0&&pactActs(TP,wars[wi],tgt);});
      let wi=active[p];
      if(wi>=0){
        const W=wars[wi];
        W.px.push(len?fx[p]/len:W.px[W.px.length-1]);W.py.push(len?fy[p]/len:W.py[W.py.length-1]);
        if(y-W.start>=W.dur||!len||cells[A]<0.6*W.cells0[0]||cells[B]<0.6*W.cells0[1]){ // peace: time, exhaustion or no front left
          W.end=y;active[p]=-1;wi=-1;grudge[p]=0;truce[p]=y+25+(Math.imul(wi^p^hs,0x85EBCA6B)>>>0)%20;since[p]=y; // the new border has to heat up again
          const net=W.gain[0]-W.gain[1];
          if(net>=25){won[A].push([y,net]);lostTo[B*nF+A]=y;}else if(net<=-25){won[B].push([y,-net]);lostTo[A*nF+B]=y;}
          t=tensionCalc(S,e,A,B,y,len,len?fb[p]/len:1,fr[p],since[p],link);
        }else t=Math.max(t,0.92);
      }else if(len&&!allied&&(t>=WAR_AT||joint)&&y>=truce[p]&&y<END_YEAR-4){
        const n=wars.filter(w=>w.a===A&&w.b===B).length;
        // the attacker: a pact member opening a joint front, otherwise the stronger side
        const att=joint?(tgt===A?B:A):mt[A]>=mt[B]?A:B,W={id:wars.length,a:A,b:B,att,start:y,end:-1,dur:6+(Math.imul((p*977+y)^hs,0x9E3779B1)>>>0)%18,gain:[0,0],towns:[],nth:n,
          px:[fx[p]/len],py:[fy[p]/len],cells0:[cells[A],cells[B]],km:len*40000/GW,bar:fb[p]/len,pact:-1,joint};
        if(TP&&pactActs(TP,W,tgt)){W.pact=pactOn[tgt];TP.wars.push(W.id);}
        wars.push(W);
        active[p]=wars.length-1;t=Math.max(t,0.92);
      }
      tens[p][y]=t;lastT[p]=t;
    }
    if(y%KEY===0)keys.push(own.slice());
    yield;if(gen!==simGen)return false;
  }
  yearStart[Y]=chCell.length;
  const ORD=["First","Second","Third","Fourth","Fifth","Sixth"];
  for(const W of wars){
    const many=wars.some(o=>o!==W&&o.a===W.a&&o.b===W.b);
    W.name=(many?(ORD[W.nth]||"Last")+" ":"")+cities[S.factions[W.a].cap].name+"–"+cities[S.factions[W.b].cap].name+" War";
  }
  for(const P of pacts){
    const caps=P.members.map(N=>cities[S.factions[N].cap].name),base=caps.length===2?caps[0]+"–"+caps[1]+" Pact":"Coalition against "+cities[S.factions[P.target].cap].name;
    const before=pacts.filter(o=>o.id<P.id&&o.base===base).length;P.base=base;P.name=(pacts.some(o=>o!==P&&o.target===P.target&&o.members.join()===P.members.join())?(ORD[before]||"Last")+" ":"")+base;
  }
  for(const F of S.factions){F.cx=0;F.cy=0;F.n=0;}
  for(let k=0;k<GN;k++){const o=own[k];if(o>=0){const F=S.factions[o];F.cx+=k%GW;F.cy+=(k/GW)|0;F.n++;}}
  for(const F of S.factions){if(F.n){F.cx=(F.cx/F.n+0.5)*2/GW;F.cy=(F.cy/F.n+0.5)/GH;}else{F.cx=cities[F.cap].x;F.cy=cities[F.cap].y;}}
  S.joined=cities.map((c,i)=>{for(let y=0;y<Y;y++)if(cityFY[y*nC+i]>=0)return y;return Infinity;});
  Object.assign(S,{chCell:Int32Array.from(chCell),chTo:Int8Array.from(chTo),yearStart,keys,ecoY,tens,fLen,fBar,fReach,first,cityFY,wars,pacts,cityTaken});
  return true;
}

/* ---- reading the recorded history: every call below is a table lookup ---- */
const yr=y=>Math.max(0,Math.min(END_YEAR,Math.floor(y)));
// ownership of every cell in year y: nearest snapshot at or before y, then replay the logged changes up to y.
// Stepping forward during playback just replays the next year on top of what is already there.
function stateAt(y){
  const S=SIM;y=yr(y);if(S.ownYear===y)return S.own;
  let from=S.ownYear;
  if(from<0||y<from||y-from>KEY){const kf=Math.floor(y/KEY);S.own.set(S.keys[kf]);from=kf*KEY;}
  for(let q=S.yearStart[from+1],e=S.yearStart[y+1];q<e;q++)S.own[S.chCell[q]]=S.chTo[q];
  S.ownYear=y;return S.own;
}
const simEconomy=y=>SIM.ecoY[yr(y)];
const balance=(e,F,r)=>bal(SIM,e,F,r);
const cityFAt=(i,y)=>SIM.cityFY[yr(y)*SIM.nC+i];
function frontAt(A,B,y){
  const S=SIM,p=A<B?A*S.nF+B:B*S.nF+A;y=yr(y);if(!S.fLen[p]||!S.fLen[p][y])return null;
  return {len:S.fLen[p][y],barrier:S.fBar[p][y],reach:S.fReach[p][y],first:S.first[p]};
}
function tension(A,B,y){const S=SIM,t=S.tens[A<B?A*S.nF+B:B*S.nF+A];return t?t[yr(y)]:0;}
function warAt(A,B,y){ // the war between two factions in year y, if any
  const a=Math.min(A,B),b=Math.max(A,B);
  for(const W of SIM.wars)if(W.a===a&&W.b===b&&W.start<=y&&(W.end<0||y<W.end))return W;
  return null;
}
const warsAt=y=>SIM.wars.filter(W=>W.start<=y&&(W.end<0||y<W.end));
const pactsAt=y=>SIM.pacts.filter(P=>P.start<=y&&(P.end<0||y<P.end));
const pactOfAt=(F,y)=>pactsAt(y).find(P=>P.members.includes(F))||null; // the pact a faction belongs to
const pactOnAt=(F,y)=>pactsAt(y).find(P=>P.target===F)||null;         // the pact aimed at it
const alliedAt=(A,B,y)=>{const P=pactOfAt(A,y);return !!P&&P.members.includes(B);};
function linked(A,B,y){
  return W0.routes.some(r=>{if(r.open>y)return false;const a=cityFAt(r.a,y),b=cityFAt(r.b,y);return (a===A&&b===B)||(a===B&&b===A);});
}
const LEVELS=[["Calm","calm"],["Wary","wary"],["Strained","strained"],["Hostile","hostile"]];
const level=t=>LEVELS[t<0.25?0:t<0.5?1:t<WAR_AT?2:3];
function routeStatus(r,y){
  const A=cityFAt(r.a,y),B=cityFAt(r.b,y);
  if(r.open>y)return {label:"Opens in year "+r.open,cls:"muted",t:0,A,B};
  if(A>=0&&A===B)return {label:"Internal",cls:"calm",t:0,A,B};
  if(A<0||B<0)return {label:"Open",cls:"calm",t:0,A,B};
  const t=tension(A,B,y);
  if(warAt(A,B,y))return {label:"Cut by war",cls:"hostile",t,A,B};
  const l=level(t);
  return {label:["Open","Tolled","Harassed","Closed"][LEVELS.indexOf(l)],cls:l[1],t,A,B};
}
function heldSince(i,y){ // the year the town's present faction took it
  const F=cityFAt(i,y);let s=yr(y);while(s>0&&cityFAt(i,s-1)===F)s--;return s;
}

// area of n analysis cells in words: each cell is about 5,100 km²
function landArea(n,short){const km=n*5100;return km>=1e6?(km/1e6).toFixed(1)+(short?"M km²":" million km²"):Math.round(km/1000).toLocaleString("en-US")+(short?"k km²":",000 km²");}
/* procedural lore: fixed for a given seed, written from what the simulation actually produced */
function loreRng(tag){const r=mulberry32(SIM.hs^Math.imul(tag+1,0x85EBCA6B));return a=>a[Math.floor(r()*a.length)];}
function cityLore(i){
  const S=SIM,c=W0.cities[i],f=W0.f,pick=loreRng(i),F=cityFAt(i,END_YEAR),fa=F>=0?S.factions[F]:null,k=c.k,ci=k%GW;
  const coastal=(ci>0&&f.hm[k-1]<0)||(ci<GW-1&&f.hm[k+1]<0)||(k>=GW&&f.hm[k-GW]<0)||(k<GN-GW&&f.hm[k+GW]<0);
  const site=f.isR[k]?pick(["at a ford on the river","where the river slows enough to load barges"]):coastal?pick(["around a sheltered anchorage","on a shingle bank where boats could be hauled out"]):pick(["at a crossing of herders' tracks","beside a spring that never failed"]);
  const who=S.cityWho[i],good=RES[S.good[i]-1][0].toLowerCase(),land=B[c.biome][0].toLowerCase(),taken=S.cityTaken[i];
  let s=fa&&fa.cap===i?c.name+" was raised "+site+" by "+who+", whose heirs still seat the "+fa.name+".":c.name+" began "+site+" around year "+Math.round(S.settled[i])+", when "+who+" led "+pick(["three families","a dispossessed clan","a company of traders","a shipload of exiles"])+" there.";
  s+=" The "+land+" around it is worked for "+good+", which "+pick(["fills its market","pays its tithes","built its walls"])+".";
  if(fa&&fa.cap!==i){
    if(S.joined[i]===Infinity)s+=" No great power has ever held it.";
    else{
      const j=cityFAt(i,S.joined[i]);s+=" It came under the "+S.factions[j].name+" in year "+S.joined[i]+pick([" by treaty."," after a short siege."," when its council voted to join."]);
      if(taken.length)s+=" War has changed its masters "+(taken.length===1?"once":taken.length+" times")+"; the "+S.factions[taken[taken.length-1][1]].name+" took it in year "+taken[taken.length-1][0]+".";
    }
  }
  return s;
}
function factionLore(F){
  const S=SIM,fa=S.factions[F],cap=W0.cities[fa.cap],e=simEconomy(END_YEAR),pick=loreRng(100+F);
  let hi=1,lo=1;for(let r=2;r<8;r++){if(balance(e,F,r)>balance(e,F,hi))hi=r;if(balance(e,F,r)<balance(e,F,lo))lo=r;}
  const wars=S.wars.filter(W=>W.a===F||W.b===F);let net=0;for(const W of wars)net+=W.a===F?W.gain[0]-W.gain[1]:W.gain[1]-W.gain[0];
  let s="The "+fa.name+" grew outward from "+cap.name+pick([", one valley at a time.",", following its rivers to the sea.",", buying loyalty where it could and taking it where it could not."]);
  s+=" By year "+END_YEAR+" it holds "+Math.round(e.cells[F]/S.landCells*100)+"% of the world's land and "+e.towns[F]+(e.towns[F]===1?" town":" towns")+".";
  s+=" It sells "+RES[hi-1][0].toLowerCase()+" and is always short of "+RES[lo-1][0].toLowerCase()+".";
  if(wars.length){
    const foe=wars[wars.length-1],other=S.factions[foe.a===F?foe.b:foe.a];
    s+=" It has fought "+(wars.length===1?"one war":wars.length+" wars")+", most recently against the "+other.name+", and came out of them "+(net>40?"larger":net<-40?"smaller":"much as it went in")+".";
  }else s+=" It has never gone to war.";
  return s;
}
function routeLore(ri){
  const S=SIM,r=W0.routes[ri],a=W0.cities[r.a],b=W0.cities[r.b],pick=loreRng(200+ri),ga=RES[S.good[r.a]-1][0].toLowerCase(),gb=RES[S.good[r.b]-1][0].toLowerCase();
  let s="First travelled in year "+r.open+" by "+S.routeWho[ri]+" of "+a.name+", the "+(r.sea>0.5?"passage":"road")+" to "+b.name+" carries "+(ga===gb?ga:ga+" one way and "+gb+" the other")+".";
  s+=r.sea>0.5?pick([" Crews wait out the storm season in harbour."," Pilots keep its shoals a guild secret."]):pick([" Waystations stand a day's march apart along it."," Its milestones are older than most of the towns it joins."]);
  return s;
}
function warLore(wi){
  const S=SIM,W=S.wars[wi],A=S.factions[W.a],Bf=S.factions[W.b],pick=loreRng(300+wi),win=W.gain[0]>=W.gain[1]?A:Bf,lose=win===A?Bf:A,net=Math.abs(W.gain[0]-W.gain[1]);
  const att=S.factions[W.att],P=W.pact>=0?S.pacts[W.pact]:null;
  let s="The "+W.name+" broke out in year "+W.start+" along "+fmtInt(W.km)+" km of "+(W.bar<1.8?"open country":W.bar<3.2?"broken country":"mountain and river frontier")+", "
    +(W.joint?"when the "+att.name+(P&&P.mode==="defensive"?" came to the defence of its allies.":" opened a second front for its allies.")
     :"when the "+att.name+" crossed the border after "+pick(["a toll dispute turned into a raid","a border fort was burned","years of quarrels over grazing rights","envoys were sent home unheard"])+".");
  if(net<25)s+=" Neither side could move the other far, and the line settled close to where it began.";
  else s+=" The "+win.name+", "+pick(["better fed and closer to its depots","with more men under arms","fighting nearer its own roads"])+", pushed the "+lose.name+" back across "+landArea(net)+".";
  if(W.towns.length)s+=" "+W.towns.map(t=>W0.cities[t.city].name+" fell in year "+t.year).join("; ")+".";
  s+=W.end<0?" It was still being fought in year "+END_YEAR+".":" Peace came in year "+W.end+".";
  return s;
}
function pactLore(pi){
  const S=SIM,P=S.pacts[pi],X=S.factions[P.target],pick=loreRng(400+pi),names=P.members.map(N=>"the "+S.factions[N].name);
  let s="In year "+P.start+" "+names.slice(0,-1).join(", ")+" and "+names[names.length-1]+" swore the "+P.name+" against the "+X.name+", which "+(P.why==="wars"?pick(["had won more land by the sword than any of them could afford to lose","kept coming back from its wars larger than it went in"]):pick(["had grown stronger than any two of them together","could by then outfit more men than all its neighbours"]))+".";
  s+=P.mode==="defensive"
    ?" It was a pact of defence: each promised "+pick(["grain and spearmen","passage for the others' armies","to treat an attack on one as an attack on all"])+" if the "+X.name+" struck first, and nothing more."
    :" Its members swore to march together: once one of them was at war with the "+X.name+", the others would open fronts of their own.";
  if(P.wars.length)s+=" Under it they fought "+(P.wars.length===1?"the "+S.wars[P.wars[0]].name:P.wars.length+" wars")+(P.wars.some(w=>S.wars[w].joint)?", opening more than one front at once.":".");
  else s+=P.mode==="defensive"?" The "+X.name+" never put it to the test.":" It was never tested in war.";
  s+=P.end<0?" It still stood in year "+END_YEAR+".":" It lapsed in year "+P.end+(S.ecoY[P.end].cells[P.target]<0.7*P.cells0?", its work done.":", when the members' interests drifted apart.");
  return s;
}
/* ---------------- end simulation ---------------- */

