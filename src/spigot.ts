import {
  BigDecimal,
  log,
} from "@graphprotocol/graph-ts"

import {

  AddSpigot,
  RemoveSpigot,
  ClaimRevenue,
  ClaimOwnerTokens,
  ClaimOperatorTokens,
  UpdateOwnerSplit,
  UpdateWhitelistFunction,
  UpdateOwner,
  UpdateOperator,
} from "../generated/templates/Spigot/Spigot"
  
import {
  SecuredLine,
  TradeSpigotRevenue,
} from "../generated/templates/SecuredLine/SecuredLine"

import {
  Token,
  Spigot,
  SpigotController,
  SpigotRevenueSummary,

  AddSpigotEvent,
  RemoveSpigotEvent,
  ClaimRevenueEvent,
  ClaimOwnerTokensEvent,
  ClaimOperatorTokensEvent,
  TradeRevenueEvent,
  UpdateOwnerSplitEvent,
  UpdateOwnerEvent,
  UpdateOperatorEvent,
  UpdateWhitelistFunctionEvent,
} from "../generated/schema"
import {
  BIG_DECIMAL_ZERO,
  BYTES32_ZERO_STR,

  getValue,
  getEventId,
  getOrCreateToken,
  updateTokenPrice,
  getOrCreateRevenueSummary,
  BIG_INT_ZERO,
} from "./utils/utils";
import { getUsdPrice } from "./utils/prices";
import { BIGINT_ZERO } from "./utils/prices/common/constants";


export function handleAddSpigot(event: AddSpigot): void {
  let spigot = new Spigot(`${event.address.toHexString()}-${event.params.revenueContract.toHexString()}`);
  log.warning('adding spigot with tx data - {}', [event.transaction.input.toHexString()])
  spigot.controller = event.address.toHexString(); // controller must exist already because it emitted event
  spigot.contract = event.params.revenueContract;
  // ensure that token exists
  spigot.active = true;
  spigot.startTime = event.block.timestamp;
  spigot.claimFunc = event.params.claimFnSig;
  spigot.transferFunc = event.params.trsfrFnSig;
  spigot.totalVolumeUsd = BIG_DECIMAL_ZERO;
  spigot.ownerSplit = event.params.ownerSplit.toI32();
  spigot.save();

  const eventId = getEventId(typeof AddSpigotEvent, event.transaction.hash, event.logIndex);
  let spigotEvent = new AddSpigotEvent(eventId);
  spigotEvent.spigot = spigot.id;
  spigotEvent.block = spigot.startTime;
  spigotEvent.revenueToken = BYTES32_ZERO_STR;
  spigotEvent.timestamp = event.block.timestamp;
  spigotEvent.save();
}

export function handleRemoveSpigot(event: RemoveSpigot): void {
  let spigot = new Spigot(`${event.address.toHexString()}-${event.params.revenueContract.toHexString()}`);
  spigot.active = false;

  spigot.save();

  const eventId = getEventId(typeof RemoveSpigotEvent, event.transaction.hash, event.logIndex);
  let spigotEvent = new RemoveSpigotEvent(eventId);
  spigotEvent.spigot = spigot.id;
  spigotEvent.block = event.block.number;
  spigotEvent.revenueToken = event.params.token.toHexString();
  spigotEvent.timestamp = event.block.timestamp;
  spigotEvent.save();
}


