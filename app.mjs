import {compile, validName} from './equation.mjs';
import {sourceFor} from './renderer.mjs';
const $=id=>document.getElementById(id);
const canvas=$('canvas'), status=$('status');
const defaults={equation:'z[n]^p+c',initial:'0',iterations:128,bailout:16,historySize:1,negative:{},variables:[{name:'c',source:2,real:-.745,imag:.186},{name:'p',source:0,real:2,imag:0}],center:[-.5,0],span:3,colourMode:0,palette:0,frequency:.025,phase:0,smoothing:1,trapViewScaled:0,escapeSolid:0,escapeColour:'#ffffff',interiorColour:'#000000',trapShape:0,trapReal:0,trapImag:0,trapRadius:1,gradientStart:'#ffffff',gradientMiddle:'#5599ff',gradientEnd:'#000000'};
let state=structuredClone(defaults), gl, program, shaderTemplate, locations=new Map(), pending=false, lost=false;
const numeric={iterations:[1,4000,true],bailout:[1,100000],historySize:[1,32,true],colourMode:[0,1,true],palette:[0,4,true],frequency:[.0001,10],phase:[0,1],smoothing:[0,1],trapViewScaled:[0,1,true],escapeSolid:[0,1,true],trapShape:[0,2,true],trapReal:[-1e6,1e6],trapImag:[-1e6,1e6],trapRadius:[0,1e6]};
const colours=['escapeColour','interiorColour','gradientStart','gradientMiddle','gradientEnd'];
function message(text,error=false){status.textContent=text;status.classList.toggle('error',error);}
function validate(s){
  if(!s||typeof s!=='object')throw Error('Invalid workspace');
  for(const [key,[min,max,integer]] of Object.entries(numeric)){if(typeof s[key]!=='number'||!Number.isFinite(s[key])||s[key]<min||s[key]>max||(integer&&!Number.isInteger(s[key])))throw Error(`Invalid ${key}: expected ${min}–${max}`);}
  if(!Array.isArray(s.center)||s.center.length!==2||s.center.some(v=>!Number.isFinite(v)||Math.abs(v)>1e6)||!Number.isFinite(s.span)||s.span<.00002||s.span>100)throw Error('Invalid camera');
  if(!Array.isArray(s.variables)||s.variables.length>24)throw Error('Use at most 24 variables');
  const names=new Set();for(const v of s.variables){if(!v||!validName(v.name)||names.has(v.name))throw Error('Variable names must be unique and valid');names.add(v.name);if(![0,1,2].includes(v.source)||!Number.isFinite(v.real)||!Number.isFinite(v.imag)||Math.abs(v.real)>1e6||Math.abs(v.imag)>1e6)throw Error('Invalid variable value');}
  if(!s.negative||typeof s.negative!=='object'||Array.isArray(s.negative)||Object.keys(s.negative).length>32)throw Error('Use at most 32 negative history seeds');
  for(const [k,v] of Object.entries(s.negative)){if(!/^-[1-9]\d*$/.test(k)||Number(k)<-100000||!Array.isArray(v)||v.length!==2||v.some(x=>!Number.isFinite(x)||Math.abs(x)>1e6))throw Error('Invalid negative history seed');}
  for(const key of colours)if(!/^#[0-9a-f]{6}$/i.test(s[key]))throw Error('Invalid colour');
  if(typeof s.equation!=='string'||typeof s.initial!=='string')throw Error('Invalid equation');
  compile(s.equation,[...names]);const initial=compile(s.initial,[...names]);if(initial.includes('historyAt(')||/\bz\b/.test(initial))throw Error('Initial z cannot reference iteration history');
  return s;
}
function controls(){
  for(const key of [...Object.keys(numeric),...colours,'equation','initial'])$(key).value=state[key];
  $('negative').value=JSON.stringify(state.negative);variables();
}
function variables(){
  $('variables').replaceChildren();state.variables.forEach((v,index)=>{
    const box=document.createElement('div');box.className='variable';
    const row=document.createElement('div');row.className='row';const name=document.createElement('input');name.value=v.name;name.setAttribute('aria-label',`Variable ${index+1} name`);name.dataset.field='name';
    const remove=document.createElement('button');remove.textContent='×';remove.className='delete';remove.setAttribute('aria-label',`Delete ${v.name}`);remove.onclick=()=>{box.remove();};row.append(name,remove);
    const source=document.createElement('select');source.setAttribute('aria-label',`${v.name} source`);source.dataset.field='source';['Constant','Mouse picked','Pixel coordinate'].forEach((s,i)=>source.add(new Option(s,String(i))));source.value=v.source;
    const values=document.createElement('div');values.className='row';['real','imag'].forEach(field=>{const input=document.createElement('input');input.type='number';input.step='0.001';input.value=v[field];input.dataset.field=field;input.setAttribute('aria-label',`${v.name} ${field}`);values.append(input);});
    source.onchange=()=>values.hidden=source.value==='2';values.hidden=v.source===2;box.append(row,source,values);$('variables').append(box);
  });
}
function readControls(){
  const next=structuredClone(state);
  for(const key of Object.keys(numeric))next[key]=Number($(key).value);
  for(const key of [...colours,'equation','initial'])next[key]=$(key).value;
  next.negative=JSON.parse($('negative').value);
  next.variables=[...$('variables').children].map(box=>Object.fromEntries([...box.querySelectorAll('[data-field]')].map(input=>[input.dataset.field,input.dataset.field==='name'?input.value:Number(input.value)])));
  return validate(next);
}
function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const log=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error(log);}return s;}

