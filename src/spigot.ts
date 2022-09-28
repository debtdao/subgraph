import {
  BigDecimal,
} from "@graphprotocol/graph-ts"

import {

  AddSpigot,
  RemoveSpigot,
  ClaimRevenue,
  ClaimEscrow,
  UpdateOwnerSplit,
  UpdateWhitelistFunction,
} from "../generated/templates/Spigot/Spigot"
  
import {
  SecuredLine,
  TradeSpigotRevenue,
} from "../generated/templates/SecuredLine/SecuredLine"

import {
  Token,
  Spigot,
  SpigotController,

  WhitelistFunctionEvent,
  AddSpigotEvent,
  RemoveSpigotEvent,
  ClaimRevenueEvent,
  ClaimEscrowEvent,
  TradeRevenueEvent,
  UpdateOwnerSplitEvent,
} from "../generated/schema"
import {
  STATUSES,
  NOT_IN_QUEUE,
  BIG_INT_ZERO,
  BIG_DECIMAL_ZERO,
  ZERO_ADDRESS,

  getValue,
  getQueueIndex,
  getEventId,
  getOrCreateToken,
  updateTokenPrice,
} from "./utils";
import { getUsdPrice } from "./prices";


export function handleAddSpigot(event: AddSpigot): void {
  let spigot = new Spigot(`${event.address.toHexString()}-${event.params.revenueContract}`);
  spigot.controller = event.address.toHexString(); // controller must exist already because it emitted event
  spigot.contract = event.params.revenueContract;
  // ensure that token exists
  const token = getOrCreateToken(event.params.token.toHexString());
  spigot.token = token.id;
  spigot.active = true;
  spigot.startTime = event.block.timestamp;
  spigot.totalVolume = BIG_INT_ZERO;
  spigot.totalVolumeUsd = BIG_DECIMAL_ZERO;
  spigot.ownerSplit = event.params.ownerSplit.toI32();
  spigot.save();

  const eventId = getEventId( event.block.number, event.logIndex);
  let spigotEvent = new AddSpigotEvent(eventId);
  spigotEvent.spigot = spigot.id;
  spigotEvent.block = spigot.startTime;
  spigotEvent.revenueToken = token.id;
  spigotEvent.timestamp = event.block.timestamp;
  spigotEvent.save();
}

export function handleRemoveSpigot(event: RemoveSpigot): void {
  let spigot = new Spigot(`${event.address}-${event.params.revenueContract}`);
  spigot.active = false;

  spigot.save();

  const eventId = getEventId(event.block.number, event.logIndex);
  let spigotEvent = new RemoveSpigotEvent(eventId);
  spigotEvent.spigot = spigot.id;
  spigotEvent.block = event.block.number;
  spigotEvent.revenueToken = event.params.token.toHexString();
  spigotEvent.timestamp = event.block.timestamp;
  spigotEvent.save();
}


export function handleClaimRevenue(event: ClaimRevenue): void {
  let spigot = Spigot.load(`${event.address}-${event.params.revenueContract}`)!;
  
  spigot.escrowed = spigot.escrowed.plus(event.params.escrowed);
  spigot.totalVolume = spigot.totalVolume.plus(event.params.amount);
  // use generic price oracle to accomodate wide range of revenue tokens
  let value = getUsdPrice(event.params.token, new BigDecimal(event.params.amount));
  spigot.totalVolumeUsd = spigot.totalVolumeUsd.plus(value);
  
  spigot.save();
  const token = event.params.token.toHexString();
  // update price in subgraph for revenue token potentially not tracked by oracle
  updateTokenPrice(
    value.div(new BigDecimal(event.params.amount)),
    event.block.number,
    token,
    getOrCreateToken(token)
  );
  
  const eventId = getEventId(event.block.number, event.logIndex);
  let spigotEvent = new ClaimRevenueEvent(eventId);
  spigotEvent.spigot = `${event.address}-${event.params.revenueContract}`;
  spigotEvent.block = event.block.number;
  spigotEvent.timestamp = event.block.timestamp;
  spigotEvent.revenueToken = token; // already exists from AddSpigot
  spigotEvent.escrowed = spigot.escrowed;
  spigotEvent.netIncome = event.params.amount.minus(spigot.escrowed);
  spigotEvent.value = value;

  spigotEvent.save();
}

export function handleUpdateOwnerSplit(event: UpdateOwnerSplit): void {
  let spigot = new Spigot(`${event.address}-${event.params.revenueContract}`);
  spigot.ownerSplit = event.params.split;

  spigot.save();
  
  const eventId = getEventId(event.block.number, event.logIndex);
  let spigotEvent = new UpdateOwnerSplitEvent(eventId);

  spigotEvent.spigot = `${event.address}-${event.params.revenueContract}`;
  spigotEvent.block = event.block.number;
  spigotEvent.timestamp = event.block.timestamp;
  
  spigotEvent.save();
}

export function handleClaimEscrow(event: ClaimEscrow): void {
  let spigot = Spigot.load(event.params.token.toHexString())!;
  spigot.escrowed = spigot.escrowed.minus(event.params.amount);
  spigot.save();

  
  let token = event.params.token.toHexString();

  const eventId = getEventId(event.block.number, event.logIndex);
  let spigotEvent = new ClaimEscrowEvent(eventId);
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


// technically event is generated in Line contract but makes more sense to store code here
export function handleTradeRevenue(event: TradeSpigotRevenue): void {
  const eventId = getEventId(event.block.number, event.logIndex);
  const line = SecuredLine.bind(event.address);
  let spigotEvent = new TradeRevenueEvent(eventId);

  spigotEvent.spigot = `${line.spigot()}-${event.logIndex}`
  spigotEvent.block = event.block.number;
  spigotEvent.timestamp = event.block.timestamp;

  spigotEvent.revenueToken = event.params.revenueToken.toHexString(); // Token entity already exists from AddSpigot
  spigotEvent.sold = event.params.revenueTokenAmount;
  spigotEvent.debtToken = event.params.debtToken.toHexString(); // Token entity already exists from AddCredit
  spigotEvent.bought = event.params.debtTokensBought;
  
  // we dont necessarily have an oracle for revenue tokens so  get best dex price
  // Can compare dex price vs trade execution price
  const revenueTokenValue = getUsdPrice(event.params.revenueToken, new BigDecimal(spigotEvent.sold));
  // can also derive from debt token price oracle
  // const revenueTokenValue = spigotEvent.sold
  //   .times(BigInt.fromString(data[1].toString()))
  //   .div(spigotEvent.bought);
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
  
  spigotEvent.save();


}
