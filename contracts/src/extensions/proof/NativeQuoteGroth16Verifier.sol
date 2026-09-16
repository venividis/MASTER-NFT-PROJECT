// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity >=0.7.0 <0.9.0;

contract NativeQuoteGroth16Verifier {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 7803505472036992860473450382877530536593089728513750896109437661348517746779;
    uint256 constant alphay  = 3236557890883786037810263855601002471910224155537079949250844155365247277036;
    uint256 constant betax1  = 11554595082793628475887526987612521983244102585180927028560164911398700162176;
    uint256 constant betax2  = 1864876344436505836350621943223831227270706815857767237628877793278199463873;
    uint256 constant betay1  = 3062415099415962215162479841049342306058491565633708944879232033207200411063;
    uint256 constant betay2  = 21301749161407806585862989411331662358307951159084322018166047717257341709425;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 10712503415513652638304194346816888253129610209760326591262617489388301396767;
    uint256 constant deltax2 = 3528280103325142090420746142321581578355295641647839728650170907878131859099;
    uint256 constant deltay1 = 15495415611110163031751402256591942389210743304427960011992756180163189084836;
    uint256 constant deltay2 = 696235801237071275139270911919916082396004184847587596428827162212057970153;

    
    uint256 constant IC0x = 21697041218758153802611205695106757592112322748788895498781445269147858346736;
    uint256 constant IC0y = 15050545049542867201677880098421762080633272997677433996451400393529970771202;
    
    uint256 constant IC1x = 4752464576089841926218591170504399187734501239552903376510854343376861965466;
    uint256 constant IC1y = 1925170481444567776781661224502223218212555766543001173575272153489644088776;
    
    uint256 constant IC2x = 244078066068229982953046952536185959138854787498670575378227232139323722558;
    uint256 constant IC2y = 2320966446689537164959269017216043566049924719100270716575710839485719848893;
    
    uint256 constant IC3x = 10365145848324129690674625252387253549077488452008886322997376607492449192127;
    uint256 constant IC3y = 4124973286182206654978314283085897521666893599735880406070515437258482395408;
    
    uint256 constant IC4x = 14153695281079288875096121511439576763018926454071116544384810396430700902580;
    uint256 constant IC4y = 5470657329086280310275515215706046800897476022485870840318844549704362951128;
    
    uint256 constant IC5x = 6603422400361026490002681777637906138736309713325176184281898396760648082421;
    uint256 constant IC5y = 6059733531017569897628625137505779804115526100145914728756908115213704457463;
    
    uint256 constant IC6x = 14922957566039478161860533550065636330578517090304757757430288395598223920527;
    uint256 constant IC6y = 7604817132284217334469919069201901672965200543364124235758843308323476494702;
    
    uint256 constant IC7x = 14829858594978977788055322161225450898865516503671967000675283173408827538942;
    uint256 constant IC7y = 19562740358558226054114790446750949510478969389948431995865374469758058255355;
    
    uint256 constant IC8x = 943597366042802043663241844048696461208746935161759165802939140739854144442;
    uint256 constant IC8y = 2183095996129658015786044400123389818427226128434534811039233978268631185644;
    
    uint256 constant IC9x = 5769094010034437697498509593119887950652393382053797629662098258925196972037;
    uint256 constant IC9y = 16001497659082065639862638017270569052105083423262071123150618737539248273801;
    
    uint256 constant IC10x = 11596987219380199157686298745627048738533056593532330928365226748735036259187;
    uint256 constant IC10y = 14402460999125709880650012907430201900724670226233359170506719547419222206907;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[10] calldata _pubSignals) public view returns (bool) {
        assembly {
            function checkField(v) {
                if iszero(lt(v, r)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }
            
            // G1 function to multiply a G1 value(x,y) to value in an address
            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
                let _pPairing := add(pMem, pPairing)
                let _pVk := add(pMem, pVk)

                mstore(_pVk, IC0x)
                mstore(add(_pVk, 32), IC0y)

                // Compute the linear combination vk_x
                
                g1_mulAccC(_pVk, IC1x, IC1y, calldataload(add(pubSignals, 0)))
                
                g1_mulAccC(_pVk, IC2x, IC2y, calldataload(add(pubSignals, 32)))
                
                g1_mulAccC(_pVk, IC3x, IC3y, calldataload(add(pubSignals, 64)))
                
                g1_mulAccC(_pVk, IC4x, IC4y, calldataload(add(pubSignals, 96)))
                
                g1_mulAccC(_pVk, IC5x, IC5y, calldataload(add(pubSignals, 128)))
                
                g1_mulAccC(_pVk, IC6x, IC6y, calldataload(add(pubSignals, 160)))
                
                g1_mulAccC(_pVk, IC7x, IC7y, calldataload(add(pubSignals, 192)))
                
                g1_mulAccC(_pVk, IC8x, IC8y, calldataload(add(pubSignals, 224)))
                
                g1_mulAccC(_pVk, IC9x, IC9y, calldataload(add(pubSignals, 256)))
                
                g1_mulAccC(_pVk, IC10x, IC10y, calldataload(add(pubSignals, 288)))
                

                // -A
                mstore(_pPairing, calldataload(pA))
                mstore(add(_pPairing, 32), mod(sub(q, calldataload(add(pA, 32))), q))

                // B
                mstore(add(_pPairing, 64), calldataload(pB))
                mstore(add(_pPairing, 96), calldataload(add(pB, 32)))
                mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
                mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

                // alpha1
                mstore(add(_pPairing, 192), alphax)
                mstore(add(_pPairing, 224), alphay)

                // beta2
                mstore(add(_pPairing, 256), betax1)
                mstore(add(_pPairing, 288), betax2)
                mstore(add(_pPairing, 320), betay1)
                mstore(add(_pPairing, 352), betay2)

                // vk_x
                mstore(add(_pPairing, 384), mload(add(pMem, pVk)))
                mstore(add(_pPairing, 416), mload(add(pMem, add(pVk, 32))))


                // gamma2
                mstore(add(_pPairing, 448), gammax1)
                mstore(add(_pPairing, 480), gammax2)
                mstore(add(_pPairing, 512), gammay1)
                mstore(add(_pPairing, 544), gammay2)

                // C
                mstore(add(_pPairing, 576), calldataload(pC))
                mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

                // delta2
                mstore(add(_pPairing, 640), deltax1)
                mstore(add(_pPairing, 672), deltax2)
                mstore(add(_pPairing, 704), deltay1)
                mstore(add(_pPairing, 736), deltay2)


                let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)

                isOk := and(success, mload(_pPairing))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, pLastMem))

            // Validate that all evaluations ∈ F
            
            checkField(calldataload(add(_pubSignals, 0)))
            
            checkField(calldataload(add(_pubSignals, 32)))
            
            checkField(calldataload(add(_pubSignals, 64)))
            
            checkField(calldataload(add(_pubSignals, 96)))
            
            checkField(calldataload(add(_pubSignals, 128)))
            
            checkField(calldataload(add(_pubSignals, 160)))
            
            checkField(calldataload(add(_pubSignals, 192)))
            
            checkField(calldataload(add(_pubSignals, 224)))
            
            checkField(calldataload(add(_pubSignals, 256)))
            
            checkField(calldataload(add(_pubSignals, 288)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