export function handleClaimRevenue(event: ClaimRevenue): void {
  let spigot = Spigot.load(`${event.address.toHexString()}-${event.params.revenueContract.toHexString()}`)!;
  const revenueSummary = getOrCreateRevenueSummary(event.address, event.params.token, event.block.timestamp);
  const revenue = event.params.amount
  const ownerTokens = event.params.escrowed
  // use generic price oracle to accomodate wide range of revenue tokens
  let value = getUsdPrice(event.params.token, new BigDecimal(revenue));
  
  spigot.totalVolumeUsd = spigot.totalVolumeUsd.plus(value);
  spigot.save();
  
  const token = event.params.token.toHexString();
  // need to getOrCreate sumary because new tokens can be added anytime arbitrarily
  
  revenueSummary.ownerTokens = (revenueSummary.ownerTokens ? revenueSummary.ownerTokens! : BIGINT_ZERO)
    .plus(ownerTokens);
  revenueSummary.operatorTokens = (revenueSummary.operatorTokens ? revenueSummary.operatorTokens! : BIGINT_ZERO)
    .plus(revenue.minus(ownerTokens));
  revenueSummary.totalVolumeUsd = revenueSummary.totalVolumeUsd.plus(value);
  revenueSummary.totalVolume = revenueSummary.totalVolume.plus(revenue);
  revenueSummary.timeOfLastIncome = event.block.timestamp;
  revenueSummary.save();

  // update price in subgraph for revenue token potentially not tracked by oracle
  updateTokenPrice(
    value.div(new BigDecimal(revenue)),
    event.block.number,
    token,
    getOrCreateToken(token)
  );
  
  const eventId = getEventId(typeof ClaimRevenueEvent, event.transaction.hash, event.logIndex);
  let spigotEvent = new ClaimRevenueEvent(eventId);
  spigotEvent.spigot = `${event.address.toHexString()}-${event.params.revenueContract.toHexString()}`;
  spigotEvent.controller = event.address.toHexString();
  spigotEvent.block = event.block.number;
  spigotEvent.timestamp = event.block.timestamp;
  spigotEvent.revenueToken = token; // already exists from AddSpigot
  spigotEvent.amount = revenue;
  spigotEvent.escrowed = ownerTokens;
  spigotEvent.netIncome = revenue.minus(ownerTokens);
  spigotEvent.value = value;
  

  spigotEvent.save();
}

export function handleUpdateOwnerSplit(event: UpdateOwnerSplit): void {
  let spigot = new Spigot(`${event.address.toHexString()}-${event.params.revenueContract.toHexString()}`);
  spigot.ownerSplit = event.params.split;

  spigot.save();
  
  const eventId = getEventId(typeof UpdateOwnerSplitEvent, event.transaction.hash, event.logIndex);
  let spigotEvent = new UpdateOwnerSplitEvent(eventId);

  spigotEvent.spigot = `${event.address.toHexString()}-${event.params.revenueContract.toHexString()}`;
  spigotEvent.block = event.block.number;
  spigotEvent.timestamp = event.block.timestamp;
  
  spigotEvent.save();
}

export function handleClaimOwnerTokens(event: ClaimOwnerTokens): void {
  let spigot = SpigotRevenueSummary.load(`${event.address.toHexString()}-${event.params.token.toHexString()}`)!;
  spigot.ownerTokens = spigot.ownerTokens!.minus(event.params.amount);
  spigot.save();

  
  let token = event.params.token.toHexString();

  const eventId = getEventId(typeof ClaimOwnerTokensEvent, event.transaction.hash, event.logIndex);
  let spigotEvent = new ClaimOwnerTokensEvent(eventId);
  spigotEvent.controller = event.address.toHexString();
  spigotEvent.block = event.block.number;
  spigotEvent.timestamp = event.block.timestamp;
  spigotEvent.amount = event.params.amount;
  spigotEvent.value = getUsdPrice(event.params.token, new BigDecimal(spigotEvent.amount));
  spigotEvent.to = event.params.owner.toHexString();
  spigotEvent.save();
  
  // update price in subgraph for revenue token potentially not tracked by oracle
  updateTokenPrice(
    spigotEvent.value.div(new BigDecimal(spigotEvent.amount)),
    event.block.number,
    token,
    getOrCreateToken(token)
  );
}


export function handleClaimOperatorTokens(event: ClaimOperatorTokens): void {
  let spigot = SpigotRevenueSummary.load(`${event.address.toHexString()}-${event.params.token.toHexString()}`)!;
  spigot.operatorTokens = spigot.operatorTokens!.minus(event.params.amount);
  spigot.save();

  
  let token = event.params.token.toHexString();

  const eventId = getEventId(typeof ClaimOperatorTokensEvent, event.transaction.hash, event.logIndex);
  let spigotEvent = new ClaimOperatorTokensEvent(eventId);
  spigotEvent.controller = event.address.toHexString();
  spigotEvent.block = event.block.number;
  spigotEvent.timestamp = event.block.timestamp;
  spigotEvent.amount = event.params.amount;
  spigotEvent.value = getUsdPrice(event.params.token, new BigDecimal(spigotEvent.amount));
  spigotEvent.to = event.params.operator.toHexString();
  spigotEvent.save();
  
  // update price in subgraph for revenue token potentially not tracked by oracle
  updateTokenPrice(
    spigotEvent.value.div(new BigDecimal(spigotEvent.amount)),
    event.block.number,
    token,
    getOrCreateToken(token)
  );
}

