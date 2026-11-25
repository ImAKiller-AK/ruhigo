/* ---------------- Travel cost, A* routes, scheduler ---------------- */
// Friction per biome (index into B): how hard a kilometre is to cross, relative to open grassland.
const FRICTION=[1,0.85,0.7,9,10,3,2.2,1.3,1,1.6,2.4,2.6,1.2,1.8,3.2,0.9,4.5,9];
const DX8=[-1,0,1,-1,1,-1,0,1],DY8=[-1,-1,-1,0,0,1,1,1],DIAG=[1,0,1,0,0,1,0,1];
const PORT=12,HARBOUR=4,FORD=0.8,ROAD=0.5,LANE=0.8,MIN_COST=0.24,BRIDGE=22; // MIN_COST: cheapest possible step per cell, keeps the A* heuristic admissible

// Cost of one step between neighbouring analysis cells. Slope and rivers depend on direction, so it is computed per step.
class CostField{
  constructor(f){
    this.f=f;this.base=new Float32Array(GN);this.road=new Float32Array(GN).fill(1);this.city=new Uint8Array(GN);
    for(let k=0;k<GN;k++)this.base[k]=FRICTION[f.bio[k]];
    // on a battle map water is crossed by bridges (dear per cell, so only narrow water is bridged) and a 12% grade
    // doubles the effort; on a planet ships load at ports and 600 m of climb between cells doubles it
    this.arena=isArena();this.grade=this.arena?CELL_M*0.12:600;
  }
  step(a,b,diag){
    const f=this.f,d=diag?Math.SQRT2:1,sa=f.hm[a]<0,sb=f.hm[b]<0;
    const rd=Math.min(this.road[a],this.road[b]);
    if(this.arena&&(sa||sb))return d*BRIDGE*rd;
    if(sa!==sb)return d+((sa?this.city[b]:this.city[a])?HARBOUR:PORT); // loading or unloading a ship; towns have harbours
    const flat=d*0.5*(this.base[a]+this.base[b]);
    if(sa)return flat*rd;
    const dh=(f.hm[b]-f.hm[a])/(this.grade*d);
    let c=flat*(1+dh*dh); // a 600 m climb between cells doubles the effort
    if(f.recv[a]===b||f.recv[b]===a){if(f.isR[a]&&f.isR[b])c*=0.55;} // following a river valley
    else if(f.isR[b])c+=FORD*(0.5+Math.log2(f.acc[b]/f.thr));       // fording: wider rivers cost more
    else if(diag){ // a diagonal step may slip between two river cells; that is a crossing too
      const dx=b%GW-a%GW,o1=a+dx,o2=b-dx;
      if(f.isR[o1]&&f.isR[o2]&&(f.recv[o1]===o2||f.recv[o2]===o1))c+=FORD*(0.5+Math.log2(f.acc[o1]/f.thr));
    }
    return c*rd;
  }
  // per-cell picture of the field: mean cost of stepping in from the neighbouring land cells
  display(){
    const out=new Float32Array(GN),f=this.f;
    for(let k=0;k<GN;k++){
      if(f.hm[k]<0){out[k]=this.base[k];continue;}
      const ki=k%GW,kj=(k/GW)|0;let s=0,n=0;
      for(let d=0;d<8;d++){const ni=ki+DX8[d],nj=kj+DY8[d];if(ni<0||nj<0||ni>=GW||nj>=GH)continue;const m=nj*GW+ni;if(f.hm[m]<0)continue;s+=this.step(m,k,DIAG[d])/(DIAG[d]?Math.SQRT2:1);n++;}
      out[k]=n?s/n:this.base[k];
    }
    return out;
  }
}

class MinHeap{
  constructor(n){this.k=new Float32Array(n);this.v=new Int32Array(n);this.n=0;}
  push(v,key){
    if(this.n===this.k.length){const k=new Float32Array(this.n*2),w=new Int32Array(this.n*2);k.set(this.k);w.set(this.v);this.k=k;this.v=w;}
    const K=this.k,V=this.v;let c=this.n++;
    while(c>0){const p=(c-1)>>1;if(K[p]<=key)break;K[c]=K[p];V[c]=V[p];c=p;}
    K[c]=key;V[c]=v;
  }
  pop(){
    const K=this.k,V=this.v,top=V[0],lk=K[--this.n],lv=V[this.n];let c=0;
    for(;;){let l=2*c+1;if(l>=this.n)break;const r=l+1;if(r<this.n&&K[r]<K[l])l=r;if(K[l]>=lk)break;K[c]=K[l];V[c]=V[l];c=l;}
    K[c]=lk;V[c]=lv;return top;
  }
}

