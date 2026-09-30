/**
 * The paint shader: one full-screen fragment program that draws a curved car
 * panel under a studio. One side is faded, chalky paint; the other is candy
 * orange clearcoat in the brand's own colour, with metallic flake and crisp
 * strip-light reflections. The 50/50 line sits between them, and a torch held
 * over the faded side shows a loupe of the finish underneath. No geometry and
 * no assets: the surface is computed, so there is no model to get wrong.
 *
 * Coordinates are y-up in the 0..1 panel. u_amb (0..1) is a short ambient
 * wake-up in which the lights drift; at 0 the frame is still and matches the
 * posters exactly. LITE uses fewer noise octaves for phones and slower GPUs.
 */
export const VERT =
  "attribute vec2 a;varying vec2 v_uv;void main(){v_uv=a*.5+.5;gl_Position=vec4(a,0.,1.);}";

export function fragmentSource(lite: boolean): string {
  return (lite ? "#define LITE 1\n" : "") + FRAG;
}

const FRAG = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
#ifdef LITE
#define OCT 2
#else
#define OCT 4
#endif
uniform vec2 u_res;
uniform float u_level;
uniform vec3 u_torch;
uniform vec2 u_tilt;
uniform float u_pass;
uniform float u_focus;
uniform float u_time;
uniform float u_amb;
varying vec2 v_uv;

float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x), mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<OCT;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; } return s; }
float lum(vec3 c){ return dot(c,vec3(0.299,0.587,0.114)); }
float g(float v,float c,float w){ float t=(v-c)/w; return exp(-t*t); }

// A studio: a teal sky, an overhead softbox, two long strip lights and a side box.
// The lights drift a little while the surface is waking up, then settle. 'rough'
// widens and dims every light, which is what dullness does to a reflection.
vec3 env(vec3 r,float rough,float drift){
  float k = 1.0+rough*7.0;
  float att = 1.0/(1.0+rough*3.0);
  vec3 col = vec3(0.010,0.013,0.022);
  col += vec3(0.05,0.15,0.24)*smoothstep(-0.05,1.0,r.y);
  col += vec3(1.0,0.97,0.93)*2.6*g(r.y,0.86,0.09*k)*g(r.x,u_tilt.x*0.3+drift*0.6,0.55*k)*att;
  col += vec3(1.0)*20.0*g(r.y,0.40+u_tilt.y*0.05,0.013*k)*g(r.x,0.0,1.2)*att;
  col += vec3(1.0)*1.0*g(r.y,0.40,0.10*k)*att;
  col += vec3(0.86,0.94,1.0)*10.0*g(r.y,0.19+drift*0.03,0.010*k)*g(r.x,0.25,1.1)*att;
  col += vec3(1.0,0.95,0.88)*6.0*g(r.x,0.70+u_tilt.x*0.28+drift,0.05*k)*g(r.y,0.25,0.42)*att;
  float fl = smoothstep(0.02,-0.6,r.y);
  col += vec3(0.9,0.22,0.04)*1.0*fl*smoothstep(-1.0,-0.2,r.y)*att;
  return col;
}

