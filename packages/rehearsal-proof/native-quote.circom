pragma circom 2.1.6;
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/poseidon.circom";

// Mirrors NativeMarket.amountOut and its one-hop reserve update, not EVM execution.
// Every multiplication of integer economic values is bounded below the BN254 field.
template NativeQuote() {
    signal input contextHi;
    signal input contextLo;
    signal input amount;
    signal input reserveIn;
    signal input reserveOut;
    signal input minimum;
    signal output outputAmount;
    signal output nextReserveIn;
    signal output nextReserveOut;
    signal output statement;
    signal effective;
    signal denominator;
    signal numerator;
    signal remainder;
    effective <== amount * 9970;
    denominator <== reserveIn * 10000 + effective;
    numerator <== effective * reserveOut;
    outputAmount <-- numerator \ denominator;
    remainder <-- numerator % denominator;
    denominator * outputAmount === numerator - remainder;
    nextReserveIn <== reserveIn + amount;
    nextReserveOut <== reserveOut - outputAmount;

    component ranges[7];
    ranges[0] = Num2Bits(112); ranges[0].in <== amount;
    ranges[1] = Num2Bits(112); ranges[1].in <== reserveIn;
    ranges[2] = Num2Bits(112); ranges[2].in <== reserveOut;
    ranges[3] = Num2Bits(112); ranges[3].in <== minimum;
    ranges[4] = Num2Bits(112); ranges[4].in <== outputAmount;
    ranges[5] = Num2Bits(112); ranges[5].in <== nextReserveIn;
    ranges[6] = Num2Bits(112); ranges[6].in <== nextReserveOut;
    component nonzero[5];
    nonzero[0] = IsZero(); nonzero[0].in <== amount; nonzero[0].out === 0;
    nonzero[1] = IsZero(); nonzero[1].in <== reserveIn; nonzero[1].out === 0;
    nonzero[2] = IsZero(); nonzero[2].in <== reserveOut; nonzero[2].out === 0;
    nonzero[3] = IsZero(); nonzero[3].in <== minimum; nonzero[3].out === 0;
    nonzero[4] = IsZero(); nonzero[4].in <== outputAmount; nonzero[4].out === 0;
    component denominatorRange = Num2Bits(127); denominatorRange.in <== denominator;
    component remainderRange = Num2Bits(127); remainderRange.in <== remainder;
    component floorCheck = LessThan(127);
    floorCheck.in[0] <== remainder; floorCheck.in[1] <== denominator; floorCheck.out === 1;
    component slippage = LessEqThan(112);
    slippage.in[0] <== minimum; slippage.in[1] <== outputAmount; slippage.out === 1;
    component contextRanges[2];
    contextRanges[0] = Num2Bits(128); contextRanges[0].in <== contextHi;
    contextRanges[1] = Num2Bits(128); contextRanges[1].in <== contextLo;
    // Explicitly constrain both complete 128-bit context limbs together with the quote.
    component binding = Poseidon(8);
    binding.inputs[0] <== contextHi; binding.inputs[1] <== contextLo;
    binding.inputs[2] <== amount; binding.inputs[3] <== reserveIn;
    binding.inputs[4] <== reserveOut; binding.inputs[5] <== minimum;
    binding.inputs[6] <== outputAmount; binding.inputs[7] <== remainder;
    statement <== binding.out;
}
component main {public [contextHi, contextLo, amount, reserveIn, reserveOut, minimum]} = NativeQuote();