function rebuild(s){
  const vertex='#version 300 es\nprecision highp float;\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0.0,1.0);}';
  const shaders=[];const next=gl.createProgram();try{shaders.push(shader(gl.VERTEX_SHADER,vertex));shaders.push(shader(gl.FRAGMENT_SHADER,sourceFor(shaderTemplate,s)));shaders.forEach(x=>gl.attachShader(next,x));gl.linkProgram(next);if(!gl.getProgramParameter(next,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(next));}catch(e){gl.deleteProgram(next);throw e;}finally{shaders.forEach(x=>gl.deleteShader(x));}
  if(program)gl.deleteProgram(program);program=next;locations.clear();
}
const location=name=>{if(!locations.has(name))locations.set(name,gl.getUniformLocation(program,name));return locations.get(name);};
const f=(name,value)=>gl.uniform1f(location(name),value),i=(name,value)=>gl.uniform1i(location(name),value),v2=(name,x,y)=>gl.uniform2f(location(name),x,y);
function rgb(hex){return [1,3,5].map(p=>parseInt(hex.slice(p,p+2),16)/255);}
let texture;
function gradient(){
  if(texture)gl.deleteTexture(texture);texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
  const stops=[state.gradientStart,state.gradientMiddle,state.gradientEnd].map(rgb),data=new Uint8Array(256*4);for(let x=0;x<256;x++){const t=x/255*2,k=Math.min(1,Math.floor(t)),a=t-k;for(let c=0;c<3;c++)data[x*4+c]=Math.round(255*(stops[k][c]*(1-a)+stops[k+1][c]*a));data[x*4+3]=255;}
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,256,1,0,gl.RGBA,gl.UNSIGNED_BYTE,data);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
}
function draw(){
  pending=false;if(!program||lost)return;
  const ratio=Math.min(devicePixelRatio||1,2),rect=canvas.getBoundingClientRect();const w=Math.max(1,Math.round(rect.width*ratio)),h=Math.max(1,Math.round(rect.height*ratio));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  gl.viewport(0,0,w,h);gl.useProgram(program);v2('resolution',w,h);v2('center',...state.center);f('scale',state.span);
  for(const key of ['iterations','palette','colourMode','escapeSolid','trapViewScaled','trapShape'])i(key,state[key]);
  for(const key of ['bailout','frequency','phase','smoothing','trapReal','trapImag','trapRadius'])f(key,state[key]);
  for(const key of ['escapeColour','interiorColour'])gl.uniform3f(location(key),...rgb(state[key]));
  i('calibrationPass',0);i('convergenceEnabled',0);i('interiorGradient',0);i('showMarker',0);i('quadratic',0);i('gradientTexture',0);i('interiorTexture',0);
  state.variables.forEach((v,index)=>v2(`input${index}`,v.real,v.imag));Object.values(state.negative).forEach((v,index)=>v2(`negative${index}`,...v));
  gl.drawArrays(gl.TRIANGLES,0,3);
  $('camera').textContent=`${state.center[0].toPrecision(8)} ${state.center[1]<0?'−':'+'} ${Math.abs(state.center[1]).toPrecision(7)}i · ${(3/state.span).toFixed(1)}×`;
}
function requestDraw(){if(!pending&&!lost){pending=true;requestAnimationFrame(draw);}}
function apply(){try{const next=readControls();if(!gl||lost)throw Error('Renderer unavailable');rebuild(next);state=next;gradient();requestDraw();message('Equation applied · rendering on your GPU');}catch(e){message(e.message,true);}}
function reset(){state.center=state.variables.some(v=>v.name==='c'&&v.source===2)?[-.5,0]:[0,0];state.span=3;requestDraw();}
const presets=[['Mandelbrot','z[n]^p+c',2,2],['Julia','z[n]^p+c',2,1],['Burning Ship','abs(z[n])^p+c',2,2],['Tricorn','conj(z[n])^p+c',2,2],['Cubic Multibrot','z[n]^p+c',3,2],['Sine Julia','sin(z[n])+c',2,1]];
let selectedPreset=0;
presets.forEach(([name],index)=>{const b=document.createElement('button');b.textContent=name;b.setAttribute('aria-pressed',index===0);b.onclick=()=>{selectedPreset=index;[...$('presets').children].forEach((x,i)=>x.setAttribute('aria-pressed',i===index));};$('presets').append(b);});
$('apply-preset').onclick=()=>{const [,equation,p,cSource]=presets[selectedPreset],next=structuredClone(state);next.equation=equation;next.initial=cSource===2?'0':'pixel';next.historySize=1;next.variables=[{name:'c',source:cSource,real:-.745,imag:.186},{name:'p',source:0,real:p,imag:0}];try{rebuild(next);state=next;controls();reset();message('Preset applied · appearance preserved');}catch(e){message(e.message,true);}};
$('julia').onclick=()=>{const next=structuredClone(state),c=next.variables.find(v=>v.name==='c');if(!c)return message('Add a variable named c to convert to Julia',true);c.source=1;next.initial='pixel';try{rebuild(next);state=next;controls();reset();message('Julia: right-click to pick c');}catch(e){message(e.message,true);}};
$('apply').onclick=apply;$('apply-parameters').onclick=apply;$('reset').onclick=reset;
for(const key of [...Object.keys(numeric).filter(k=>!['iterations','bailout','historySize'].includes(k)),...colours])$(key).addEventListener('input',()=>{try{const next=structuredClone(state);next[key]=colours.includes(key)?$(key).value:Number($(key).value);validate(next);state=next;if(key.startsWith('gradient'))gradient();requestDraw();}catch(e){message(e.message,true);}});
$('add-variable').onclick=()=>{const values=[...$('variables').querySelectorAll('[data-field=name]')].map(x=>x.value);let n=1;while(values.includes(`v${n}`))n++;const previous=state.variables;try{state.variables=[...readControls().variables,{name:`v${n}`,source:0,real:0,imag:0}];variables();}catch(e){state.variables=previous;message(e.message,true);}};
for(const tab of document.querySelectorAll('[data-tab]'))tab.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(t=>t.setAttribute('aria-selected',t===tab));document.querySelectorAll('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==tab.dataset.tab);};
$('show-panel').onclick=()=>document.body.classList.toggle('panel-hidden');$('help').onclick=()=>$('help-dialog').showModal();
function coordinate(x,y){const r=canvas.getBoundingClientRect();return [state.center[0]+(x-r.left-r.width/2)*state.span/r.height,state.center[1]-(y-r.top-r.height/2)*state.span/r.height];}
function zoom(factor,x,y){const before=coordinate(x,y);state.span=Math.max(.00002,Math.min(100,state.span*factor));const after=coordinate(x,y);state.center=state.center.map((v,k)=>v+before[k]-after[k]);requestDraw();if(state.span===.00002)message('WebGL single-precision zoom limit reached');}
function pick(x,y){const point=coordinate(x,y);state.variables.filter(v=>v.source===1).forEach(v=>[v.real,v.imag]=point);variables();message(`Picked ${point[0].toPrecision(8)} ${point[1]<0?'−':'+'} ${Math.abs(point[1]).toPrecision(8)}i`);requestDraw();}
let pointers=new Map();
canvas.addEventListener('pointerdown',e=>{canvas.focus();canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(e.button===2||e.shiftKey)pick(e.clientX,e.clientY);});
canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;const previous=pointers.get(e.pointerId),other=[...pointers.entries()].find(([id])=>id!==e.pointerId)?.[1];if(e.buttons===2||e.shiftKey)pick(e.clientX,e.clientY);else if(other){const old=Math.hypot(previous.x-other.x,previous.y-other.y),now=Math.hypot(e.clientX-other.x,e.clientY-other.y);if(now>1&&old>1)zoom(old/now,(e.clientX+other.x)/2,(e.clientY+other.y)/2);}else{const h=canvas.getBoundingClientRect().height;state.center[0]-=(e.clientX-previous.x)*state.span/h;state.center[1]+=(e.clientY-previous.y)*state.span/h;requestDraw();}pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});});
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>pointers.delete(e.pointerId));
canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(Math.max(-200,Math.min(200,e.deltaY))*.002),e.clientX,e.clientY);},{passive:false});
canvas.addEventListener('keydown',e=>{if(e.key==='Home'){e.preventDefault();reset();}if(e.key==='Tab'){e.preventDefault();document.body.classList.toggle('panel-hidden');}if(['+','=','-'].includes(e.key)){e.preventDefault();const r=canvas.getBoundingClientRect();zoom(e.key==='-'?1.25:.8,r.left+r.width/2,r.top+r.height/2);}});
new ResizeObserver(requestDraw).observe($('viewport'));
function download(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('save').onclick=()=>{try{const next=readControls();rebuild(next);state=next;gradient();requestDraw();download(new Blob([JSON.stringify({format:'fractal-studio-web',version:1,state},null,2)],{type:'application/json'}),'fractal-studio.json');message('Workspace saved');}catch(e){message(e.message,true);}};
$('load').onclick=()=>$('file').click();$('file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>128000)throw Error('Workspace is too large');const data=JSON.parse(await file.text());if(data.format!=='fractal-studio-web'||data.version!==1)throw Error('Expected a Fractal Studio Web v1 workspace');const next=validate(data.state);rebuild(next);state=next;controls();gradient();requestDraw();message('Workspace opened');}catch(error){message(error.message,true);}finally{e.target.value='';}};
$('export').onclick=()=>{if(!program||lost)return message('Renderer unavailable',true);draw();canvas.toBlob(blob=>{if(blob)download(blob,'fractal-studio.png');else message('PNG export failed',true);},'image/png');};
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;pending=false;message('GPU context lost. Waiting for recovery…',true);});
canvas.addEventListener('webglcontextrestored',()=>{lost=false;program=null;texture=null;try{rebuild(state);gradient();requestDraw();message('GPU context restored');}catch(e){message(e.message,true);}});
controls();
try{
  gl=canvas.getContext('webgl2',{antialias:false,alpha:false,preserveDrawingBuffer:true});if(!gl)throw Error('WebGL 2 is unavailable. Enable hardware acceleration or try a current browser.');
  const response=await fetch('./fragment.glsl');if(!response.ok)throw Error('Could not load the renderer');shaderTemplate=await response.text();rebuild(validate(state));gradient();draw();message('Ready · all rendering happens locally');
}catch(e){message(e.message,true);}