void main(){
  vec2 uv = v_uv;
  float aspect = u_res.x/u_res.y;
  vec2 p = vec2(uv.x*aspect,uv.y);
  float y = uv.y;
  float drift = sin(u_time*0.9)*0.32*u_amb;

  // Panel: glass on top, chrome line, then door: shoulder, crease, belly, sill.
  float yw = 0.82;
  float glass = smoothstep(yw-0.004,yw+0.004,y);
  float yc = 0.52+0.030*sin(p.x*0.9+0.4)+0.012*sin(p.x*2.6);
  float above = smoothstep(yc-0.012,yc+0.012,y);
  float lowerN = mix(-0.34,0.20,smoothstep(0.05,yc,y)) + 0.6*(1.0-smoothstep(0.0,0.07,y));
  float shoulderN = 0.50+0.10*smoothstep(yc,yw,y);
  float ny = mix(lowerN,shoulderN,above);
  ny = mix(ny,0.30,glass);
  ny += 0.07*sin(p.x*1.8+1.1);
  float nx = 0.34*sin(p.x*1.05+0.5)+0.08*sin(p.x*3.1);
  vec3 n = normalize(vec3(nx,ny,1.0));
  vec3 r = reflect(vec3(0.0,0.0,-1.0),n);

  // Where the finish has reached. The edge is slanted, like the light-pass.
  float xs = uv.x+(uv.y-0.5)*0.10;
  float edgeX = u_level;
  float polished = 1.0-smoothstep(edgeX-0.005,edgeX+0.005,xs);

  // Torch, and the loupe: through the haze, a circle of the finish underneath.
  vec2 dv = vec2((uv.x-u_torch.x)*aspect,uv.y-u_torch.y);
  float td = length(dv);
  float R = 0.26;
  float lens = smoothstep(R,R*0.82,td)*u_torch.z;
  float ring = smoothstep(0.008,0.0,abs(td-R))*u_torch.z;
  float fin = max(polished,lens);

  vec3 L = normalize(vec3(-dv,0.5));
  vec3 rt = reflect(-L,n);
  float spec = pow(max(rt.z,0.0),360.0)*u_torch.z;
  float pool = exp(-td*td/0.06)*u_torch.z;

  // ---- Finished: candy orange clearcoat with metallic flake -------------------------------
  vec3 Ld = normalize(vec3(-0.35,0.75,0.55));
  float d = clamp(dot(n,Ld)*0.5+0.5,0.0,1.0);
  vec3 deep = vec3(0.22,0.012,0.0);
  vec3 hot = vec3(1.0,0.27,0.02);
  vec3 base = mix(deep,hot,pow(d,1.5));
  base *= 0.42+0.58*smoothstep(0.0,0.55,y);
  float F = 0.05+0.5*pow(1.0-n.z,3.0)+0.045*smoothstep(0.45,0.9,r.y);
  vec3 eF = env(r,0.0,drift);
  vec3 colF = base*1.05+eF*F;
  float fh = hash(floor(gl_FragCoord.xy/1.1));
  float tw = 0.65+0.35*sin(u_time*3.0+fh*40.0)*u_amb;
  colF += vec3(1.0,0.66,0.36)*step(0.9992,fh)*tw*(0.25+1.6*lum(eF)*F*8.0);
  colF += vec3(1.0,0.96,0.9)*spec*1.6+vec3(1.0,0.9,0.8)*pool*0.07;

  // ---- Faded: chalky, muted, with cloud and grain. Not damaged, just dull -------------------
  vec3 eD = env(r,0.9,drift*0.5);
  vec3 chalk = vec3(0.38,0.29,0.24)*(0.65+0.7*lum(base));
  vec3 colD = mix(base*0.5,chalk,0.78);
  colD *= 0.82+0.42*fbm(p*3.2+vec2(7.0,2.0));
  colD += eD*0.055;
  colD += (hash(gl_FragCoord.xy*1.3+3.1)-0.5)*0.04;
  colD += vec3(1.0,0.93,0.85)*pool*0.05;

  vec3 col = mix(colD,colF,fin);
  col += vec3(1.0,0.9,0.8)*ring*0.9;

  // ---- Glass: deep teal-black with a slow sweep of reflection ------------------------------
  float sweep = exp(-pow((uv.x+(y-0.8)*0.9-0.34-drift*0.4)/0.11,2.0))*0.9+exp(-pow((uv.x+(y-0.8)*0.9-0.62-drift*0.4)/0.03,2.0))*0.5;
  vec3 gl = vec3(0.004,0.010,0.016)+vec3(0.06,0.17,0.26)*lum(eF)*0.05+vec3(0.45,0.72,0.9)*0.06*sweep*(0.35+0.65*fin);
  col = mix(col,gl,glass);

  float chrome = smoothstep(0.0045,0.0,abs(y-yw));
  col += vec3(0.85,0.85,0.88)*chrome*(0.5+0.45*g(uv.x,0.55,0.4));

  // The 50/50 line: a bright edge with a warm glow and a little shimmer.
  float ln = smoothstep(0.0034,0.0,abs(xs-edgeX));
  float show = step(0.002,edgeX)*step(edgeX,0.999);
  vec3 lineC = mix(vec3(1.0,0.95,0.88),vec3(1.0,0.42,0.08),smoothstep(0.85,0.1,y));
  col += lineC*ln*show*(1.05+0.35*sin(y*38.0-u_time*4.0)*u_amb);
  col += vec3(1.0,0.4,0.08)*0.10*exp(-abs(xs-edgeX)*34.0)*show;

  float ps = smoothstep(0.09,0.0,abs(xs-u_pass))*step(0.0,u_pass);
  col += vec3(1.0,0.95,0.88)*ps*0.45*polished;
  col += vec3(0.05)*exp(-pow((uv.x-u_focus)/0.05,2.0))*step(0.0,u_focus);

  float vig = smoothstep(1.3,0.3,length((uv-0.5)*vec2(0.9,1.3)));
  col *= mix(0.62,1.0,vig);
  col = 1.0-exp(-col*1.5);
  col += (hash(gl_FragCoord.xy)-0.5)/255.0;
  gl_FragColor = vec4(col,1.0);
}
`;
