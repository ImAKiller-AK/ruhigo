/* ---------------- World model ---------------- */
// Two kinds of map share one model:
//   "world"  a planet: x in [0,2], y in [0,1] (equirectangular), 2 units = 40,000 km
//   "arena"  a square battle map P.km kilometres across: x and y in [0,1], with towns, compounds, roads and bridges
// WX is the map width in world units and MPU the metres in one world unit; setKind() sets both.
const P={seed:"",sea:0.04,scale:1.8,rough:0.5,temp:0,kind:"world",km:8,theme:"temperate",layout:"island"};
let N=null,worldRev=0,WX=2,MPU=2e7; // worldRev changes whenever the terrain does, so a running export can tell
const isArena=()=>P.kind==="arena";
const noiseScale=()=>isArena()?0.42*P.km:P.scale; // base noise frequency: decides how many octaves a view needs
function elev(x,y,oct){return isArena()?elevArena(x,y,oct):elevWorld(x,y,oct);}
function meters(e){return isArena()?metersArena(e):metersWorld(e);}
function climate(x,y,h,oct){if(isArena())climateArena(x,y,h,oct);else climateWorld(x,y,h,oct);}
function elevWorld(x,y,oct){
  const S=P.scale;
  const wx=fbm(N.w1,x*S*1.1,y*S*1.1,3,0.5),wy=fbm(N.w2,x*S*1.1+7.1,y*S*1.1+3.7,3,0.5);
  const px=x*S+wx*0.4,py=y*S+wy*0.4,rx=x*S,ry=y*S,g=P.rough;
  // large shapes use warped coordinates; fine octaves use plain ones so close-ups stay crisp
  let s=0,a=1,f=1,t=0;
  for(let i=0;i<oct;i++){const X=i<4?px:rx,Y=i<4?py:ry;s+=a*N.e(X*f+i*19.19,Y*f-i*7.73);t+=a;a*=g;f*=2.02;}
  let e=(s/t)*1.2+N.c(x*S*0.35,y*S*0.35)*0.4;
  const sl=P.sea;
  if(e>sl)e=sl+0.32*Math.tanh((e-sl)/0.32); // keep continental interiors as lowlands and plateaus
  const m=smooth(0.2,0.65,N.k(x*S*0.6+3.3,y*S*0.6));
  if(m>0){
    let r=0;a=1;f=1.7;t=0;const ro=oct<10?oct:10;
    for(let i=0;i<ro;i++){const X=i<3?px:rx,Y=i<3?py:ry;let v=1-Math.abs(N.r(X*f+i*3.1,Y*f-i*1.7));v*=v;r+=v*a;t+=a;a*=0.5;f*=2.1;}
    e+=m*(r/t)*0.36*smooth(0,0.15,e-sl);
  }
  const d=Math.min(x,2-x,y*1.4,(1-y)*1.4);
  e-=(1-smooth(0,0.16,d))*0.8;
  return e;
}
function metersWorld(e){const s=P.sea;if(e>=s){const x=Math.min(1,(e-s)/0.66);return Math.pow(x,2.6)*8400+x*520;}return -Math.pow(Math.min(1,(s-e)/0.55),0.8)*6200;}
let cT=0,cR=0;
function climateWorld(x,y,h,oct){
  const lat=Math.abs(y-0.5)*2,mo=Math.max(4,Math.min(9,(oct||8)-3));
  cT=28-60*Math.pow(lat,1.4)+P.temp+4*N.t(x*4,y*4)-6.5*(h>0?h:0)/1000;
  let m=fbm(N.m,x*P.scale*1.4+11,y*P.scale*1.4,mo,0.55)*1.25+0.5;m=m<0?0:m>1?1:m;
  const band=0.42+0.58*(Math.cos(3*Math.PI*lat)*0.5+0.5);
  cR=(80+3000*Math.pow(m,1.35))*band*(cT<0?0.6:1);
}
const B=[
 ["Deep ocean",[22,52,86]],["Open ocean",[38,88,128]],["Continental shelf",[78,140,174]],["Sea ice",[212,224,232]],
 ["Ice sheet",[238,242,245]],["Tundra",[158,162,136]],["Boreal forest",[74,104,78]],["Cold steppe",[166,160,118]],
 ["Temperate grassland",[164,178,104]],["Temperate forest",[90,134,70]],["Temperate rainforest",[52,110,78]],["Desert",[220,194,140]],
 ["Savanna",[190,172,92]],["Tropical dry forest",[124,154,64]],["Tropical rainforest",[40,114,56]],["Coast",[216,206,162]],
 ["Alpine rock",[134,126,118]],["Glacier",[236,238,238]]
];
function biome(h,T,R){
  if(h<0){if(T<-9)return 3;return h>-200?2:h>-2600?1:0;}
  if(T<-12)return 4;
  if(h>2600){if(T<-5)return 17;if(T<4)return 16;}
  if(h<10&&T>2)return 15;
  if(T<-1)return 5;
  if(T<7)return R<350?7:6;
  if(T<19){if(R<300)return 11;if(R<750)return 8;if(R<1700)return 9;return 10;}
  if(R<400)return 11;if(R<1000)return 12;if(R<1900)return 13;return 14;
}


