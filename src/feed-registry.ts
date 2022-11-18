import {
  log,
  Address,
  Bytes,
  BigInt,
  BigDecimal,
} from "@graphprotocol/graph-ts"

import {
  Token,
  CollateralToken
} from "../generated/schema"

import {
  FeedConfirmed
} from "../generated/FeedRegistry/FeedRegistry"

import {
  getOrCreateToken
  // getOrCreateCollateralToken,
} from "./utils/utils";

export function handleCollateralToken(event: FeedConfirmed): void {
  let contractAddress = event.params.asset.toHexString();
  let collateralToken = getOrCreateToken(contractAddress);
  // let collateralToken = getOrCreateCollateralToken(contractAddress);

  // let oracleToken = CollateralToken.load(contractAddress);
  // if (!oracleToken) {
  //   oracleToken = new CollateralToken(contractAddress);
  //   oracleToken =
  // }
  // oracleToken.save()

  // collateralToken.save();
  collateralToken.save();
}