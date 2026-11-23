/* ---------------- Interaction ---------------- */
function clampView(){view.zoom=Math.min(2500,Math.max(1,view.zoom));view.cx=Math.min(2,Math.max(0,view.cx));view.cy=Math.min(1,Math.max(0,view.cy));}
function zoomAt(mx,my,factor){
  const u=unit(),wx=view.cx+(mx-cssW/2)*u,wy=view.cy+(my-cssH/2)*u;
  view.zoom*=factor;clampView();const u2=unit();
  view.cx=wx-(mx-cssW/2)*u2;view.cy=wy-(my-cssH/2)*u2;clampView();request();
}
let anim=0;
function flyTo(x,y,z){
  cancelAnimationFrame(anim);
  if(matchMedia("(prefers-reduced-motion: reduce)").matches){view.cx=x;view.cy=y;view.zoom=z;clampView();request();return;}
  const a={cx:view.cx,cy:view.cy,lz:Math.log(view.zoom)},b={cx:x,cy:y,lz:Math.log(z)},t0=performance.now(),D=1100;
  const tick=now=>{
    let t=Math.min(1,(now-t0)/D);const e=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
    view.cx=a.cx+(b.cx-a.cx)*e;view.cy=a.cy+(b.cy-a.cy)*e;view.zoom=Math.exp(a.lz+(b.lz-a.lz)*e);clampView();
    renderNow();if(t<1)anim=requestAnimationFrame(tick);
  };
  anim=requestAnimationFrame(tick);
  if(innerWidth<=860)mapEl.scrollIntoView({block:"start"});
}
const ptrs=new Map();let pinch=null,moved=false;
const local=e=>{const r=mapEl.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];};
mapEl.addEventListener("pointerdown",e=>{
  if(e.target.closest("button,.timebar"))return;
  mapEl.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,local(e));moved=false;cancelAnimationFrame(anim);
  if(ptrs.size===2){const [p,q]=[...ptrs.values()];pinch={d:Math.hypot(p[0]-q[0],p[1]-q[1])};}
  mapEl.classList.add("dragging");
});
mapEl.addEventListener("pointermove",e=>{
  const pt=local(e);
  if(!ptrs.has(e.pointerId)){
    if(e.pointerType==="mouse"&&ui.sel.kind==="point"&&!e.target.closest(".timebar")){const u=unit();select({kind:"point",wx:view.cx+(pt[0]-cssW/2)*u,wy:view.cy+(pt[1]-cssH/2)*u});}
    return;
  }
  const prev=ptrs.get(e.pointerId);ptrs.set(e.pointerId,pt);
  if(ptrs.size===2&&pinch){
    const [p,q]=[...ptrs.values()],d=Math.hypot(p[0]-q[0],p[1]-q[1]);
    if(pinch.d>0)zoomAt((p[0]+q[0])/2,(p[1]+q[1])/2,d/pinch.d);pinch.d=d;moved=true;return;
  }
  const dx=pt[0]-prev[0],dy=pt[1]-prev[1];if(Math.abs(dx)+Math.abs(dy)>0.5)moved=true;
  const u=unit();view.cx-=dx*u;view.cy-=dy*u;clampView();request();
});
const end=e=>{
  if(ptrs.has(e.pointerId)&&!moved&&ptrs.size===1){const pt=local(e);pickAt(pt[0],pt[1]);}
  ptrs.delete(e.pointerId);if(ptrs.size<2)pinch=null;if(!ptrs.size)mapEl.classList.remove("dragging");
};
mapEl.addEventListener("pointerup",end);mapEl.addEventListener("pointercancel",end);
mapEl.addEventListener("wheel",e=>{e.preventDefault();const pt=local(e);zoomAt(pt[0],pt[1],Math.exp(-Math.max(-300,Math.min(300,e.deltaY))*0.0022));},{passive:false});
mapEl.addEventListener("dblclick",e=>{if(e.target.closest(".timebar"))return;const pt=local(e);zoomAt(pt[0],pt[1],2.5);});
mapEl.addEventListener("keydown",e=>{
  const u=unit()*cssW*0.15;
  if(e.key==="+"||e.key==="=")zoomAt(cssW/2,cssH/2,1.6);
  else if(e.key==="-")zoomAt(cssW/2,cssH/2,1/1.6);
  else if(e.key==="ArrowLeft"){view.cx-=u;clampView();request();}
  else if(e.key==="ArrowRight"){view.cx+=u;clampView();request();}
  else if(e.key==="ArrowUp"){view.cy-=u;clampView();request();}
  else if(e.key==="ArrowDown"){view.cy+=u;clampView();request();}
  else return;e.preventDefault();
});
$("zin").addEventListener("click",()=>zoomAt(cssW/2,cssH/2,2));
$("zout").addEventListener("click",()=>zoomAt(cssW/2,cssH/2,0.5));
$("zreset").addEventListener("click",()=>flyTo(1,0.5,1));

document.querySelectorAll("#layerSeg button").forEach(b=>b.addEventListener("click",()=>{
  mode=b.dataset.mode;document.querySelectorAll("#layerSeg button").forEach(o=>o.setAttribute("aria-pressed",o===b?"true":"false"));
  updateLegend();
  if(reshade(low)&&full&&reshade(full))compose();else renderNow();
}));
[["optRivers","rivers"],["optCities","cities"],["optGrid","grid"],["optBorders","borders"],["optRoutes","routes"],["optRes","res"]].forEach(([id,k])=>$(id).addEventListener("change",e=>{opt[k]=e.target.checked;if(k==="res"||k==="borders")resLegend();compose();}));
["sSea","sScale","sRough","sTemp"].forEach(id=>$(id).addEventListener("input",()=>{
  readParams();renderNow();clearTimeout(regenTimer);regenTimer=setTimeout(regenerate,280);
}));
$("seedForm").addEventListener("submit",e=>{e.preventDefault();newSeed($("seed").value);});
$("randomBtn").addEventListener("click",()=>newSeed(randomSeed()));
addEventListener("hashchange",()=>{const s=location.hash.slice(1);if(s&&s!==P.seed)newSeed(s);});

function resize(){
  const r=mapEl.getBoundingClientRect();cssW=Math.max(50,r.width);cssH=Math.max(50,r.height);dpr=Math.min(2,devicePixelRatio||1);
  canvas.width=Math.round(cssW*dpr);canvas.height=Math.round(cssH*dpr);
  if(N)renderNow();
}
new ResizeObserver(resize).observe(mapEl);

