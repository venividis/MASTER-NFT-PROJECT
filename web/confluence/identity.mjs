import {keccak256} from '../evm.mjs';
export const CAPABILITIES=Object.freeze(['exit-live','exits','burners','trade','launch','vault','give','market','world','journal','library','work','ledger','lab','routes','cartridges','agents']);
export function identityVector({seed,chainId='local',collection='preview',tokenId='1',genome=seed}){
 if(!/^0x[\da-f]{64}$/i.test(seed)||!/^0x[\da-f]{64}$/i.test(genome))throw Error('A full 256-bit seed and genome are required.');
 const domain=keccak256(JSON.stringify(['AWE_CONFLUENCE_IDENTITY_V1',String(chainId),String(collection).toLowerCase(),String(tokenId),seed.toLowerCase()]));
 const evolved=domain;
 const axes=Array.from({length:16},(_,i)=>parseInt(evolved.slice(2+i*4,6+i*4),16)/65535);
 return {domain,axes,capabilities:[...CAPABILITIES],hue:176+axes[0]*158,secondaryHue:15+axes[1]*55,petals:5+Math.floor(axes[2]*8),twist:1+axes[3]*3.8,phase:axes[4]*Math.PI*2,orbit:.65+axes[5]*.4,fold:axes[6],spread:.8+axes[7]*.4,precision:axes[8],name:['Aether','Vesper','Solstice','Aurelia','Nacre','Lumin','Helion','Iris'][Math.floor(axes[9]*8)%8]+' '+['Weave','Bloom','Oracle','Tide','Choir','Crown','Prism','Grove'][Math.floor(axes[10]*8)%8],constellation:axes.slice(11)};
}
export function project16(axes,time=0){
 if(axes.length!==16)throw Error('Sixteen coordinates required');
 // Orthogonal Givens rotations in eight coordinate planes, followed by a bounded 3D projection.
 const v=axes.map(x=>x*2-1);
 for(let i=0;i<16;i+=2){const a=time*(.015+i*.002)+i*.31,c=Math.cos(a),s=Math.sin(a),x=v[i],y=v[i+1];v[i]=c*x-s*y;v[i+1]=s*x+c*y;}
 return [0,1,2].map(j=>v.reduce((sum,x,i)=>sum+x*Math.cos((i+1)*(j+1)*Math.PI/17),0)/8);
}
export function particleTarget(i,count,mode,id,time=0,life=0){
 const a=i/count*Math.PI*2,b=i*2.399963229728653,u=((i*16807)%count)/count,v=((i*48271)%count)/count;
 const P=id.petals,T=id.twist,ph=id.phase;
 let x,y,z;
 if(mode==='trade'||mode==='routes'){const t=a*3;const r=1+.22*Math.cos(3*t+ph);x=Math.cos(2*t)*r;y=Math.sin(2*t)*r*.57;z=Math.sin(3*t)*.42;const strand=(i%7-3)*.012;x+=strand;y+=strand*Math.sin(b);}
 else if(mode==='vault'||mode==='ledger'){const ring=i%9,t=a*12;const radius=.32+ring*.087;x=Math.cos(t)*radius;y=(u-.5)*1.55;z=Math.sin(t)*radius;const gate=Math.sin(y*5+ph);x*=.82+.12*gate;z*=.82+.12*gate;}
 else if(mode==='launch'){const t=a*10,r=(1-u)*.84+.12;x=Math.cos(t)*r;y=(u-.43)*2.3;z=Math.sin(t)*r;}
 else if(mode==='journal'||mode==='library'){const r=Math.sqrt(u)*1.35,t=b*.12;const lobe=1+.18*Math.cos(P*t);x=Math.cos(t)*r*lobe;y=Math.sin(t)*r*lobe*.62;z=.20*Math.sin(P*t+r*5+ph);}
 else if(mode==='world'||mode==='cartridges'){const r=.12+Math.pow(u,.5)*1.2,t=b;x=Math.cos(t)*r;y=Math.sin(t)*r*.58;z=.18*Math.sin(x*6+ph)*Math.cos(y*5)+.11*Math.cos(t*P);if(i%5===0){y-=.3;z+=(v-.5)*.9;}}
 else if(mode==='market'||mode==='work'){const t=a*7,r=.86+.22*Math.cos(P*t);x=Math.cos(t)*r;y=Math.sin(t)*r;z=.45*Math.sin(3*t+ph);}
 else if(mode==='agents'||mode==='lab'){const t=a*8;x=Math.sin(3*t+ph);y=Math.sin(4*t)*.8;z=Math.sin(5*t)*.6;}
 else if(mode==='give'){const t=a*2,r=.82+.35*Math.cos(t);x=r*Math.cos(t);y=Math.sin(t)*.8;z=.3*Math.sin(3*t);}
 else {const theta=b,phi=Math.acos(1-2*u);const f=1+.20*Math.sin(P*theta+T*phi+ph)*Math.pow(Math.sin(phi),1.5);const r=.85*f*(.94+.06*v);x=r*Math.sin(phi)*Math.cos(theta);y=r*Math.cos(phi)*1.18;z=r*Math.sin(phi)*Math.sin(theta);if(i%5===0){const t=a*9,rr=.9+.19*Math.cos(P*t+ph);x=rr*Math.cos(t);y=rr*Math.sin(t);z=.28*Math.sin(P*t+T);}}
 const drift=.015*Math.sin(time*.37+b);return [x*id.spread+drift,y*(1+life*.2),z+drift];
}
