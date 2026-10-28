import {compile} from './equation.mjs';
export function sourceFor(shaderTemplate,s){
  const names=s.variables.map(v=>v.name),expr=compile(s.equation,names),initial=compile(s.initial,names);
  let declarations='';let negative='vec2 negativeAt(float index){';Object.keys(s.negative).forEach((k,i)=>{declarations+=`uniform vec2 negative${i};\n`;negative+=`if(index==${k}.0)return negative${i};`;});negative+='return vec2(0.0);}\n';
  s.variables.forEach((v,i)=>declarations+=`uniform vec2 input${i};\n`);
  const bindings=s.variables.map((v,i)=>`vec2 var${i}=${v.source===2?'pixel':`input${i}`};`).join('\n');
  return shaderTemplate.replace(/%([1-6])/g,(_,i)=>({1:initial,2:expr,3:declarations+negative,4:bindings,5:String(s.historySize),6:String(expr.includes('historyAt('))}[i]));
}