/* ---------------- Arena: a battle map a few kilometres across ---------------- */
// Same noise, same 18 biomes, but the shape comes from a layout (island, coast or inland), the climate from a theme,
// and relief is hills of a few hundred metres. Many maps get a broad river channel that roads must bridge.
const THEMES={ // base temperature °C, rainfall range mm/yr: the biome function turns these into fields, forest, sand or snow
  temperate:{T:12,R:[420,1350],name:"Temperate"},snow:{T:-7,R:[260,900],name:"Snow"},
  desert:{T:25,R:[110,820],name:"Desert"},jungle:{T:25,R:[1250,2900],name:"Jungle"}
};
const LAYOUTS={island:"Island",coast:"Coastal",inland:"Inland"};
const arenaSea=()=>0.04+(P.sea-0.04)*0.35;               // the sea slider moves the shore less on a small map
const arenaTop=()=>140+520*(P.rough-0.38)/0.26;           // highest hills, from the ruggedness slider (140–660 m)
function elevArena(x,y,oct){
  const S=noiseScale(),g=P.rough;
  const wx=fbm(N.w1,x*S*0.6,y*S*0.6,3,0.5),wy=fbm(N.w2,x*S*0.6+7.1,y*S*0.6+3.7,3,0.5);
  const px=x*S+wx*0.35,py=y*S+wy*0.35;
  // regions, as on real battle maps: one or two blocks of highland, and broad, gently rolling lowland elsewhere
  const hl=smooth(0.05,0.5,N.k(x*1.1+3.3,y*1.1)+0.22*N.r(x*2.4,y*2.4));
  // battle ground is smooth up close: past the fourth octave each finer one fades fast, and detail stops at about 2 m
  let s=0,a=1,f=1,t=0;const o=oct<12?oct:12;
  for(let i=0;i<o;i++){const X=i<3?px:x*S,Y=i<3?py:y*S;s+=a*N.e(X*f+i*19.19,Y*f-i*7.73);t+=a;a*=i<3?g:g*0.5;f*=2.02;}
  let e=0.085+(0.04+0.17*hl)*(s/t)+0.03*N.c(x*1.4,y*1.4)+0.09*hl;
  if(hl>0){ // rounded crests in the highland, never knife-edged
    let r=0;a=1;f=1.3;t=0;const ro=oct<5?oct:5;
    for(let i=0;i<ro;i++){const X=i<2?px:x*S,Y=i<2?py:y*S;r+=(1-Math.abs(N.r(X*f+i*3.1,Y*f-i*1.7)))*a;t+=a;a*=0.5;f*=2.1;}
    e+=hl*(r/t-0.5)*0.08;
  }
  e-=0.1*smooth(0.48,0.7,N.c(x*3.1+11+wx*0.9,y*3.1-4+wy*0.9)+0.12*N.t(x*9,y*9))*(1-hl); // a few lowland lakes of irregular shape
  // layout: how much of the map is playable land and where the sea comes in
  const edge=fbm(N.c,x*2.2+9.2+wx*0.5,y*2.2+wy*0.5,5,0.6)*0.22; // ragged shores: bays, capes and offshore islets
  if(P.layout==="island"){const dx=(x-0.5)*2,dy=(y-0.5)*2;e-=0.5*smooth(0.86,1.1,Math.pow(dx**4+dy**4,0.25)+edge);}
  else if(P.layout==="coast"){const c=Math.cos(N.side),sn=Math.sin(N.side),d=(x-0.5)*c+(y-0.5)*sn;e-=0.5*smooth(0.24,0.5,d+edge);}
  else e+=0.035;
  // one or two broad rivers winding right across the map: the kind of water that forces bridges
  for(let c=0;c<N.chan;c++){
    const th=N.side+1.3+c*1.9,ct=Math.cos(th),st=Math.sin(th),u=(x-0.5)*ct+(y-0.5)*st,v=-(x-0.5)*st+(y-0.5)*ct;
    const mid=(c?-0.18:0.08)+0.16*N.m(u*2.1+c*9.3,4.7)+0.035*N.m(u*6.3,c*5.1+1.9);
    const q=Math.abs(v-mid),w=c?0.009:0.013;
    if(q<w*3)e-=0.17*smooth(w*3,w*0.8,q);
  }
  return e;
}
function metersArena(e){
  const s=arenaSea();
  // a narrow beach, then gentle lowland where towns can sit, and hills that steepen only as they rise
  if(e>=s){const x=Math.min(1,(e-s)/0.3);return 3+10*Math.min(1,x/0.025)+arenaTop()*x*x;}
  return -Math.pow(Math.min(1,(s-e)/0.2),0.7)*70;
}
function climateArena(x,y,h,oct){
  const th=THEMES[P.theme]||THEMES.temperate,S=noiseScale(),mo=Math.max(4,Math.min(8,(oct||8)-2));
  cT=th.T+2.5*N.t(x*2.5,y*2.5)+P.temp*0.3-6.5*(h>0?h:0)/1000;
  let m=fbm(N.m,x*S*1.3+11,y*S*1.3,mo,0.55)*1.35+0.5;m=m<0?0:m>1?1:m;
  cR=th.R[0]+(th.R[1]-th.R[0])*m;
}