// A* over the analysis grid itself: no node objects, only typed arrays stamped with a search number so nothing is cleared between searches.
class Pathfinder{
  constructor(cost){
    this.cost=cost;this.g=new Float32Array(GN);this.from=new Int32Array(GN);
    this.seen=new Uint32Array(GN);this.done=new Uint32Array(GN);this.gen=0;this.heap=new MinHeap(1<<16);
  }
  // generator: yields every couple of thousand expansions so the scheduler can hand the frame back; returns the cell path or null
  *find(src,dst){
    const gen=++this.gen,g=this.g,from=this.from,seen=this.seen,done=this.done,heap=this.heap,cost=this.cost;
    const tx=dst%GW,ty=(dst/GW)|0;let pops=0;
    heap.n=0;g[src]=0;from[src]=-1;seen[src]=gen;heap.push(src,0);
    while(heap.n){
      const k=heap.pop();if(done[k]===gen)continue;done[k]=gen;
      if(k===dst){const path=[];for(let c=dst;c>=0;c=from[c])path.push(c);return path.reverse();}
      const ki=k%GW,kj=(k/GW)|0,gk=g[k];
      for(let d=0;d<8;d++){
        const ni=ki+DX8[d],nj=kj+DY8[d];if(ni<0||nj<0||ni>=GW||nj>=GH)continue;
        const n=nj*GW+ni;if(done[n]===gen)continue;
        const ng=gk+cost.step(k,n,DIAG[d]);
        if(seen[n]!==gen||ng<g[n]){
          seen[n]=gen;g[n]=ng;from[n]=k;
          const ax=Math.abs(ni-tx),ay=Math.abs(nj-ty);
          heap.push(n,ng+(Math.max(ax,ay)+0.4142*Math.min(ax,ay))*MIN_COST);
        }
      }
      if((++pops&2047)===0)yield;
    }
    return null;
  }
}

// Cooperative scheduler: long jobs are generators, pumped for a few milliseconds at a time so the page never freezes.
const sched={
  tasks:[],timer:0,
  add(task){this.tasks.push(task);if(!this.timer)this.timer=setTimeout(()=>this.pump(),0);},
  pump(){
    this.timer=0;const end=performance.now()+10;
    while(this.tasks.length&&performance.now()<end){if(this.tasks[0].next().done)this.tasks.shift();}
    if(this.tasks.length)this.timer=setTimeout(()=>this.pump(),0);
  }
};

const segKey=(a,b)=>a<b?a*GN+b:b*GN+a;
// cell centre, nudged by a fixed per-cell offset so roads do not look gridded; towns stay exact
function cellPoint(k,exact){
  let jx=0,jy=0;if(!exact){const h=Math.imul(k,0x9E3779B1)>>>0;jx=((h&1023)/1023-0.5)*0.5;jy=((h>>>10&1023)/1023-0.5)*0.5;}
  return [(k%GW+0.5+jx)*WX/GW,(((k/GW)|0)+0.5+jy)/GH];
}
// Turn the set of used cell-to-cell segments into drawable polylines: chains between junctions, smoothed once each.
function traceNetwork(seg,cost){
  const f=cost.f,adj=new Map();
  const link=(a,b)=>{let l=adj.get(a);if(!l){l=[];adj.set(a,l);}l.push(b);};
  let maxT=0,km=0;
  for(const [sk,t] of seg){const a=Math.floor(sk/GN),b=sk-a*GN;link(a,b);link(b,a);if(t>maxT)maxT=t;km+=(Math.abs(a-b)===1||Math.abs(a-b)===GW?1:Math.SQRT2)*CELL_M/1000;}
  const isNode=k=>{
    const l=adj.get(k);if(l.length!==2||cost.city[k])return true;
    const s=f.hm[k]<0;return (f.hm[l[0]]<0)!==s||(f.hm[l[1]]<0)!==s||seg.get(segKey(k,l[0]))!==seg.get(segKey(k,l[1]));
  };
  const point=k=>cellPoint(k,cost.city[k]);
  const land=[[],[],[],[]],sea=[],used=new Set();
  for(const [k,l] of adj){
    if(!isNode(k))continue;
    for(const first of l){
      if(used.has(segKey(k,first)))continue;
      const chain=[k];let prev=k,cur=first,wet=f.hm[k]<0;
      for(;;){
        used.add(segKey(prev,cur));chain.push(cur);if(f.hm[cur]<0)wet=true;
        if(isNode(cur))break;
        const nb=adj.get(cur),next=nb[0]===prev?nb[1]:nb[0];prev=cur;cur=next;
      }
      let s=[];for(const c of chain){const p=point(c);s.push(p[0],p[1]);}
      for(let it=0;it<2&&s.length>4;it++){ // Chaikin smoothing, ends pinned
        const o=[s[0],s[1]];
        for(let q=0;q<s.length-2;q+=2)o.push(.75*s[q]+.25*s[q+2],.75*s[q+1]+.25*s[q+3],.25*s[q]+.75*s[q+2],.25*s[q+1]+.75*s[q+3]);
        o.push(s[s.length-2],s[s.length-1]);s=o;
      }
      const t=seg.get(segKey(chain[0],chain[1])),out=wet?sea:land[Math.min(3,Math.floor(Math.log2(1+15*t/maxT)))];
      out.push(s);
    }
  }
  // bridges (or sea crossings): connected stretches of water the network crosses
  let bridges=0;const seen=new Set();
  for(const k of adj.keys()){
    if(f.hm[k]>=0||seen.has(k))continue;bridges++;const st=[k];seen.add(k);
    while(st.length){const c=st.pop();for(const n of adj.get(c))if(f.hm[n]<0&&!seen.has(n)){seen.add(n);st.push(n);}}
  }
  return {land,sea,km,bridges};
}

