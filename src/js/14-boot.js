/* ---------------- Boot ---------------- */
resize();updateLegend();
const h=location.hash.slice(1);
newSeed(/^[a-z0-9-]{1,32}$/.test(h)?h:"ember-4");
let startTab="gen";try{if(localStorage.getItem("worldsmith-tab")==="sim")startTab="sim";}catch(e){}
setTab(startTab);
