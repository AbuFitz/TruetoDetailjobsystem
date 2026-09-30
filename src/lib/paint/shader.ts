/**
 * The paint shader: one full-screen fragment program that draws a curved car
 * panel under a studio, half swirl-marked haze and half mirror clearcoat, with
 * the 50/50 line between them. No geometry and no assets, so there is nothing
 * to download and no model to get wrong: the surface is computed.
 *
 * Coordinates are y-up in the 0..1 panel. LITE drops the second swirl layer
 * for phones and slower GPUs.
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
#define SW_LAYERS 1
#else
#define SW_LAYERS 2
#endif
uniform vec2 u_res;
uniform float u_level;
uniform vec3 u_torch;
uniform vec2 u_tilt;
uniform float u_pass;
uniform float u_focus;
varying vec2 v_uv;

float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float lum(vec3 c){ return dot(c,vec3(0.299,0.587,0.114)); }
float g(float v,float c,float w){ float t=(v-c)/w; return exp(-t*t); }

// A studio: a big overhead softbox, two long strip lights, a cool sky, a dark
// floor with the brand orange bouncing up from it. 'rough' widens and dims
// every light, which is exactly what haze does to a reflection.
vec3 env(vec3 r,float rough){
  float k = 1.0+rough*7.0;
  float att = 1.0/(1.0+rough*3.0);
  vec3 col = vec3(0.008,0.010,0.016);
  col += vec3(0.05,0.07,0.10)*smoothstep(-0.05,1.0,r.y);
  col += vec3(1.0,0.98,0.95)*3.4*g(r.y,0.86,0.09*k)*g(r.x,u_tilt.x*0.3,0.55*k)*att;
  col += vec3(1.0)*16.0*g(r.y,0.40+u_tilt.y*0.05,0.014*k)*g(r.x,0.0,1.2)*att;
  col += vec3(1.0)*0.9*g(r.y,0.40+u_tilt.y*0.05,0.10*k)*att;
  col += vec3(0.86,0.93,1.0)*8.0*g(r.y,0.19,0.010*k)*g(r.x,0.25,1.1)*att;
  col += vec3(1.0,0.96,0.9)*3.5*g(r.x,0.72+u_tilt.x*0.28,0.05*k)*g(r.y,0.25,0.42)*att;
  float fl = smoothstep(0.02,-0.6,r.y);
  col += vec3(0.91,0.29,0.05)*1.1*fl*smoothstep(-1.0,-0.15,r.y)*att;
  col += vec3(1.0,0.36,0.07)*11.0*g(r.y,-0.46,0.016*k)*g(r.x,0.1,1.3)*att;
  col += vec3(1.0,0.34,0.06)*0.7*g(r.y,-0.46,0.12*k)*att;
  return col;
}

// Fine swirl marks: many thin partial arcs around scattered centres.
float swirls(vec2 p){
  float acc = 0.0;
  for(int k=0;k<SW_LAYERS;k++){
    float sc = k==0 ? 5.2 : 8.6;
    vec2 q = p*sc + float(k)*11.7;
    vec2 ic = floor(q);
    for(int j=-1;j<=1;j++){
      for(int i=-1;i<=1;i++){
        vec2 cell = ic+vec2(float(i),float(j));
        vec2 c = cell+vec2(hash(cell+float(k)*5.1),hash(cell.yx+2.3+float(k)*3.3));
        vec2 d = (q-c)/sc;
        float rad = length(d);
        float maxR = 0.075+0.09*hash(cell+8.8);
        if(rad<maxR){
          float spacing = 0.0028+0.0034*hash(cell+4.4);
          float idx = floor(rad/spacing);
          float ring = abs(fract(rad/spacing)-0.5)*spacing;
          float w = 0.95/u_res.y;
          float line = smoothstep(w,0.0,ring);
          float ang = atan(d.y,d.x);
          float a0 = hash(cell+idx*0.13)*6.2832;
          float span = 0.25+1.3*hash(cell+idx*0.31+1.0);
          float da = abs(mod(ang-a0+3.14159,6.28318)-3.14159);
          float arc = smoothstep(span,span*0.55,da);
          float inten = 0.12+0.88*pow(hash(vec2(idx,hash(cell))),2.0);
          acc += line*arc*inten*smoothstep(maxR,maxR*0.45,rad);
        }
      }
    }
  }
  return clamp(acc,0.0,1.0);
}

void main(){
  vec2 uv = v_uv;
  float aspect = u_res.x/u_res.y;
  vec2 p = vec2(uv.x*aspect,uv.y);
  float y = uv.y;

  // Layout: dark glass on top (where the headline sits), a chrome line, then
  // the door: a shoulder, a crease, a convex belly and a sill roll-under.
  float yw = 0.55;
  float glass = smoothstep(yw-0.004,yw+0.004,y);
  float yc = 0.385+0.026*sin(p.x*0.9+0.4)+0.010*sin(p.x*2.6);
  float aboveCrease = smoothstep(yc-0.012,yc+0.012,y);
  float ny;
  float lowerN = mix(-0.34,0.20,smoothstep(0.05,yc,y)) + 0.6*(1.0-smoothstep(0.0,0.07,y));
  float shoulderN = 0.50+0.10*smoothstep(yc,yw,y);
  ny = mix(lowerN,shoulderN,aboveCrease);
  ny = mix(ny,0.30,glass);
  ny += 0.07*sin(p.x*1.8+1.1);
  float nx = 0.34*sin(p.x*1.05+0.5)+0.08*sin(p.x*3.1);
  vec3 n = normalize(vec3(nx,ny,1.0));
  vec3 r = reflect(vec3(0.0,0.0,-1.0),n);

  float xs = uv.x+(uv.y-0.5)*0.10;
  float edgeX = u_level;
  float polished = 1.0-smoothstep(edgeX-0.005,edgeX+0.005,xs);
  float rough = mix(0.80,0.0,polished);

  float sw = swirls(p)*(1.0-polished)*(1.0-glass);

  // Torch
  vec2 dv = vec2((uv.x-u_torch.x)*aspect,uv.y-u_torch.y);
  float td = length(dv);
  vec3 L = normalize(vec3(-dv,0.5));
  vec3 rt = reflect(-L,n);
  float spec = pow(max(rt.z,0.0),mix(30.0,420.0,polished));
  float lobe = exp(-td*td/0.10)*u_torch.z;
  float pool = exp(-td*td/0.06)*u_torch.z;

  float F = 0.06+0.45*pow(1.0-n.z,3.0);
  vec3 e = env(r,rough);
  vec3 deep = vec3(0.008,0.011,0.019);
  vec3 col = deep+e*F*mix(0.8,1.0,polished);

  // Unpolished: a milky veil; reflections soft and washed out.
  vec3 milk = vec3(0.17,0.18,0.20)+0.35*e*F;
  col = mix(col,milk,(1.0-polished)*0.55);
  // Scratches light up only where light finds them.
  float glint = 0.035+0.6*lum(e)*F*6.0+3.0*lobe;
  col += vec3(1.0,0.97,0.93)*sw*glint*0.62;
  col += vec3(1.0,0.97,0.92)*spec*u_torch.z*mix(0.3,1.5,polished);
  col += vec3(1.0,0.93,0.85)*pool*0.06;

  // Glass: near black, faint sky reflection.
  float sweep = exp(-pow((uv.x+(y-0.8)*0.9-0.34)/0.11,2.0))*0.9+exp(-pow((uv.x+(y-0.8)*0.9-0.62)/0.03,2.0))*0.5;
  vec3 gl = vec3(0.006,0.008,0.012)+vec3(0.10,0.14,0.20)*e.b*0.18+vec3(0.55,0.68,0.85)*0.055*sweep*(0.3+0.7*polished);
  col = mix(col,gl,glass);
  // Chrome window line.
  float chrome = smoothstep(0.0045,0.0,abs(y-yw));
  col += vec3(0.75,0.78,0.82)*chrome*(0.55+0.4*g(uv.x,0.55,0.4));

  // Door cuts.
  float cx1 = uv.x-0.30-0.035*(y-0.4)*(y-0.4);
  float cx2 = uv.x-0.74-0.035*(y-0.4)*(y-0.4);
  float cutMask = step(0.05,y)*step(y,yw);
  float cut = max(smoothstep(0.0020,0.0004,abs(cx1)),smoothstep(0.0020,0.0004,abs(cx2)))*cutMask;
  float lip = max(smoothstep(0.0016,0.0,abs(cx1-0.0032)),smoothstep(0.0016,0.0,abs(cx2-0.0032)))*cutMask;
  col *= 1.0-0.85*cut;
  col += vec3(0.6)*lip*0.10*polished;

  // The 50/50 line.
  float ln = smoothstep(0.0032,0.0,abs(xs-edgeX));
  float show = step(0.002,edgeX)*step(edgeX,0.999);
  vec3 lineC = mix(vec3(1.0,0.93,0.86),vec3(0.91,0.29,0.05),smoothstep(0.8,0.1,y));
  col += lineC*ln*show*1.1;
  col += vec3(0.91,0.29,0.05)*0.05*exp(-abs(xs-edgeX)*38.0)*show*(1.0-polished);

  float ps = smoothstep(0.09,0.0,abs(xs-u_pass))*step(0.0,u_pass);
  col += vec3(1.0,0.97,0.93)*ps*0.4*polished;
  col += vec3(0.05)*exp(-pow((uv.x-u_focus)/0.05,2.0))*step(0.0,u_focus);

  float vig = smoothstep(1.3,0.3,length((uv-0.5)*vec2(0.9,1.3)));
  col *= mix(0.6,1.0,vig);
  col = 1.0-exp(-col*1.5);
  col += (hash(gl_FragCoord.xy)-0.5)/255.0;
  gl_FragColor = vec4(col,1.0);
}
`;