// The network grows one route at a time, strongest trade links first. Every finished route makes its own ground
// cheaper, so later routes bend to join it: trunk roads and branches appear without being planned.
let routeGen=0;
function* routeTask(gen,onUpdate){
  const cities=W0.cities,cost=new CostField(W0.f),pf=new Pathfinder(cost),seg=new Map(),routes=[];
  for(const c of cities)cost.city[c.k]=1;
  W0.costField=cost;
  const d2=(a,b)=>(a.x-b.x)**2+(a.y-b.y)**2,want=new Map(),add=(i,j)=>want.set(i<j?i*64+j:j*64+i,i<j?[i,j]:[j,i]);
  cities.forEach((a,i)=>cities.map((b,j)=>[d2(a,b),j]).filter(e=>e[1]!==i).sort((p,q)=>p[0]-q[0]).slice(0,3).forEach(e=>add(i,e[1]))); // three nearest neighbours
  const tree=[0];
  while(tree.length<cities.length){ // plus a spanning tree, so no town is left out
    let best=null,bd=1e9;
    for(const i of tree)for(let j=0;j<cities.length;j++){if(tree.includes(j))continue;const d=d2(cities[i],cities[j]);if(d<bd){bd=d;best=[i,j];}}
    tree.push(best[1]);add(best[0],best[1]);
  }
  const pairs=[...want.values()].map(([i,j])=>({i,j,w:Math.sqrt(cities[i].pop*cities[j].pop)/1e5,pull:cities[i].pop*cities[j].pop/d2(cities[i],cities[j])})).sort((p,q)=>q.pull-p.pull);
  W0.net=null;W0.routes=routes;onUpdate(0,pairs.length,0,false);
  const lay=(path,w)=>{
    for(let q=0;q<path.length;q++){
      const k=path[q];cost.road[k]=W0.f.hm[k]<0?LANE:ROAD;
      if(q){const sk=segKey(path[q-1],k);seg.set(sk,(seg.get(sk)||0)+w);}
    }
  };
  if(isArena()){ // a ring road first, a few hundred metres in from the shore or the map edge; town roads then join it
    const pts=ringWaypoints(W0.f),w=Math.max(...pairs.map(p=>p.w))*0.7;W0.ring=[];
    for(let n=0;n<pts.length;n++){
      const path=yield* pf.find(pts[n],pts[(n+1)%pts.length]);if(gen!==routeGen)return;
      if(path){lay(path,w);W0.ring.push(path);}
    }
    if(W0.ring.length)W0.net=traceNetwork(seg,cost);
  }
  for(let n=0;n<pairs.length;n++){
    const p=pairs[n],path=yield* pf.find(cities[p.i].k,cities[p.j].k);
    if(gen!==routeGen)return;
    if(path){
      lay(path,p.w);
      routes.push({a:p.i,b:p.j,path,w:p.w});
      W0.net=traceNetwork(seg,cost);
    }
    onUpdate(n+1,pairs.length,W0.net?W0.net.km:0,n===pairs.length-1&&!isArena());
    yield;
  }
  if(isArena()){
    const t=yield* trackTask(cost,gen);if(!t)return;W0.tracks=t;
    onUpdate(pairs.length,pairs.length,W0.net?W0.net.km:0,true);
  }
}
// ring road waypoints: around the map centre, the outermost land at a set distance from the open sea or the map
// edge (lakes and rivers do not count, so the ring stays a clean loop instead of bending inland around them)
function ringWaypoints(f){
  const d=new Int16Array(GN).fill(-1),q=new Int32Array(GN);let h=0,t=0;
  for(let k=0;k<GN;k++){const i=k%GW,j=(k/GW)|0;if((f.sea?f.sea[k]:f.hm[k]<0)||i===0||j===0||i===GW-1||j===GH-1){d[k]=0;q[t++]=k;}}
  while(h<t){const k=q[h++],i=k%GW,j=(k/GW)|0;for(const n of [i>0?k-1:-1,i<GW-1?k+1:-1,j>0?k-GW:-1,j<GH-1?k+GW:-1])if(n>=0&&d[n]<0){d[n]=d[k]+1;q[t++]=n;}}
  const D=Math.round(420/CELL_M),pts=[];
  for(let a=0;a<16;a++){
    const th=a*Math.PI/8+0.2,dx=Math.cos(th),dy=Math.sin(th);let best=-1;
    for(let s=0;s<GW*0.72;s++){
      const i=Math.round(GW/2+dx*s),j=Math.round(GH/2+dy*s);if(i<0||j<0||i>=GW||j>=GH)break;
      const k=j*GW+i;if(f.hm[k]>=0&&d[k]>=D&&d[k]<=D+5)best=k;
    }
    if(best>=0)pts.push(best);
  }
  return pts;
}
// dirt tracks: one Dijkstra outward from every road cell over dry land; each farmstead (and a scatter of points in
// open country) follows the cheapest way back, joining the first track it meets, so the tracks branch like real ones
function* trackTask(cost,gen){
  const f=cost.f,dist=new Float32Array(GN).fill(1e9),from=new Int32Array(GN).fill(-1),done=new Uint8Array(GN),heap=new MinHeap(1<<16);
  for(let k=0;k<GN;k++)if(cost.road[k]<1&&f.hm[k]>=0){dist[k]=0;heap.push(k,0);}
  let pops=0;
  while(heap.n){
    const k=heap.pop();if(done[k])continue;done[k]=1;const ki=k%GW,kj=(k/GW)|0;
    for(let dd=0;dd<8;dd++){
      const ni=ki+DX8[dd],nj=kj+DY8[dd];if(ni<0||nj<0||ni>=GW||nj>=GH)continue;const n=nj*GW+ni;
      if(done[n]||f.hm[n]<0)continue;const c=dist[k]+cost.step(k,n,DIAG[dd]);
      if(c<dist[n]){dist[n]=c;from[n]=k;heap.push(n,c);}
    }
    if((++pops&8191)===0){yield;if(gen!==routeGen)return null;}
  }
  const ends=W0.farms.slice(),rr=mulberry32(seedHash(P.seed)^0x6a09e667),extra=Math.round(P.km*P.km*0.6);
  for(let n=0,tries=0;n<extra&&tries<extra*20;tries++){const k=Math.floor(rr()*GN);if(f.hm[k]>=8&&dist[k]<1e9){ends.push(k);n++;}}
  const used=new Uint8Array(GN),out=[];
  for(const k0 of ends){
    if(dist[k0]>=1e9||used[k0])continue;
    const path=[];let k=k0;
    while(k>=0){path.push(k);if(dist[k]===0||used[k])break;used[k]=1;k=from[k];}
    if(path.length>3)out.push(smoothPath(path,cost.city));
  }
  return out;
}
// bilinear sample of the per-cell cost picture at a world position
function costAt(wx,wy){
  const c=W0.cost,gx=Math.min(GW-1.001,Math.max(0,wx/2*GW-0.5)),gy=Math.min(GH-1.001,Math.max(0,wy*GH-0.5)),i=gx|0,j=gy|0,fx=gx-i,fy=gy-j,k=j*GW+i;
  return (c[k]*(1-fx)+c[k+1]*fx)*(1-fy)+(c[k+GW]*(1-fx)+c[k+GW+1]*fx)*fy;
}
/* ---------------- end routes ---------------- */

