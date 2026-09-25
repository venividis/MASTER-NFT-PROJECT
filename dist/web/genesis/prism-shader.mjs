// Atmospheric underlay only. Actual 3D strands live in prism-art.mjs and are
// projected at display resolution, independent of the GPU's sampling budget.
export const prismShader = `
uniform float prismEnabled,prismSpectrum,prismMode;
vec3 prismBackdrop(vec2 uv){
 vec2 q=uv*max(.48,zoom);
 float r=length(q),a=atan(q.y,q.x);
 float breath=sin(t*.11+genome.x*6.)*.012;
 float edge=abs(r-(.96+breath));
 float veil=exp(-edge*edge*19.);
 float threads=pow(.5+.5*sin(a*7.+sin(a*3.+seed.x*9.)*2.+r*21.),8.);
 float cloud=exp(-abs(r-1.3)*4.)*(.35+.65*noise3(vec3(q*3.+seed.xy*7.,t*.012+root.z*5.)));
 vec3 color=vec3(.007,.012,.035);
 color+=vec3(.025,.047,.15)*veil*(.5+threads*.45);
 color+=mix(vec3(.016,.045,.10),vec3(.073,.029,.11),.5+.5*sin(a*2.+root.x*9.))*cloud*min(1.4,prismSpectrum);
 float halo=exp(-r*r*9.);
 color+=vec3(.014,.025,.075)*halo;
 if(genesisDepth>0.){
  float d=length(genesisCamera.xyz);
  color=mix(color,vec3(.008,.014,.041)+vec3(.008,.014,.027)*(.5+.5*sin(a*4.+q.y*2.+genome.y*7.)),1.-smoothstep(.45,2.7,d));
 }
 return color;
}
`;
