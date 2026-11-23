/* ---------------- World model ---------------- */
// World space: x in [0,2], y in [0,1] (equirectangular). 2 units = 40,000 km.
const P={seed:"",sea:0.04,scale:1.8,rough:0.5,temp:0};
let N=null,worldRev=0; // worldRev changes whenever the terrain does, so a running export can tell
function elev(x,y,oct){
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
function meters(e){const s=P.sea;if(e>=s){const x=Math.min(1,(e-s)/0.66);return Math.pow(x,2.6)*8400+x*520;}return -Math.pow(Math.min(1,(s-e)/0.55),0.8)*6200;}
let cT=0,cR=0;
function climate(x,y,h,oct){
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