// technically event is generated in Line contract but makes more sense to store code here
export function handleTradeRevenue(event: TradeSpigotRevenue): void {
  const eventId = getEventId(typeof TradeRevenueEvent, event.transaction.hash, event.logIndex);
  const line = SecuredLine. bind(event.address);
  let spigotEvent = new TradeRevenueEvent(eventId);

  spigotEvent.spigot = `${line.spigot()}-${event.logIndex}`
  spigotEvent.block = event.block.number;
  spigotEvent.timestamp = event.block.timestamp;

  spigotEvent.revenueToken = event.params.revenueToken.toHexString(); // Token entity already exists from AddSpigot
  spigotEvent.sold = event.params.revenueTokenAmount;
  spigotEvent.debtToken = event.params.debtToken.toHexString(); // Token entity already exists from AddCredit
  spigotEvent.bought = event.params.debtTokensBought;
  
  log.warning('TRADE SPIGOT REVENUE rev/credit amounts -- {}/{} -- {}/{}', [
    spigotEvent.revenueToken,
    spigotEvent.sold.toString(),
    spigotEvent.debtToken,
    spigotEvent.bought.toString()
  ])
  // we dont necessarily have an oracle for revenue tokens so  get best dex price
  // Can compare dex price vs trade execution price
  const revenueTokenValue = getUsdPrice(event.params.revenueToken, new BigDecimal(spigotEvent.sold));
  // can also derive from debt token price oracle
  // const revenueTokenValue = spigotEvent.sold
  //   .times(BigInt.fromString(data[1].toString()))
    // .div(spigotEvent.bought);
  let token = event.params.revenueToken.toHexString();
  // update price in subgraph for revenue token potentially not tracked by oracle
  updateTokenPrice(
    revenueTokenValue.div(new BigDecimal(spigotEvent.sold)),
    event.block.number,
    token,
    getOrCreateToken(token)
  );

  
  spigotEvent.soldValue = revenueTokenValue;
  
  // get second oracle opinion on pricing. can show slippage/price imapct of trade
  const data = getValue(
    line.oracle(),
    Token.load(spigotEvent.debtToken)!,
    spigotEvent.bought,
    spigotEvent.block
  );
  spigotEvent.boughtValue = data[0];
  

  spigotEvent.amount = spigotEvent.bought;
  spigotEvent.value= spigotEvent.boughtValue;

  spigotEvent.save();


}


export function handleUpdateOwner(event: UpdateOwner): void {
  // load entity to use current owner
  let spigot = SpigotController.load(event.address.toHexString())!;

  
  const eventId = getEventId(typeof UpdateOwnerEvent, event.transaction.hash, event.logIndex);
  let spigotEvent = new UpdateOwnerEvent(eventId);

  spigotEvent.oldOwner = spigot.owner;
  spigotEvent.newOwner = event.params.newOwner;
  spigotEvent.controller = event.address.toHexString();
  spigotEvent.block = event.block.number;
  spigotEvent.timestamp = event.block.timestamp;
  spigotEvent.save();

  // update spigot after so we can use old owner for event data
  spigot.owner = event.params.newOwner;
  spigot.save();
}

export function handleUpdateOperator(event: UpdateOperator): void {
  // load entity to use current Operator
  let spigot = SpigotController.load(event.address.toHexString())!;

  
  const eventId = getEventId(typeof UpdateOperatorEvent, event.transaction.hash, event.logIndex);
  let spigotEvent = new UpdateOperatorEvent(eventId);

  spigotEvent.oldOperator = spigot.operator;
  spigotEvent.newOperator = event.params.newOperator;
  spigotEvent.controller = event.address.toHexString();
  spigotEvent.block = event.block.number;
  spigotEvent.timestamp = event.block.timestamp;
  spigotEvent.save();

  // update spigot after so we can use old Operator for event data
  spigot.operator = event.params.newOperator;
  spigot.save();
}


export function handleUpdateWhitelistFunction(event: UpdateWhitelistFunction): void {
  // load entity to use current Operator
  let spigot = SpigotController.load(event.address.toHexString())!;

  
  const eventId = getEventId(typeof UpdateWhitelistFunctionEvent, event.transaction.hash, event.logIndex);
  let spigotEvent = new UpdateWhitelistFunctionEvent(eventId);

  spigotEvent.func = event.params.func;
  spigotEvent.whitelisted = event.params.allowed;
  spigotEvent.controller = event.address.toHexString();
  spigotEvent.block = event.block.number;
  spigotEvent.timestamp = event.block.timestamp;
  spigotEvent.save();
}
