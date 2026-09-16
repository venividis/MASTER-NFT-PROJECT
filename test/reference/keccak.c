/* Adapted for a test-only command line from XKCP's readable implementation.
Implementation by the Keccak Team: Guido Bertoni, Joan Daemen, Michaël Peeters,
Gilles Van Assche and Ronny Van Keer. https://keccak.team/
To the extent possible under law, the implementer has waived all copyright and
related or neighboring rights to the source code. CC0-1.0.
Source: XKCP/XKCP/Standalone/CompactFIPS202/C/Keccak-readable-and-compact.c
Reviewed source blob: b8932ecb6a2455341cea192f3e6cb12295170944.
Changes: comments condensed, Keccak-256 wrapper / hex stdin CLI appended.
This is independent of the table-driven JavaScript codec in web/evm.mjs. */
#include <stdint.h>
#include <string.h>
#include <stdio.h>
#include <stdlib.h>
typedef uint64_t tKeccakLane;
static uint64_t load64(const uint8_t*x){uint64_t u=0;for(int i=7;i>=0;--i){u<<=8;u|=x[i];}return u;}
static void store64(uint8_t*x,uint64_t u){for(unsigned i=0;i<8;++i){x[i]=u;u>>=8;}}
static void xor64(uint8_t*x,uint64_t u){for(unsigned i=0;i<8;++i){x[i]^=u;u>>=8;}}
#define ROL64(a,offset) ((((uint64_t)a)<<offset)^(((uint64_t)a)>>(64-offset)))
#define IDX(x,y) ((x)+5*(y))
#define readLane(x,y) load64((uint8_t*)state+sizeof(tKeccakLane)*IDX(x,y))
#define writeLane(x,y,lane) store64((uint8_t*)state+sizeof(tKeccakLane)*IDX(x,y),lane)
#define XORLane(x,y,lane) xor64((uint8_t*)state+sizeof(tKeccakLane)*IDX(x,y),lane)
int LFSR86540(uint8_t*LFSR){int result=((*LFSR)&0x01)!=0;if(((*LFSR)&0x80)!=0)(*LFSR)=((*LFSR)<<1)^0x71;else(*LFSR)<<=1;return result;}
void KeccakF1600_StatePermute(void*state){unsigned round,x,y,j,t;uint8_t LFSRstate=0x01;
for(round=0;round<24;round++){
 {tKeccakLane C[5],D;for(x=0;x<5;x++)C[x]=readLane(x,0)^readLane(x,1)^readLane(x,2)^readLane(x,3)^readLane(x,4);for(x=0;x<5;x++){D=C[(x+4)%5]^ROL64(C[(x+1)%5],1);for(y=0;y<5;y++)XORLane(x,y,D);}}
 {tKeccakLane current,temp;x=1;y=0;current=readLane(x,y);for(t=0;t<24;t++){unsigned r=((t+1)*(t+2)/2)%64;unsigned Y=(2*x+3*y)%5;x=y;y=Y;temp=readLane(x,y);writeLane(x,y,ROL64(current,r));current=temp;}}
 {tKeccakLane temp[5];for(y=0;y<5;y++){for(x=0;x<5;x++)temp[x]=readLane(x,y);for(x=0;x<5;x++)writeLane(x,y,temp[x]^((~temp[(x+1)%5])&temp[(x+2)%5]));}}
 {for(j=0;j<7;j++){unsigned bitPosition=(1<<j)-1;if(LFSR86540(&LFSRstate))XORLane(0,0,(tKeccakLane)1<<bitPosition);}}
}}
#define MIN(a,b) ((a)<(b)?(a):(b))
void Keccak(unsigned rate,unsigned capacity,const unsigned char*input,unsigned long long inputByteLen,unsigned char suffix,unsigned char*output,unsigned long long outputByteLen){uint8_t state[200];unsigned rateInBytes=rate/8,blockSize=0,i;if((rate+capacity)!=1600||rate%8!=0)return;memset(state,0,sizeof(state));while(inputByteLen>0){blockSize=MIN(inputByteLen,rateInBytes);for(i=0;i<blockSize;i++)state[i]^=input[i];input+=blockSize;inputByteLen-=blockSize;if(blockSize==rateInBytes){KeccakF1600_StatePermute(state);blockSize=0;}}state[blockSize]^=suffix;if((suffix&0x80)!=0&&blockSize==rateInBytes-1)KeccakF1600_StatePermute(state);state[rateInBytes-1]^=0x80;KeccakF1600_StatePermute(state);while(outputByteLen>0){blockSize=MIN(outputByteLen,rateInBytes);memcpy(output,state,blockSize);output+=blockSize;outputByteLen-=blockSize;if(outputByteLen>0)KeccakF1600_StatePermute(state);}}
int main(void){unsigned char*input=malloc(1<<20);if(!input)return 2;size_t len=fread(input,1,1<<20,stdin);if(ferror(stdin)||!feof(stdin)){free(input);return 3;}unsigned char out[32];Keccak(1088,512,input,len,0x01,out,32);for(int i=0;i<32;i++)printf("%02x",out[i]);puts("");free(input);return 0;}
