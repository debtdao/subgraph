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
  getOrCreateToken,
  getOrCreateCollateralToken
} from "./utils/utils";

export function handleCollateralToken(event: FeedConfirmed): void {
  let contractAddress = event.params.asset.toHexString();

  // Add tokens in Chainlink Feed Registry to Token entity
  let token = getOrCreateToken(contractAddress);
  token.save();

  // Add tokens in Chainlink Feed Registry to CollateralToken entity
  let collateralToken = getOrCreateCollateralToken(contractAddress);
  collateralToken.save()
}