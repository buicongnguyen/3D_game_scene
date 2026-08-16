self.onmessage = event => {
  const cfg=event.data;
  const {hm,world,df,dfs,waterY0,waterY1}=cfg;
  const half=world/2, out=new Float32Array(hm*hm), rf={d:0,t:0};
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const smoothstep=(a,b,x)=>{ const t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
  const smootherstep=(a,b,x)=>{ const t=clamp((x-a)/(b-a),0,1); return t*t*t*(t*(t*6-15)+10); };
  function noise2(x,y){
    const xi=Math.floor(x), yi=Math.floor(y), xf=x-xi, yf=y-yi;
    const u=xf*xf*xf*(xf*(xf*6-15)+10), v=yf*yf*yf*(yf*(yf*6-15)+10);
    const X=xi&255, Y=yi&255, p=cfg.perm, gx=cfg.gx, gy=cfg.gy;
    const a=p[X+p[Y]], b=p[X+1+p[Y]], c=p[X+p[Y+1]], d=p[X+1+p[Y+1]];
    const n00=gx[a]*xf+gy[a]*yf, n10=gx[b]*(xf-1)+gy[b]*yf;
    const n01=gx[c]*xf+gy[c]*(yf-1), n11=gx[d]*(xf-1)+gy[d]*(yf-1);
    return lerp(lerp(n00,n10,u),lerp(n01,n11,u),v)*1.4;
  }
  function fbm2(x,y,oct=5,lac=2.03,gain=.5){
    let a=.5,f=1,s=0,n=0;
    for(let i=0;i<oct;i++){ s+=a*noise2(x*f,y*f); n+=a; a*=gain; f*=lac; }
    return s/n;
  }
  function ridged(x,y,oct=5,lac=2.07,gain=.5){
    let a=.5,f=1,s=0,n=0,w=1;
    for(let i=0;i<oct;i++){
      let v=1-Math.abs(noise2(x*f,y*f)); v*=v; v*=w; w=clamp(v*1.6,0,1);
      s+=a*v; n+=a; a*=gain; f*=lac;
    }
    return s/n*2-1;
  }
  function billow(x,y,oct=4,lac=2,gain=.5){
    let a=.5,f=1,s=0,n=0;
    for(let i=0;i<oct;i++){ s+=a*Math.abs(noise2(x*f,y*f)); n+=a; a*=gain; f*=lac; }
    return s/n*2-1;
  }
  function riverField(x,z,outRf){
    const fx=clamp((x+half)/dfs,0,df-1.001), fy=clamp((z+half)/dfs,0,df-1.001);
    const x0=fx|0, y0=fy|0, tx=fx-x0, ty=fy-y0;
    const i00=y0*df+x0, i10=i00+1, i01=i00+df, i11=i01+1;
    outRf.d=lerp(lerp(cfg.dfDist[i00],cfg.dfDist[i10],tx),lerp(cfg.dfDist[i01],cfg.dfDist[i11],tx),ty);
    outRf.t=lerp(lerp(cfg.dfT[i00],cfg.dfT[i10],tx),lerp(cfg.dfT[i01],cfg.dfT[i11],tx),ty);
    return outRf;
  }
  const waterLevel=t=>{
    t=clamp(t,0,1);
    return lerp(waterY0,waterY1,Math.pow(t,.86))+Math.sin(t*11)*.55;
  };
  const riverWidth=t=>9.5+16*Math.pow(clamp(t,0,1),.7)+Math.sin(t*17)*2.2;
  function valleyProfile(d,wobble,w){
    const bed=w*.55;
    if(d<bed) return -3.4+d*.02;
    if(d<w) return lerp(-3.3,-.42,smootherstep(bed,w,d));
    const bank=w+13+wobble*6;
    if(d<bank) return lerp(-.42,2.6,smootherstep(w,bank,d));
    if(d<150){ const u=(d-bank)/(150-bank); return 2.6+42*Math.pow(u,.55); }
    return lerp(44.6,60,smootherstep(150,320,d));
  }
  function baseHills(x,z){
    const s=.00085;
    let h=fbm2(x*s,z*s,4)*46;
    h+=ridged(x*s*2.6+11,z*s*2.6-7,4)*20;
    h+=billow(x*s*6.1-3,z*s*6.1+5,3)*7.5;
    h+=noise2(x*s*17,z*s*17)*2.1;
    const wx=noise2(x*s*.55+31,z*s*.55-19)*90;
    const wz=noise2(x*s*.55-13,z*s*.55+27)*90;
    return h+fbm2((x+wx)*s*.42,(z+wz)*s*.42,3)*34;
  }
  function terrainAt(x,z){
    riverField(x,z,rf);
    const wl=waterLevel(rf.t), wob=noise2(x*.0032+4.4,z*.0032-2.1);
    const regional=wl+60, hBase=regional+baseHills(x,z);
    const prof=wl+valleyProfile(rf.d,wob,riverWidth(rf.t))
      +noise2(x*.0068,z*.0068)*3.4*smoothstep(24,110,rf.d)
      +noise2(x*.021,z*.021)*.9*smoothstep(16,60,rf.d);
    let h=lerp(hBase,prof,1-smootherstep(150,330,rf.d));
    const dk=Math.hypot(x-cfg.spawn.x,z-cfg.spawn.z);
    h+=cfg.spawn.h*Math.pow(Math.max(0,1-dk/cfg.spawn.r),2);
    for(const village of cfg.villages){
      const dv=Math.hypot(x-village.x,z-village.z);
      if(dv>=village.r*1.5) continue;
      const w=smootherstep(village.r*1.5,village.r*.35,dv);
      const target=wl+village.lift+(z-village.z)*.075+noise2(x*.01,z*.01)*2.2;
      const bankEdge=riverWidth(rf.t);
      const riverClear=smootherstep(bankEdge+8,bankEdge+34,rf.d);
      h=lerp(h,target,w*village.blend*riverClear);
    }
    return h;
  }
  for(let y=0;y<hm;y++){
    const wz=y/(hm-1)*world-half;
    for(let x=0;x<hm;x++) out[y*hm+x]=terrainAt(x/(hm-1)*world-half,wz);
    if((y&63)===0) self.postMessage({type:'progress',value:y/hm});
  }
  self.postMessage({type:'done',buffer:out.buffer},[out.buffer]);
};
