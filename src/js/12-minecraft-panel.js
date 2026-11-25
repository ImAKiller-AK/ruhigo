/* ---------------- Minecraft export: panel ---------------- */
const mc={area:"world",busy:false,cancel:false,blob:null,file:"",start:""};
const MC_SIZES={world:[[1024,512],[2048,1024],[4096,2048]],view:[[512,512],[1024,1024],[2048,2048]]};
const mcTable=()=>MC_SIZES[mc.area]; // planets only: battle maps are for design and have no export
const mcFramePx=()=>Math.min(cssW,cssH)*0.72;
function mcSpec(){
  const [W,H]=mcTable()[+$("mcSize").value];
  if(mc.area==="world")return {W,H,x0:0,y0:0,span:WX};
  const span=mcFramePx()*unit();
  return {W,H,x0:view.cx-span/2,y0:view.cy-span/2,span};
}
function mcSizes(){
  const sel=$("mcSize"),keep=sel.value||"1";sel.innerHTML="";
  mcTable().forEach(([w,h],n)=>{const op=document.createElement("option");op.value=n;op.textContent=fmtInt(w)+" × "+fmtInt(h);sel.appendChild(op);});
  sel.value=keep;
}
function mcInfo(){
  const s=mcSpec(),m=s.span*MPU/s.W;
  const scale=m>=10000?fmtInt(m/1000)+" km":m>=1000?(m/1000).toFixed(1)+" km":m>=10?fmtInt(m)+" m":m.toFixed(1)+" m";
  $("mcInfo").innerHTML="1 block ≈ <b>"+scale+"</b> · "+fmtInt(s.W*s.H/256)+" chunks"+(s.W*s.H>3e6?" · slow on phones":"");
}
function mcSay(text,pct){
  $("mcMsg").textContent=text;const bar=$("mcBar");
  if(pct===undefined)bar.hidden=true;else{bar.hidden=false;bar.firstElementChild.style.width=(pct*100).toFixed(1)+"%";}
}
function mcIdle(){
  mc.busy=false;mc.cancel=false;$("mcBtn").textContent="Build Minecraft world";
  $("mcArea").disabled=false;$("mcSize").disabled=false;$("mcSave").hidden=!mc.blob;
}
let mcDl;
async function mcDownloads(){
  if(mcDl===undefined){try{mcDl=window.claude&&window.claude.use?await window.claude.use("downloads"):null;}catch(e){mcDl=null;}}
  return mcDl;
}
async function mcSave(){
  const dl=await mcDownloads();
  if(!dl||!mc.blob){mcSay("This view can't save files. Open Worldsmith on claude.ai and build the world there.");return;}
  const mcworld=mc.file.replace(/\.zip$/,".mcworld");
  try{
    await dl.save({filename:mc.file,data:mc.blob});
    mcSay("Saved "+mc.file+". Rename it to "+mcworld+" and open it: Minecraft imports it as a new world."+mc.start);
  }catch(e){
    const code=e&&e.code;
    mcSay(code==="declined"?"Download cancelled. The world is still built: press Save file again when you want it."
      :code==="rate_limited"?"A download prompt is already open. Wait a moment, then press Save file again."
      :code==="too_large"?"This file is too big to save here. Build a smaller size."
      :"The file couldn't be saved in this view. Open Worldsmith on claude.ai and try again.");
  }
}
$("mcBtn").addEventListener("click",async()=>{
  if(mc.busy){mc.cancel=true;return;}
  mc.busy=true;mc.cancel=false;mc.blob=null;
  $("mcBtn").textContent="Cancel";$("mcArea").disabled=true;$("mcSize").disabled=true;$("mcSave").hidden=true;
  mcSay("Getting ready…",0);
  if(!await mcDownloads()){mcIdle();mcSay("This view can't save files. Open Worldsmith on claude.ai and build the world there.");return;}
  const spec=mcSpec(),rev=worldRev,name=worldName+" · Worldsmith";
  try{
    const res=await MCX.build({...spec,name,progress:(f,msg)=>mcSay(msg+" "+Math.round(f*100)+"%",f),cancelled:()=>mc.cancel||worldRev!==rev});
    mc.blob=res.blob;mc.file=worldName.toLowerCase().replace(/[^a-z0-9]+/g,"-")+"-"+P.seed+"-minecraft.zip";
    const home=res.towns.find(t=>t.cap)||res.towns[0];mc.start=home?" You start beside "+home.name+".":"";
    mcIdle();mcSay("World ready: "+(res.blob.size/1048576).toFixed(1)+" MB, "+res.towns.length+" settlements. Confirm the download…");
    await mcSave();
  }catch(e){
    mcIdle();
    mcSay(e&&e.code==="cancelled"?(worldRev!==rev?"The world changed during the export, so it stopped. Build it again.":"Export cancelled.")
      :"The world couldn't be built: "+(e&&e.message||"out of memory?")+" Try a smaller size.");
  }
});
$("mcSave").addEventListener("click",mcSave);
$("mcArea").addEventListener("change",e=>{mc.area=e.target.value;mcSizes();mcInfo();compose();});
$("mcSize").addEventListener("change",mcInfo);
mcSizes();

