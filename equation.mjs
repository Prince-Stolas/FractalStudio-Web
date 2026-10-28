// Browser port of equation.cpp. Expressions become GLSL, never JavaScript eval.
export const functions = {sin:'csin',cos:'ccos',exp:'cexp',log:'clog',conj:'conjugate',abs:'componentAbs',norm:'magnitude',floor:'floor',ceil:'ceil',real:'realPart',imag:'imagPart'};
export function validName(name) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !['z','z_n','n','pixel','i','pi',...Object.keys(functions)].includes(name);
}
export function compile(text, names=['c','p']) {
  if (text.length>512) throw Error('Equation is too long (maximum 512 characters)');
  let pos=0, depth=0;
  const space=()=>{while (/\s/.test(text[pos]??'') && pos<text.length) pos++;};
  const eat=c=>{space();if(text[pos]===c){pos++;return true;}return false;};
  const expect=c=>{if(!eat(c))throw Error(`Expected ${c} at character ${pos+1}`);};
  const literal=x=> Number.isInteger(x)&&Math.abs(x)<1e15?`${x}.0`:String(x);
  function sum(){let a=product();for(;;){if(eat('+'))a=`(${a}+${product()})`;else if(eat('-'))a=`(${a}-${product()})`;else return a;}}
  function product(){let a=unary();for(;;){if(eat('*'))a=`mul(${a},${unary()})`;else if(eat('/'))a=`divide(${a},${unary()})`;else if(eat('%'))a=`cmod(${a},${unary()})`;else return a;}}
  function unary(){if(++depth>80)throw Error('Expression nesting is too deep');let a;if(eat('-'))a=`(-${unary()})`;else if(eat('+'))a=unary();else a=power();depth--;return a;}
  function power(){const a=atom();return eat('^')?`cpow(${a},${unary()})`:a;}
  function atom(){
    space();if(eat('(')){const a=sum();expect(')');return a;}
    const number=text.slice(pos).match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
    if(number){pos+=number[0].length;const value=Number(number[0]);if(!Number.isFinite(value)||Math.abs(value)>3e38)throw Error('Number is outside WebGL range');const n=literal(value);if(text[pos]==='i'&&!/[\w]/.test(text[pos+1]??'')){pos++;return `vec2(0.0,${n})`;}return `vec2(${n},0.0)`;}
    const match=text.slice(pos).match(/^[A-Za-z_][A-Za-z0-9_]*/);if(!match)throw Error(`Expected a number or name at character ${pos+1}`);
    const id=match[0];pos+=id.length;
    if(id==='z'){if(!eat('['))throw Error('Use z[index], not bare z');const index=sum();expect(']');return index==='vec2(n,0.0)'?'z':`historyAt(${index})`;}
    if(id==='z_n')throw Error('Use z[n], not z_n');
    if(id==='pixel')return 'pixel';
    if(names.includes(id))return `var${names.indexOf(id)}`;
    if(id==='n')return 'vec2(n,0.0)';if(id==='i')return 'vec2(0.0,1.0)';if(id==='pi')return 'vec2(3.141592653589793,0.0)';
    if(!functions[id])throw Error(`Unknown name: ${id}`);expect('(');const a=sum();expect(')');return `${functions[id]}(${a})`;
  }
  const result=sum();space();if(pos!==text.length)throw Error(`Unexpected character at ${pos+1}`);return result;
}
