import * as utils from "../common/utils";
import * as constants from "../common/constants";
import { CustomPriceType } from "../common/types";
import { Address, BigDecimal, BigInt } from "@graphprotocol/graph-ts";
import { YearnLens } from "../../../../generated/templates/Spigot/YearnLens";

export function getYearnLens(network: string): YearnLens {
  return YearnLens.bind(Address.fromString(constants.YEARN_LENS_CONTRACT_ADDRESS.get(network)));
}

export function getTokenPriceFromYearnLens(tokenAddr: Address, network: string): CustomPriceType {
  const yearnLens = getYearnLens(network);

  if (!yearnLens) {
    return new CustomPriceType();
  }

  let tokenPrice: BigDecimal = utils
    .readValue<BigInt>(yearnLens.try_getPriceUsdcRecommended(tokenAddr), constants.BIGINT_ZERO)
    .toBigDecimal();

  return CustomPriceType.initialize(tokenPrice, constants.DEFAULT_USDC_DECIMALS);
}
