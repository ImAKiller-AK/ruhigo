/* ---------------- Minecraft export (Bedrock) ---------------- */
// Builds a Bedrock world as a zip: level.dat plus a LevelDB whose single write-ahead log carries every chunk.
// Minecraft replays that log the first time it opens the world, exactly as it would after an unclean exit.
const MCX=(()=>{
  const SEA=62,NONE=-32768,BLOCK_VER=17959425; // block names follow Bedrock 1.18.10; newer games upgrade them on load
  const enc=new TextEncoder();
  const BL=[
    ["air",{}],["stone",{stone_type:"stone"}],["deepslate",{pillar_axis:"y"}],["bedrock",{infiniburn_bit:false}],
    ["dirt",{dirt_type:"normal"}],["grass",{}],["sand",{sand_type:"normal"}],["sandstone",{sand_stone_type:"default"}],
    ["gravel",{}],["water",{liquid_depth:0}],["snow",{}],["ice",{}],["packed_ice",{}],["snow_layer",{covered_bit:false,height:0}],
    ["log",{old_log_type:"oak",pillar_axis:"y"}],["leaves",{old_leaf_type:"oak",persistent_bit:true,update_bit:false}],
    ["log",{old_log_type:"spruce",pillar_axis:"y"}],["leaves",{old_leaf_type:"spruce",persistent_bit:true,update_bit:false}],
    ["log",{old_log_type:"birch",pillar_axis:"y"}],["leaves",{old_leaf_type:"birch",persistent_bit:true,update_bit:false}],
    ["log",{old_log_type:"jungle",pillar_axis:"y"}],["leaves",{old_leaf_type:"jungle",persistent_bit:true,update_bit:false}],
    ["log2",{new_log_type:"acacia",pillar_axis:"y"}],["leaves2",{new_leaf_type:"acacia",persistent_bit:true,update_bit:false}],
    ["cactus",{age:0}],["deadbush",{}],["tallgrass",{tall_grass_type:"tall"}],["podzol",{}],["dirt",{dirt_type:"coarse"}],
    ["planks",{wood_type:"oak"}],["cobblestone",{}],["stonebrick",{stone_brick_type:"default"}],["glowstone",{}],["glass",{}]
  ];
  // Worldsmith biome index -> Bedrock biome id (deep ocean, ocean, frozen ocean, snowy plains, taiga, plains, forest, old-growth taiga, desert, savanna, sparse jungle, jungle, beach, windswept hills)
  const BIOME_ID=[24,0,0,46,12,12,5,1,1,4,32,2,35,23,21,16,3,12],RIVER_ID=7;
  const TREE_P=[0,0,0,0,0,0.002,0.06,0,0.002,0.07,0.1,0,0.008,0.035,0.11,0,0,0];
  const TREES=[null,[14,15,4,3],[16,17,6,5],[18,19,5,3],[20,21,7,5],[22,23,5,2]]; // log, leaves, min trunk, trunk range

  class Buf{
    constructor(n){this.a=new Uint8Array(n||256);this.n=0;}
    need(k){if(this.n+k>this.a.length){const b=new Uint8Array(Math.max(this.a.length*2,this.n+k));b.set(this.a.subarray(0,this.n));this.a=b;}}
    u8(v){this.need(1);this.a[this.n++]=v;return this;}
    u16(v){this.need(2);this.a[this.n++]=v&255;this.a[this.n++]=v>>>8&255;return this;}
    i32(v){this.need(4);const a=this.a;a[this.n++]=v&255;a[this.n++]=v>>>8&255;a[this.n++]=v>>>16&255;a[this.n++]=v>>>24&255;return this;}
    i64(v){v=BigInt(v);return this.i32(Number(BigInt.asUintN(32,v))).i32(Number(BigInt.asUintN(32,v>>32n)));}
    f32(v){this.need(4);new DataView(this.a.buffer).setFloat32(this.n,v,true);this.n+=4;return this;}
    bytes(b,len){len=len===undefined?b.length:len;this.need(len);this.a.set(len===b.length?b:b.subarray(0,len),this.n);this.n+=len;return this;}
    str(s){const e=enc.encode(s);return this.u16(e.length).bytes(e);}
    varint(v){while(v>=128){this.u8(v%128+128);v=Math.floor(v/128);}return this.u8(v);}
    out(){return this.a.slice(0,this.n);}
  }
  class F32{constructor(v){this.v=v;}}
  // little-endian NBT, the flavour Bedrock stores on disk
  function nbt(b,name,v){
    if(typeof v==="boolean")b.u8(1).str(name).u8(v?1:0);
    else if(typeof v==="number")b.u8(3).str(name).i32(v);
    else if(typeof v==="bigint")b.u8(4).str(name).i64(v);
    else if(typeof v==="string")b.u8(8).str(name).str(v);
    else if(v instanceof F32)b.u8(5).str(name).f32(v.v);
    else if(Array.isArray(v)){b.u8(9).str(name).u8(3).i32(v.length);for(const x of v)b.i32(x);}
    else{b.u8(10).str(name);for(const k in v)nbt(b,k,v[k]);b.u8(0);}
  }
  const BNBT=BL.map(([n,s])=>{const b=new Buf(128);nbt(b,"",{name:"minecraft:"+n,states:s,version:BLOCK_VER});return b.out();});

  function table(poly){const t=new Uint32Array(256);for(let i=0;i<256;i++){let c=i;for(let k=0;k<8;k++)c=c&1?(c>>>1)^poly:c>>>1;t[i]=c>>>0;}return t;}
  const T32=table(0xEDB88320),T32C=table(0x82F63B78);
  function crc(t,c,a,s,e){c=~c;for(let i=s;i<e;i++)c=t[(c^a[i])&255]^(c>>>8);return ~c>>>0;}

  // LevelDB log file: 32 KiB blocks of [masked crc32c, length, type] records
  class LogW{
    constructor(){this.buf=new Uint8Array(1<<20);this.n=0;this.pos=0;this.done=[];}
    room(k){if(this.n+k>this.buf.length){this.done.push(this.buf.slice(0,this.n));this.n=0;}}
    rec(p,len){
      let off=0,first=true;
      do{
        let left=32768-this.pos%32768;
        if(left<7){this.room(left);this.buf.fill(0,this.n,this.n+left);this.n+=left;this.pos+=left;left=32768;}
        const frag=Math.min(left-7,len-off),last=off+frag===len,type=first?(last?1:2):(last?4:3);
        this.room(7+frag);
        const b=this.buf,n=this.n;
        b[n+6]=type;b.set(p.subarray(off,off+frag),n+7);
        let c=crc(T32C,0,b,n+6,n+7+frag);c=(((c>>>15)|(c<<17))+0xa282ead8)>>>0;
        b[n]=c&255;b[n+1]=c>>>8&255;b[n+2]=c>>>16&255;b[n+3]=c>>>24&255;b[n+4]=frag&255;b[n+5]=frag>>>8;
        this.n+=7+frag;this.pos+=7+frag;off+=frag;first=false;
      }while(off<len);
    }
    take(end){if(end&&this.n){this.done.push(this.buf.slice(0,this.n));this.n=0;}return this.done.splice(0);}
  }

  // zip entry sink: deflates as the data arrives so the raw world never has to sit in memory
  async function makeSink(){
    let c=0,usize=0;const parts=[];
    let cs=null;try{if(typeof CompressionStream==="function")cs=new CompressionStream("deflate-raw");}catch(e){cs=null;}
    if(cs){
      const w=cs.writable.getWriter(),r=cs.readable.getReader();
      const pump=(async()=>{for(;;){const {done,value}=await r.read();if(done)break;parts.push(value);}})();
      return {async write(u){c=crc(T32,c,u,0,u.length);usize+=u.length;await w.write(u);},
        async close(){await w.close();await pump;return {parts,crc:c,usize,method:8};},
        async abort(){try{await w.abort();}catch(e){}}};
    }
    return {async write(u){c=crc(T32,c,u,0,u.length);usize+=u.length;parts.push(u);},
      async close(){return {parts,crc:c,usize,method:0};},async abort(){}};
  }
  const stored=(name,u)=>({name,parts:[u],crc:crc(T32,0,u,0,u.length),usize:u.length,method:0});
  function zip(entries){
    const out=[],cd=[];let off=0;
    for(const e of entries){
      const nm=enc.encode(e.name);let cs=0;for(const p of e.parts)cs+=p.length;
      out.push(new Buf(30+nm.length).i32(0x04034b50).u16(20).u16(0).u16(e.method).u16(0).u16(0x21).i32(e.crc).i32(cs).i32(e.usize).u16(nm.length).u16(0).bytes(nm).out(),...e.parts);
      cd.push(new Buf(46+nm.length).i32(0x02014b50).u16(20).u16(20).u16(0).u16(e.method).u16(0).u16(0x21).i32(e.crc).i32(cs).i32(e.usize).u16(nm.length).u16(0).u16(0).u16(0).u16(0).i32(0).i32(off).bytes(nm).out());
      off+=30+nm.length+cs;
    }
    let cdSize=0;for(const c of cd)cdSize+=c.length;
    const end=new Buf(22).i32(0x06054b50).u16(0).u16(0).u16(cd.length).u16(cd.length).i32(cdSize).i32(off).u16(0).out();
    return new Blob([...out,...cd,end],{type:"application/zip"});
  }

  // o: {W,H (blocks, multiples of 32), x0,y0,span (world rectangle; span is its width), name, progress(f,msg), cancelled()}
  async function build(o){
    const W=o.W,H=o.H,U=o.span/W,nCol=W*H,CW=W>>4,CH=H>>4,hs=seedHash(P.seed);
    const oct=Math.max(3,Math.min(18,Math.round(Math.log2(1/(U*noiseScale())))-1)); // finest detail about four blocks wide
    const rnd=(i,j,s)=>{let h=Math.imul(i,374761393)^Math.imul(j,668265263)^Math.imul((s+hs)|0,1274126177);h=Math.imul(h^h>>>13,2246822519);h^=h>>>16;return (h>>>0)/4294967296;};
    let last=performance.now();
    const step=async(f,msg)=>{const n=performance.now();if(n-last<50)return;o.progress(f,msg);await new Promise(r=>setTimeout(r,0));last=performance.now();if(o.cancelled())throw {code:"cancelled"};};

    // 1. survey: one height and biome per column. Heights first go through a fixed curve (g), then get one
    // vertical scale K for the whole export, chosen so slopes stay walkable whether a block spans 5 m or 40 km.
    const surf=new Int16Array(nCol),bio=new Uint8Array(nCol),inland=new Uint8Array(nCol),g=new Float32Array(nCol);
    for(let j=0;j<H;j++){
      const wy=o.y0+(j+0.5)*U;
      for(let i=0;i<W;i++){
        const k=j*W+i,wx=o.x0+(i+0.5)*U;let h=-6200,b=0;
        if(wx>=0&&wx<=WX&&wy>=0&&wy<=1){h=meters(elev(wx,wy,oct));climate(wx,wy,h,oct);b=biome(h,cT,cR);}
        g[k]=h<0?-0.001-90*Math.pow(Math.min(1,-h/6200),0.7):250*Math.pow(Math.min(1,h/8920),0.62);
        bio[k]=b;if(b===15)inland[k]=biome(11,cT,cR); // what a low coastal plain becomes away from the water
      }
      await step(0.32*j/H,"Surveying terrain");
    }
    let sum=0,pairs=0,gLo=1e9,gHi=0,sea=false;
    for(let j=0;j<H;j++)for(let i=0;i<W;i++){
      const k=j*W+i,v=g[k];if(v<0){sea=true;continue;}
      if(v<gLo)gLo=v;if(v>gHi)gHi=v;
      if(i<W-1&&g[k+1]>=0){sum+=Math.abs(v-g[k+1]);pairs++;}
      if(j<H-1&&g[k+W]>=0){sum+=Math.abs(v-g[k+W]);pairs++;}
    }
    let K=pairs&&sum>0?Math.max(0.1,Math.min(3,0.5*pairs/sum)):1;
    const g0=sea||!pairs?0:Math.max(0,gLo-8/K);
    if(pairs)K=Math.min(K,236/Math.max(1,gHi-g0));
    const Ko=Math.max(0.35,Math.min(1,K));
    // distance to the shoreline (3-4 chamfer), so land ramps up from the beach and the sea bed drops away gradually
    const dist=new Uint16Array(nCol).fill(60000);
    if(sea&&pairs){
      const relax=(k,i,j,di,dj,c)=>{const ni=i+di,nj=j+dj;if(ni<0||nj<0||ni>=W||nj>=H)return;const n=nj*W+ni,d=((g[n]<0)!==(g[k]<0))?3:dist[n]+c;if(d<dist[k])dist[k]=d;};
      for(let j=0;j<H;j++)for(let i=0;i<W;i++){const k=j*W+i;relax(k,i,j,-1,0,3);relax(k,i,j,0,-1,3);relax(k,i,j,-1,-1,4);relax(k,i,j,1,-1,4);relax(k,i,j,1,0,60000);relax(k,i,j,0,1,60000);}
      for(let j=H-1;j>=0;j--)for(let i=W-1;i>=0;i--){const k=j*W+i;relax(k,i,j,1,0,3);relax(k,i,j,0,1,3);relax(k,i,j,1,1,4);relax(k,i,j,-1,1,4);}
    }
    for(let k=0;k<nCol;k++){
      const cap=dist[k]>=60000?1e9:Math.floor((dist[k]/3-1)*1.5);
      if(g[k]<0)surf[k]=SEA-1-Math.min(cap,Math.round(-g[k]*Ko));
      else{
        const up=Math.min(cap,Math.round((g[k]-g0)*K));surf[k]=SEA+1+up;
        if(up<=1&&dist[k]<=6&&bio[k]>=6&&bio[k]<=14)bio[k]=15; // beach
        else if(bio[k]===15&&dist[k]>36)bio[k]=inland[k]; // sand only within a dozen blocks of the sea
      }
    }

    // 2. rivers: rasterise the drainage network, then set each channel's water level to its lowest bank
    const wat=new Int16Array(nCol).fill(NONE);
    if(W0){
      const riv=new Uint8Array(nCol),widths=[0.8,1.1,1.5,2,2.6,3.3],zf=Math.pow(Math.max(1,WX/o.span),0.42);
      for(let b=0;b<6;b++){
        const a=W0.buckets[b],wb=Math.max(1,Math.min(7,Math.round(Math.min(14,widths[b]*zf)*W/1100))),r=(wb-1)/2,rr=r*r+0.3,ri=Math.ceil(r);
        for(let q=0;q<a.length;q+=4){
          const x1=(a[q]-o.x0)/U,z1=(a[q+1]-o.y0)/U,x2=(a[q+2]-o.x0)/U,z2=(a[q+3]-o.y0)/U;
          if((x1<-8&&x2<-8)||(x1>W+8&&x2>W+8)||(z1<-8&&z2<-8)||(z1>H+8&&z2>H+8))continue;
          const n=Math.max(1,Math.ceil(Math.hypot(x2-x1,z2-z1)*2));
          for(let s=0;s<=n;s++){
            const fx=x1+(x2-x1)*s/n,fz=z1+(z2-z1)*s/n;
            if(fx<-8||fx>W+8||fz<-8||fz>H+8)continue;
            const ci=Math.floor(fx),cj=Math.floor(fz);
            for(let dz=-ri;dz<=ri;dz++)for(let dx=-ri;dx<=ri;dx++){
              if(dx*dx+dz*dz>rr)continue;const i=ci+dx,j=cj+dz;if(i<0||j<0||i>=W||j>=H)continue;
              const k=j*W+i;if(surf[k]>SEA)riv[k]=1;
            }
          }
        }
        await step(0.34+0.02*b/6,"Tracing rivers");
      }
      for(let j=0;j<H;j++)for(let i=0;i<W;i++){
        const k=j*W+i;if(!riv[k])continue;let L=surf[k];
        for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const ni=i+dx,nj=j+dz;if(ni<0||nj<0||ni>=W||nj>=H)continue;const s=surf[nj*W+ni];L=Math.min(L,s>SEA?s:SEA);}
        wat[k]=L;
      }
    }
    const lowest=(i,j,s)=>{let m=s;if(i>0)m=Math.min(m,surf[j*W+i-1]);if(i<W-1)m=Math.min(m,surf[j*W+i+1]);if(j>0)m=Math.min(m,surf[(j-1)*W+i]);if(j<H-1)m=Math.min(m,surf[(j+1)*W+i]);return m;};

    // 3. settlements: a keep for the capital and a few huts for each town, on level ground near the surveyed site
    const clear=new Uint8Array(nCol),extras=new Map(),towns=[];
    const put=(i,y,j,id)=>{if(i<0||j<0||i>=W||j>=H||y<-63||y>318)return;const c=(j>>4)*CW+(i>>4);let a=extras.get(c);if(!a){a=[];extras.set(c,a);}a.push(i&15,y,j&15,id);};
    const siteOk=(ci,cj,r,tol)=>{
      if(ci-r-1<0||cj-r-1<0||ci+r+1>=W||cj+r+1>=H)return false;
      let lo=1e9,hi=-1e9;
      for(let dz=-r-1;dz<=r+1;dz++)for(let dx=-r-1;dx<=r+1;dx++){
        const k=(cj+dz)*W+ci+dx;if(clear[k])return false;
        if(Math.abs(dx)<=r&&Math.abs(dz)<=r){const s=surf[k];if(s<=SEA||wat[k]!==NONE)return false;if(s<lo)lo=s;if(s>hi)hi=s;}
      }
      return hi-lo<=tol;
    };
    const findSite=(ci,cj,r,tol,maxR)=>{
      for(let d=0;d<=maxR;d++)for(let dz=-d;dz<=d;dz++)for(let dx=-d;dx<=d;dx++){
        if(Math.max(Math.abs(dx),Math.abs(dz))!==d)continue;if(siteOk(ci+dx,cj+dz,r,tol))return [ci+dx,cj+dz];
      }
      return null;
    };
    const raise=(ci,cj,r,tower)=>{
      const f=surf[cj*W+ci],wallTop=tower?f+9:f+3,wall=tower?31:29;
      for(let dz=-r-1;dz<=r+1;dz++)for(let dx=-r-1;dx<=r+1;dx++){
        const i=ci+dx,j=cj+dz,k=j*W+i,g=surf[k],ax=Math.abs(dx),az=Math.abs(dz);clear[k]=1;
        if(ax>r||az>r){for(let y=f+1;y<=g+1;y++)put(i,y,j,0);continue;}
        for(let y=g+1;y<f;y++)put(i,y,j,30);
        put(i,f,j,30);
        const edge=ax===r||az===r,corner=ax===r&&az===r;
        for(let y=f+1;y<=wallTop;y++){
          let id=0;
          if(edge){
            id=corner?(tower?31:14):wall;
            if(dz===r&&dx===0&&y<=f+2)id=0;
            else if(!corner&&(dx===0||dz===0)&&(tower?(y===f+5||y===f+6):y===f+2))id=33;
          }
          put(i,y,j,id);
        }
        if(tower){put(i,f+10,j,dx===0&&dz===0?32:31);put(i,f+11,j,edge&&((dx+dz)&1)===0?31:0);}
        else{put(i,f+4,j,dx===0&&dz===0?32:29);put(i,f+5,j,ax<=1&&az<=1?29:0);}
        for(let y=tower?f+12:f+6;y<=g+1;y++)put(i,y,j,0);
      }
    };
    const RING=[[9,1],[-9,-1],[1,-9],[8,8],[-8,8],[8,-8],[-8,-8],[-1,10]];
    let spawn=null;
    if(W0)for(const c of W0.cities){
      const ci=Math.floor((c.x-o.x0)/U),cj=Math.floor((c.y-o.y0)/U);
      if(ci<28||cj<28||ci>=W-28||cj>=H-28)continue;
      let centre=null,r=2;
      if(c.cap){centre=findSite(ci,cj,3,6,24);if(centre){r=3;raise(centre[0],centre[1],3,true);}}
      if(!centre){centre=findSite(ci,cj,2,5,24);if(!centre)continue;raise(centre[0],centre[1],2,false);}
      const want=c.cap?6:Math.max(2,Math.min(5,2+Math.round(Math.log10(Math.max(1,c.pop/2e4))*2)));let made=1;
      for(const [dx,dz] of RING){if(made>=want)break;const s=findSite(centre[0]+dx,centre[1]+dz,2,5,3);if(s){raise(s[0],s[1],2,false);made++;}}
      towns.push({name:c.name,cap:c.cap,x:centre[0]-W/2,z:centre[1]-H/2,y:surf[centre[1]*W+centre[0]]+1});
      if(!spawn||c.cap)spawn=[centre[0],Math.min(H-1,centre[1]+r+2)];
    }
    if(!spawn){
      let best=1e18;spawn=[W>>1,H>>1];
      for(let j=8;j<H-8;j+=4)for(let i=8;i<W-8;i+=4){if(surf[j*W+i]<=SEA)continue;const d=(i-W/2)**2+(j-H/2)**2;if(d<best){best=d;spawn=[i,j];}}
    }
    const spawnY=Math.max(SEA,surf[spawn[1]*W+spawn[0]])+2;

    const treeKind=(i,j)=>{
      if(i<0||j<0||i>=W||j>=H)return 0;
      const k=j*W+i,s=surf[k],b=bio[k],p=TREE_P[b];
      if(!p||s<=SEA||s>292||wat[k]!==NONE||clear[k]||rnd(i,j,1)>=p||s-lowest(i,j,s)>=4)return 0;
      if(b===5||b===6||b===10)return 2;
      if(b===9)return rnd(i,j,5)<0.2?3:1;
      if(b===12)return 5;
      if(b===13)return rnd(i,j,5)<0.5?1:4;
      return b===14?4:1;
    };

    // 4. chunks: fill 16x16x384 columns, plant, build, then encode sub-chunks into one write batch per chunk
    const B=new Uint8Array(256*384),idx=new Uint8Array(4096),map=new Int8Array(BL.length),hm=new Int16Array(256);
    const sink=await makeSink(),log=new LogW(),batch=new Buf(1<<17),val=new Buf(1<<15);
    let seq=1,count=0,cx=0,cz=0,ci0=0,cj0=0;
    const key=(tag,sub)=>{batch.u8(1).varint(sub===undefined?9:10).i32(cx-(CW>>1)).i32(cz-(CH>>1)).u8(tag);if(sub!==undefined)batch.u8(sub);};
    const flushVal=()=>{batch.varint(val.n).bytes(val.a,val.n);val.n=0;count++;};
    const S=(i,y,j,id,soft)=>{const lx=i-ci0,lz=j-cj0;if(lx<0||lx>15||lz<0||lz>15||y>318)return;const p=(lx*16+lz)*384+64+y;if(soft&&B[p]!==0)return;B[p]=id;};
    const stampTree=(kind,i,j)=>{
      const T=TREES[kind],lg=T[0],lf=T[1],h=T[2]+Math.floor(rnd(i,j,2)*T[3]),y0=surf[j*W+i]+1;
      const disc=(y,r,trim)=>{for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){
        const ax=Math.abs(dx),az=Math.abs(dz);
        if(ax===r&&az===r&&r>0&&(trim===1||(trim===2&&rnd(i+dx,j+dz,y)<0.5)))continue;
        S(i+dx,y,j+dz,lf,true);}};
      if(kind===2){
        const top=y0+h;disc(top,0,0);disc(top-1,1,1);
        for(let y=top-2;y>=y0+2;y--)disc(y,(top-y)%2===0?2:1,1);
        for(let y=y0;y<top;y++)S(i,y,j,lg,false);
      }else if(kind===5){
        const ty=y0+h-1;disc(ty,2,1);disc(ty+1,1,0);
        for(let y=y0;y<=ty;y++)S(i,y,j,lg,false);
      }else{
        const ty=y0+h-1;disc(ty-2,2,2);disc(ty-1,2,2);disc(ty,1,2);disc(ty+1,1,1);
        for(let y=y0;y<=ty;y++)S(i,y,j,lg,false);
      }
    };
    try{
      for(cz=0;cz<CH;cz++)for(cx=0;cx<CW;cx++){
        ci0=cx<<4;cj0=cz<<4;B.fill(0);
        for(let x=0;x<16;x++)for(let z=0;z<16;z++){
          const i=ci0+x,j=cj0+z,k=j*W+i,s=surf[k],b=bio[k],q=(x*16+z)*384+64;
          B[q-64]=3;
          for(let y=-63,e=Math.min(s,-1);y<=e;y++)B[q+y]=2;
          for(let y=0;y<=s;y++)B[q+y]=1;
          if(s<SEA){
            const fb=s>=SEA-10?6:8;B[q+s]=fb;B[q+s-1]=fb;
            for(let y=s+1;y<=SEA;y++)B[q+y]=9;
            if(b===3)B[q+SEA]=11;
            continue;
          }
          const L=wat[k];
          if(L!==NONE){for(let y=L+1;y<=s;y++)B[q+y]=0;B[q+L]=9;B[q+L-1]=8;B[q+L-2]=8;continue;}
          const r1=rnd(i,j,3),r2=rnd(i,j,4),steep=s-lowest(i,j,s)>=4;
          let top=5,under=4,nu=3,deep=0,plant=0;
          switch(b){
            case 4:case 17:top=10;under=12;B[q+s-1]=10;B[q+s-2]=12;B[q+s-3]=12;B[q+s-4]=12;nu=0;break;
            case 16:top=r1<0.25?8:1;under=1;nu=0;if(r1>0.8)plant=13;break;
            case 11:top=6;under=6;deep=7;if(r2<0.004)plant=24;else if(r2<0.012)plant=25;break;
            case 15:top=6;under=6;nu=2;deep=7;break;
            case 5:if(r1<0.75)plant=13;break;
            case 6:if(r1<0.2)top=27;if(r2<0.05)plant=26;break;
            case 7:if(r1<0.25)top=28;if(r2<0.08)plant=26;break;
            case 8:if(r2<0.22)plant=26;break;
            case 9:if(r2<0.1)plant=26;break;
            case 10:if(r1<0.4)top=27;if(r2<0.12)plant=26;break;
            case 12:if(r1<0.1)top=28;if(r2<0.28)plant=26;break;
            case 13:if(r2<0.15)plant=26;break;
            case 14:if(r1<0.15)top=27;if(r2<0.15)plant=26;break;
          }
          if(steep&&top!==10&&top!==6){top=1;nu=0;deep=0;plant=0;}
          B[q+s]=top;
          for(let n=1;n<=nu;n++)B[q+s-n]=under;
          if(deep)for(let n=nu+1;n<=nu+3;n++)B[q+s-n]=deep;
          if(plant&&!clear[k]&&!treeKind(i,j)){
            if(plant===24){for(let n=1,e=1+Math.floor(r1*3);n<=e;n++)B[q+s+n]=24;}
            else B[q+s+1]=plant;
          }
        }
        for(let j=cj0-2;j<cj0+18;j++)for(let i=ci0-2;i<ci0+18;i++){const t=treeKind(i,j);if(t)stampTree(t,i,j);}
        const ex=extras.get(cz*CW+cx);
        if(ex)for(let n=0;n<ex.length;n+=4)B[(ex[n]*16+ex[n+2])*384+64+ex[n+1]]=ex[n+3];

        batch.n=0;batch.i64(seq).i32(0);count=0;
        key(0x2C);val.u8(40);flushVal();
        // Data3D: height map, then one biome palette for the bottom sub-chunk that the 24 above it copy
        let maxTop=0;
        for(let x=0;x<16;x++)for(let z=0;z<16;z++){const q=(x*16+z)*384;let y=383;while(y>=0&&B[q+y]===0)y--;hm[z*16+x]=y+1;if(y+1>maxTop)maxTop=y+1;}
        key(0x2B);for(let n=0;n<256;n++)val.u16(hm[n]);
        {
          const ids=[];let bits=0;
          for(let x=0;x<16;x++)for(let z=0;z<16;z++){const k=(cj0+z)*W+ci0+x,id=wat[k]!==NONE?RIVER_ID:BIOME_ID[bio[k]];let m=ids.indexOf(id);if(m<0){m=ids.length;ids.push(id);}idx[x*16+z]=m;}
          if(ids.length===1)val.u8(1).i32(ids[0]);
          else{
            bits=ids.length<=2?1:ids.length<=4?2:ids.length<=8?3:ids.length<=16?4:5;
            val.u8(bits<<1|1);const per=(32/bits)|0,nw=Math.ceil(4096/per);
            for(let w=0;w<nw;w++){let v=0;for(let n=0;n<per;n++){const p=w*per+n;if(p<4096)v|=idx[p>>4]<<(n*bits);}val.i32(v);}
            val.i32(ids.length);for(const id of ids)val.i32(id);
          }
          for(let n=0;n<24;n++)val.u8(0xFF);
        }
        flushVal();
        for(let s=0,ns=Math.ceil(maxTop/16);s<ns;s++){
          map.fill(-1);let np=0;const pal=[];
          for(let p=0;p<4096;p++){const id=B[(p>>4)*384+s*16+(p&15)];let m=map[id];if(m<0){m=map[id]=np++;pal.push(id);}idx[p]=m;}
          if(np===1&&pal[0]===0)continue;
          const bits=np<=2?1:np<=4?2:np<=8?3:np<=16?4:np<=32?5:6,per=(32/bits)|0,nw=Math.ceil(4096/per);
          key(0x2F,s-4);val.u8(9).u8(1).u8(s-4).u8(bits<<1);
          if(np===1){val.need(nw*4);val.a.fill(0,val.n,val.n+nw*4);val.n+=nw*4;}
          else for(let w=0;w<nw;w++){let v=0;const p0=w*per;for(let n=0;n<per&&p0+n<4096;n++)v|=idx[p0+n]<<(n*bits);val.i32(v);}
          val.i32(np);for(const id of pal)val.bytes(BNBT[id]);
          flushVal();
        }
        key(0x36);val.i32(2);flushVal();
        const a=batch.a;a[8]=count&255;a[9]=count>>>8&255;a[10]=count>>>16&255;a[11]=count>>>24&255;seq+=count;
        log.rec(batch.a,batch.n);
        for(const part of log.take())await sink.write(part);
        await step(0.37+0.6*(cz*CW+cx)/(CW*CH),"Laying blocks");
      }
      for(const part of log.take(true))await sink.write(part);
    }catch(e){await sink.abort();throw e;}
    o.progress(0.98,"Packing the world");
    const logEntry=await sink.close();logEntry.name="db/000003.log";

    const cmp=enc.encode("leveldb.BytewiseComparator"),mw=new LogW();
    const edit=new Buf(64).varint(1).varint(cmp.length).bytes(cmp).varint(2).varint(3).varint(9).varint(0).varint(3).varint(4).varint(4).varint(0);
    mw.rec(edit.a,edit.n);
    const ver=[1,20,10,0,0],lvl=new Buf(1024);
    nbt(lvl,"",{
      BiomeOverride:"",Difficulty:2,ForceGameType:false,GameType:1,Generator:1,InventoryVersion:"1.20.10",
      LastPlayed:BigInt(Math.floor(Date.now()/1000)),LevelName:o.name,MinimumCompatibleClientVersion:ver,MultiplayerGame:true,
      NetherScale:8,NetworkVersion:594,Platform:2,RandomSeed:BigInt(hs),SpawnX:spawn[0]-W/2,SpawnY:spawnY,SpawnZ:spawn[1]-H/2,
      StorageVersion:10,Time:1000n,WorldVersion:1,commandsEnabled:true,currentTick:0n,hasBeenLoadedInCreative:true,
      lastOpenedWithVersion:ver,lightningLevel:new F32(0),lightningTime:100000,rainLevel:new F32(0),rainTime:100000,spawnMobs:true
    });
    const dat=new Buf(lvl.n+8).i32(10).i32(lvl.n).bytes(lvl.a,lvl.n).out();
    const blob=zip([stored("level.dat",dat),stored("levelname.txt",enc.encode(o.name)),stored("db/CURRENT",enc.encode("MANIFEST-000002\n")),
      stored("db/MANIFEST-000002",mw.take(true)[0]),logEntry]);
    return {blob,chunks:CW*CH,raw:logEntry.usize,K,towns,spawn:[spawn[0]-W/2,spawnY,spawn[1]-H/2]};
  }
  return {build};
})();
/* ---------------- end Minecraft export ---------------- */

