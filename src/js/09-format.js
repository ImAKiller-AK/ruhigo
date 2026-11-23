/* ---------------- Formatting ---------------- */
const fmtInt=v=>Math.round(v).toLocaleString("en-US");
function fmtDeg(v,pos,neg){const a=Math.abs(v);const s=a%1===0?a.toFixed(0):a<10?a.toFixed(2).replace(/0+$/,""):a.toFixed(2).replace(/0+$/,"");return v===0?"0°":s+"°"+(v>0?pos:neg);}
function fmtPop(p){return p>=1e6?(p/1e6).toFixed(2)+"M":Math.round(p/1000)+"k";}
const rgb=c=>"rgb("+c.join(",")+")";

