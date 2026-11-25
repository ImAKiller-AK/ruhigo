/* ---------------- Boot ---------------- */
resize();
const h=parseHash(location.hash.slice(1));
applyKind();newSeed(h||"ember-4");
let startTab="gen";try{if(localStorage.getItem("worldsmith-tab")==="sim")startTab="sim";}catch(e){}
setTab(startTab);
