/* ---------------- Language (names) ---------------- */
function makeLanguage(rand){
  const pick=a=>a[Math.floor(rand()*a.length)];
  const sample=(a,n)=>{const c=a.slice();for(let i=c.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[c[i],c[j]]=[c[j],c[i]];}return c.slice(0,n);};
  const C=sample(["b","c","d","f","g","h","k","l","m","n","p","r","s","t","v","z","th","sh","kh","dr","tr","br","gr","st","ph","w","y","j","q","x","ch","sk"],9+Math.floor(rand()*6));
  const V=sample(["a","e","i","o","u","a","e","o","ae","ei","ou","ia","y","au","io","ea","ar","or"],4+Math.floor(rand()*4));
  const F=sample(["n","r","s","th","l","m","nd","rn","sk","x","k","sh","t","rd","ll","ss","nt","sh","ck"],3+Math.floor(rand()*4));
  const fin=0.25+rand()*0.4,maxS=rand()<0.5?2:3,used=new Set();
  return function word(minS=2){
    for(let tries=0;tries<40;tries++){
      const n=minS+Math.floor(rand()*(Math.max(minS,maxS)-minS+1));let s="";
      for(let i=0;i<n;i++){if(i>0||rand()<0.8)s+=pick(C);s+=pick(V);if(i<n-1&&rand()<fin*0.45)s+=pick(F);}
      if(rand()<fin)s+=pick(F);
      if(s.length<4||s.length>10||used.has(s))continue;
      used.add(s);return s[0].toUpperCase()+s.slice(1);
    }
    return "Nameless";
  };
}

