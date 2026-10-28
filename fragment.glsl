#version 300 es
precision highp float;
precision highp int;
out vec4 frag;
uniform vec2 center,constantC,paramA,paramB,z0;
%3
 vec2 past[%5];float currentN=0.0;bool invalidHistory=false;
 vec2 historyAt(vec2 index){if(index.y!=0.0||isnan(index.x)||isinf(index.x)||floor(index.x)!=index.x){invalidHistory=true;return vec2(0);}if(index.x<0.0)return negativeAt(index.x);if(index.x<max(0.0,currentN-float(%5-1))||index.x>currentN){invalidHistory=true;return vec2(0);}return past[clamp(int(mod(index.x,float(%5))),0,%5-1)];}
 vec2 cmod(vec2 x,vec2 y){if(y.y!=0.0||y.x==0.0){invalidHistory=true;return vec2(0);}return x-y.x*floor(x/y.x);}
uniform float scale,bailout;
uniform vec2 resolution,marker;
uniform int iterations,aSource,bSource,cSource,palette,showMarker,quadratic;
uniform float frequency,phase,smoothing;
uniform int calibrationPass;
uniform vec2 convergenceRange;
uniform sampler2D gradientTexture;
uniform int colourMode, escapeSolid, interiorGradient, convergenceEnabled, trapShape, interiorPalette, trapViewScaled;
uniform vec3 escapeColour, interiorColour;
uniform float tolerance, trapReal, trapImag, trapRadius;
uniform sampler2D interiorTexture;
vec3 gradient(float t){return texture(gradientTexture,vec2(clamp(t,0.0,1.0),0.5)).rgb;}
vec2 mul(vec2 a,vec2 b){return vec2(a.x*b.x-a.y*b.y,a.x*b.y+a.y*b.x);}
vec2 divide(vec2 a,vec2 b){return vec2(dot(a,b),a.y*b.x-a.x*b.y)/dot(b,b);}
// WebGL 2 adaptation of the desktop renderer: all complex operations use highp floats.
vec2 clog(vec2 z){return vec2(float(log(float(length(z)))),float(atan(float(z.y),float(z.x))));}
vec2 cexp(vec2 z){return float(exp(float(z.x)))*vec2(cos(float(z.y)),sin(float(z.y)));}
vec2 cpow(vec2 z,vec2 w){
 if(w.y==0.0&&w.x==2.0)return mul(z,z);
 if(w.y==0.0&&w.x==3.0)return mul(mul(z,z),z);
 if(w.y==0.0&&w.x==4.0){vec2 q=mul(z,z);return mul(q,q);}
 if(dot(z,z)==0.0&&w.y==0.0&&w.x>0.0)return vec2(0);
 return cexp(mul(w,clog(z)));
}
vec2 csin(vec2 z){return vec2(sin(float(z.x))*cosh(float(z.y)),cos(float(z.x))*sinh(float(z.y)));}
vec2 ccos(vec2 z){return vec2(cos(float(z.x))*cosh(float(z.y)),-sin(float(z.x))*sinh(float(z.y)));}
vec2 conjugate(vec2 z){return vec2(z.x,-z.y);}
vec2 componentAbs(vec2 z){return abs(z);}
vec2 magnitude(vec2 z){return vec2(length(z),0);}
vec2 realPart(vec2 z){return vec2(z.x,0);}
vec2 imagPart(vec2 z){return vec2(z.y,0);}
void main(){
 vec2 pixel=center+vec2(gl_FragCoord.xy-resolution*.5)*(scale/float(resolution.y));
 vec2 c=cSource==2?pixel:constantC,a=aSource==2?pixel:paramA,b=bSource==2?pixel:paramB;
 %4
 float n=0.0;currentN=0.0;vec2 z=%1;past[0]=z;
 int count=0;float radius=0.0;
 bool inside=false;
 if(quadratic!=0){float y2=c.y*c.y,x=c.x-.25,q=x*x+y2;inside=q*(q+x)<=.25*y2||(c.x+1.0)*(c.x+1.0)+y2<=.0625;}
 if(inside)count=iterations;
 bool escaped = false;
 bool converged = false;
 float convergenceCount = 0.0;
 float previousResidual = 0.0;
 float convergenceTolerance = tolerance;
 float trapMinimum = 1e30;
 float residual = 1.0;
 if(!inside) for(int j=0;j<10000;j++) {
     if(j>=iterations) break;
     n=float(j);
     currentN=n;
     z=%2;
     if(invalidHistory) break;
     bool stable = j >= %5-1;
     if(convergenceEnabled!=0) {
         previousResidual=residual;
         residual=0.0;
         for(int k=0;k<%5;k++) {
             float delta=length(z-past[k]);
             residual=max(residual,delta);
             if(delta>convergenceTolerance) stable=false;
         }
     }
     if(convergenceEnabled!=0 && stable) {
         if(!converged) {
             convergenceCount=float(j+1);
             if(j>0 && previousResidual>convergenceTolerance && residual>0.0 && residual<previousResidual) {
                 float fraction=clamp(log(float(previousResidual/convergenceTolerance))/log(float(previousResidual/residual)),0.0,1.0);
                 convergenceCount-=smoothing*(1.0-fraction);
             }
         }
         converged=true;
     } else {
         converged=false;
     }
     if(convergenceEnabled!=0 || %6) past[(j+1) % %5]=z;
     if(colourMode==1) {
         vec2 offset=z-vec2(trapReal,trapImag);
         float distance=length(offset);
         if(trapShape==1) distance=abs(distance-trapRadius);
         if(trapShape==2) distance=min(abs(offset.x),abs(offset.y));
         trapMinimum=min(trapMinimum,distance);
     }
     radius=dot(z,z);
     count=j+1;
     escaped=isnan(radius)||isinf(radius)||radius>bailout*bailout;
     if(escaped) break;
 }
 // The calibration pass executes the identical orbit and fractional crossing metric.
 if(calibrationPass!=0){frag=vec4(convergenceCount,(!escaped&&converged&&!invalidHistory)?1.0:0.0,0,1);return;}
 vec3 rgb=interiorColour;
 if(escaped){float t=float(count);if(radius>1.0&&!isinf(radius))t+=smoothing*(1.0-log(max(log(float(radius))*.5,.0001))/log(2.0));
 float mappingScale=trapViewScaled!=0 ? float(3.0/max(abs(scale),1e-15)) : 1.0;
 float v=t*frequency*mappingScale+phase;
 if(palette==0)rgb=.5+.5*cos(6.2831853*(v+vec3(.02,.19,.36)));
 else if(palette==1)rgb=.5+.5*cos(6.2831853*(v+vec3(.0,.08,.20)));
 else if(palette==2)rgb=.5+.5*cos(6.2831853*(v+vec3(.50,.32,.10)));
 else rgb=vec3(.5+.5*cos(6.2831853*v));
 rgb*=.8+.2*(1.0-exp(-max(t,0.0)*.06));
 if(palette>=4)rgb=gradient(1.0-abs(2.0*fract(v*.5)-1.0));
 }
 if(escaped && escapeSolid!=0) rgb=escapeColour;
 if(!escaped && interiorGradient!=0) {
     // Bounded nonconverging (including periodic) orbits occupy the slow endpoint.
     float extent=convergenceRange.y-convergenceRange.x;
     float progress=converged ? (extent>0.0 ? clamp((convergenceCount-convergenceRange.x)/extent,0.0,1.0) : 0.0) : 1.0;
     float v=clamp(progress+phase,0.0,1.0);
     if(interiorPalette>=4) rgb=texture(interiorTexture,vec2(v,0.5)).rgb;
     else if(interiorPalette==0) rgb=.5+.5*cos(6.2831853*(v+vec3(.02,.19,.36)));
     else if(interiorPalette==1) rgb=.5+.5*cos(6.2831853*(v+vec3(.0,.08,.20)));
     else if(interiorPalette==2) rgb=.5+.5*cos(6.2831853*(v+vec3(.50,.32,.10)));
     else rgb=vec3(.5+.5*cos(6.2831853*v));
 }
 if(colourMode==1) {
     float reference=trapViewScaled!=0 ? max(abs(scale)*0.1,1e-15) : 1.0;
     float proximity=log(1.0+float(reference/max(trapMinimum,reference*1e-12)));
     float v=clamp(1.0-exp(-proximity*max(frequency/0.025,0.001))+phase,0.0,1.0);
     if(palette>=4) rgb=gradient(v);
     else if(palette==0) rgb=.5+.5*cos(6.2831853*(v+vec3(.02,.19,.36)));
     else if(palette==1) rgb=.5+.5*cos(6.2831853*(v+vec3(.0,.08,.20)));
     else if(palette==2) rgb=.5+.5*cos(6.2831853*(v+vec3(.50,.32,.10)));
     else rgb=vec3(.5+.5*cos(6.2831853*v));
 }
 if(showMarker!=0){vec2 d=abs(gl_FragCoord.xy-marker);if((d.x<1.0&&d.y<8.0)||(d.y<1.0&&d.x<8.0))rgb=vec3(1);else if((d.x<2.0&&d.y<9.0)||(d.y<2.0&&d.x<9.0))rgb=vec3(0);}
 if(invalidHistory)rgb=vec3(1.0,0.0,1.0);
 frag=vec4(rgb,1);
}