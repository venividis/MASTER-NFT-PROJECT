// The GPU and software renderer use the same generated optical kernel.
import {interiorKernel} from './interior-kernel.mjs';
export const interiorShader = `
uniform float genesisDepth,genesisAudio,genesisSamples;
uniform vec4 genesisCamera;
uniform vec2 genesisLook,genesisOptics;
${interiorKernel}
vec3 agInterior(vec2 uv){return agView(uv.x,uv.y);}
`;
