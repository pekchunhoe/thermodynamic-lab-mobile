(function () {
const R = 8.314, n = (101325 * .004) / (R * 300), Cv = R / .4, gamma = 1.4;
const processInfo = {
  isobaric:{title:'Isobaric process', kicker:'CONSTANT PRESSURE', badge:'P = constant', definition:'Pressure stays fixed while volume and temperature change together.', color:'#2974d8'},
  isochoric:{title:'Isochoric process', kicker:'CONSTANT VOLUME', badge:'V = constant', definition:'The locked piston keeps volume fixed, so no work is done.', color:'#2ea98a'},
  isothermal:{title:'Isothermal process', kicker:'CONSTANT TEMPERATURE', badge:'T = constant', definition:'Temperature stays fixed; heat exactly balances the work.', color:'#d4793e'},
  adiabatic:{title:'Adiabatic process', kicker:'NO HEAT TRANSFER', badge:'Q = 0', definition:'No heat crosses the boundary; work comes directly from internal energy.', color:'#7956c7'}
};
function createState(process='isobaric', direction='expansion', progress=0){return {process,direction,progress, Pi:101325,Vi:.004,Ti:300};}
function calculate(s){
  const {Pi,Vi,Ti,process,direction}=s, x=s.progress/100, sign=direction==='expansion'?1:-1;
  const factor=1+sign*.5*x; let P,V,T,W,Q,dU;
  if(process==='isobaric'){P=Pi;V=Vi*factor;T=Ti*factor;W=P*(V-Vi);dU=n*Cv*(T-Ti);Q=dU+W;}
  else if(process==='isochoric'){V=Vi;T=Ti*factor;P=Pi*factor;W=0;dU=n*Cv*(T-Ti);Q=dU;}
  else if(process==='isothermal'){T=Ti;V=Vi*factor;P=Pi*Vi/V;W=n*R*T*Math.log(V/Vi);dU=0;Q=W;}
  else {V=Vi*factor;P=Pi*Math.pow(Vi/V,gamma);T=Ti*Math.pow(Vi/V,gamma-1);W=(Pi*Vi-P*V)/(gamma-1);dU=n*Cv*(T-Ti);Q=0;}
  return {...s,P,V,T,W,Q,dU, Pf:P,Vf:V,Tf:T};
}
function sign(v){return Math.abs(v)<.5?'zero':v>0?'positive':'negative'};
function fmt(v,d=0){const a=Math.abs(v);return `${v>0?'+':v<0?'−':''}${a.toFixed(d)}`}
function eq(state){const {process,P,V,T,W,Q,dU,Pi,Vi}=state;
  if(process==='isobaric')return {rule:'P = constant · V/T = constant',work:`W = PΔV = ${(P/1000).toFixed(1)} kPa × ${((V-Vi)*1000).toFixed(2)} L = ${fmt(W,0)} J`};
  if(process==='isochoric')return {rule:'ΔV = 0 → W = 0 → Q = ΔU',work:`W = 0 J; Q = ${fmt(Q,0)} J = ΔU`};
  if(process==='isothermal')return {rule:'ΔT = 0 → ΔU = 0 → Q = W',work:`W = nRT ln(Vf/Vi) = ${fmt(W,0)} J`};
  return {rule:'Q = 0 → ΔU = −W',work:`W = ∫ P dV = ${fmt(W,0)} J (area under path)`};
}
function pathPoints(s, steps=80){return Array.from({length:steps+1},(_,i)=>calculate({...s,progress:s.progress*i/steps}));}
window.Thermo={R,n,Cv,gamma,processInfo,createState,calculate,sign,fmt,eq,pathPoints};
})();
