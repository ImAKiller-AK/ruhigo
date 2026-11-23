const $=id=>document.getElementById(id);

/* ---------------- Random + noise ---------------- */
function seedHash(s){let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const GR=new Float32Array([1,1,-1,1,1,-1,-1,-1,1,0,-1,0,1,0,-1,0,0,1,0,-1,0,1,0,-1]);
const F2=0.5*(Math.sqrt(3)-1),G2=(3-Math.sqrt(3))/6;
function makeNoise(rand){
  const p=new Uint8Array(256);for(let i=0;i<256;i++)p[i]=i;
  for(let i=255;i>0;i--){const j=Math.floor(rand()*(i+1));const t=p[i];p[i]=p[j];p[j]=t;}
  const perm=new Uint8Array(512),pm=new Uint8Array(512);
  for(let i=0;i<512;i++){perm[i]=p[i&255];pm[i]=(perm[i]%12)*2;}
  return function(xin,yin){
    let n0=0,n1=0,n2=0;
    const s=(xin+yin)*F2,i=Math.floor(xin+s),j=Math.floor(yin+s),t=(i+j)*G2;
    const x0=xin-(i-t),y0=yin-(j-t);
    let i1,j1;if(x0>y0){i1=1;j1=0}else{i1=0;j1=1}
    const x1=x0-i1+G2,y1=y0-j1+G2,x2=x0-1+2*G2,y2=y0-1+2*G2,ii=i&255,jj=j&255;
    let t0=0.5-x0*x0-y0*y0;if(t0>0){const g=pm[ii+perm[jj]];t0*=t0;n0=t0*t0*(GR[g]*x0+GR[g+1]*y0);}
    let t1=0.5-x1*x1-y1*y1;if(t1>0){const g=pm[ii+i1+perm[jj+j1]];t1*=t1;n1=t1*t1*(GR[g]*x1+GR[g+1]*y1);}
    let t2=0.5-x2*x2-y2*y2;if(t2>0){const g=pm[ii+1+perm[jj+1]];t2*=t2;n2=t2*t2*(GR[g]*x2+GR[g+1]*y2);}
    return 70*(n0+n1+n2);
  };
}
function fbm(n,x,y,oct,gain){let a=1,f=1,s=0,t=0;for(let i=0;i<oct;i++){s+=a*n(x*f+i*19.19,y*f-i*7.73);t+=a;a*=gain;f*=2.02;}return s/t;}
function smooth(a,b,x){x=(x-a)/(b-a);x=x<0?0:x>1?1:x;return x*x*(3-2*x);}

