import {
  ethereum,
  crypto,
  log,

  Address,
  Bytes,
  BigDecimal,
  BigInt,
  ByteArray,
  Entity,
} from "@graphprotocol/graph-ts";

import {
  LineOfCredit,
  Token,
  LineReserve,
  SupportedToken,
  Spigot,
  Escrow,
  SpigotController,
  SpigotRevenueSummary,
  Position,
  MarketplaceActor,
  Proposal,

  AddCreditEvent,
  IncreaseCreditEvent,
  SetRatesEvent,
  AddSpigotEvent,
} from "../../generated/schema"

import {
  SecuredLine,
} from "../../generated/templates/SecuredLine/SecuredLine"

import {
  Escrow as EscrowContract,
} from "../../generated/templates/Escrow/Escrow"

import { Oracle } from "../../generated/templates/SecuredLine/Oracle"
import { ERC20 } from "../../generated/templates/Spigot/ERC20";
import { readValue } from "./prices/common/utils";
import { BIGDECIMAL_1E18 } from "./prices/common/constants";

import { getUsdPrice } from "./prices";

export const BIG_INT_ZERO = new BigInt(0);
export const BIG_INT_ONE = new BigInt(1);
export const BIG_DECIMAL_ZERO = new BigDecimal(BIG_INT_ZERO);
export const NOT_IN_QUEUE = new BigInt(42069); // Can't set undefined so # to represent a position does not need to be repayed.
export const ZERO_ADDRESS_STR = "0x0000000000000000000000000000000000000000";
export const ZERO_ADDRESS = Address.fromString(ZERO_ADDRESS_STR);
export const BYTES32_ZERO_STR = "0x00000000000000000000000000000000000000000000000000000000000000";

// Line statuses
export const STATUS_UNINITIALIZED = "UNINITIALIZED";
export const STATUS_ACTIVE = "ACTIVE";
export const STATUS_LIQUIDATABLE = "LIQUIDATABLE";
export const STATUS_DEFAULT = "DEFAULT";
export const STATUS_REPAID = "REPAID";
export const STATUS_INSOLVENT = "INSOLVENT";

// mapping of number (enum index) emmitted on status update event to string value
export const STATUSES = new Map<i32, string>();
STATUSES.set(0, STATUS_UNINITIALIZED);
STATUSES.set(1, STATUS_ACTIVE);
STATUSES.set(2, STATUS_LIQUIDATABLE);
STATUSES.set(3, STATUS_REPAID);
STATUSES.set(4, STATUS_INSOLVENT);


// Position statuses
export const POSITION_STATUS_PROPOSED = "PROPOSED";
export const POSITION_STATUS_OPENED  = "OPEN";
export const POSITION_STATUS_CLOSED = "CLOSED";

// apparently undefined/null doesnt exist so use empty strings for null (including Entity IDs)
function isNullString(thing: string = ""): bool {
  return thing.length > 0  ? false : true;
}
function isNullToken(thing: Token = new Token("")): bool {
  return isNullString(thing.id);
}

export function getQueueIndex(line: string, id: string): i32 {
  const c = SecuredLine.bind(Address.fromString(line));
  for(let i = BIG_INT_ZERO; i < new BigInt(100); i.plus(BIG_INT_ONE)) {
    if(c.ids(i).toHexString() === id) return i.toI32();
  }
  return NOT_IN_QUEUE.toI32();
}

export function updateCollateralValue(line: Address): BigDecimal {
  let escrowAddr = readValue<Address>(SecuredLine.bind(line).try_escrow(), ZERO_ADDRESS);
  if(escrowAddr === ZERO_ADDRESS) return BIG_DECIMAL_ZERO;
  let valInt = readValue<BigInt>(EscrowContract.bind(escrowAddr).try_getCollateralValue(), BIG_INT_ZERO);
  let value = new BigDecimal(valInt);
  let escrow =  new Escrow(escrowAddr.toHexString())
  escrow.collateralValue = value;
  escrow.save();
  return value;
}

/** @returns [ usd value of amount in 8 decimals , usd price of 1 token in 8 decimals]*/
export function getValue(
  oracle: Address,
  token: Token,
  amount: BigInt,
  block: BigInt
): BigDecimal[] {
  // use this one
  // const price = getUsdPrice(Address.fromString(token.id), new BigDecimal(amount));
  // const value = price.times(new BigDecimal(amount));

  // not this one
  // const prc = Oracle.bind(oracle).getLatestAnswer(Address.fromString(token.id));
  // const price: BigInt = prc.lt(BIG_INT_ZERO) ? BIG_INT_ZERO : prc;
  // const decimals = BigInt.fromI32(token.decimals);
  // const value = new BigDecimal(amount.times(price).div(decimals));



  // update metadata on token so we can search historical prices in subgraph
  // updateTokenPrice(price, block, "", token);

  // return [value, price];
  return [BIG_DECIMAL_ZERO, BIG_DECIMAL_ZERO];
}

/**
 * @notice wrapper for getValue if we dont already have data loaded.
 * @returns [ usd value of amount in 8 decimals , usd price of 1 token in 8 decimals]
 * */
export function getValueForPosition(
  credit: string,
  token: string,
  amount: BigInt,
  block: BigInt
): BigDecimal[] {
  return getValue(
    Address.fromBytes(LineOfCredit.load(credit)!.oracle),
    Token.load(token)!,
    amount,
    block
  );
}

/**
 *
 * @dev can ass in either token or address depending on which you have available
 */
export function updateTokenPrice(
  price: BigDecimal,
  block: BigInt,
  address: string, // TODO: remove support, only Token.
  token: Token
): void {
  log.warning("update price tkn/addr price - {}, {}, {}", [token.id, address, price.toString()]);

  // if(isNullToken(token)) {
  //   if(isNullString(address)) return;
  //   else token = getOrCreateToken(address);
  // }
  // token.lastPriceBlockNumber = block;
  // token.lastPriceUSD = price;
  // token.save()
  // return;
}

export function getOrCreateToken(address: string, isOracle: bool = false): Token {
  let token = Token.load(address);
  if(token) return token;
  const erc = ERC20.bind(Address.fromString(address));
  token = new Token(address);

  // get token metadata
  token.decimals = readValue<BigInt>(erc.try_decimals(), new BigInt(18)).toI32();
  token.symbol = readValue<string>(erc.try_symbol(), "TOKEN");
  token.name = readValue<string>(erc.try_name(), "Unknown Token");

  if(!isOracle) {
    token.save();
  }
  return token;
}

export function getEventId(type: string, txHash: Bytes, logIndex: BigInt): string {
  return `${type}-${txHash.toHexString()}-${logIndex.toString()}`
}

export function getOrCreateSpigot(controller: Address, contract: Address): Spigot {
  const id = `${controller.toHexString()}-${contract.toHexString()}`
  let spigot = Spigot.load(id);
  if(!spigot) {
    spigot = new Spigot(id);
  }

  return spigot;
}


// Null entities for when we need to link an entity but it hasnt been created yet (e.g. Credit during mutualConsent proposals

export function getNullToken(): string {
  const address = BYTES32_ZERO_STR
  let token = Token.load(address);
  if(token) return token.id;
  token = new Token(address);

  // get token metadata
  token.decimals =new BigInt(18).toI32();
  token.symbol = "NULL";
  token.name = "Null Dummy Token";

  token.save();
  return token.id;
}

export function getNullPosition(): string {
  getNullProposal(); // ensure dependencies
  const id = BYTES32_ZERO_STR;
  let position =  Position.load(id);
  if(position) return position.id;

  position = new Position(id);
  position.line = getNullLine();

  const lender = new MarketplaceActor(`${ZERO_ADDRESS_STR}1`);
  lender.save();

  position.borrower = ZERO_ADDRESS_STR;
  position.lender = lender.id;

  position.token = getNullToken();
  position.queue = NOT_IN_QUEUE.toI32();
  position.deposit = BIG_INT_ZERO;
  position.principal = BIG_INT_ZERO;
  position.interestAccrued = BIG_INT_ZERO;
  position.interestRepaid = BIG_INT_ZERO;
  position.totalInterestEarned = BIG_INT_ZERO;
  position.principalUsd = BIG_DECIMAL_ZERO;
  position.interestUsd = BIG_DECIMAL_ZERO;
  position.dRate = 0;
  position.fRate = 0;

  position.save();
  return position.id;
}

export function getNullProposal(): string {
  const id = BYTES32_ZERO_STR;
  let prop = Proposal.load(id);
  if(!prop) {
    prop = new Proposal(id);
    prop.mutualConsentFunc = '0x00000000';
    prop.maker =  ZERO_ADDRESS_STR;
    prop.proposedAt =  BIG_INT_ZERO;
    prop.position =  BYTES32_ZERO_STR;
    prop.msgData =  '';
    prop.line =  ZERO_ADDRESS_STR;
    prop.save();
  }

  return prop.id;
}

export function getNullLine(): string {
  const id = ZERO_ADDRESS_STR;
  let line = LineOfCredit.load(id);
  if(!line) {
    line = new LineOfCredit(id);

    const borrower = new MarketplaceActor(id);
    borrower.save();

    line.borrower = id;
    line.start =  0;
    line.end =  0;
    line.status =  STATUS_UNINITIALIZED;
    line.defaultSplit =  0;
    line.dex =  Bytes.fromHexString(id);
    line.borrower =  id;
    line.oracle =  Bytes.fromHexString(id);
    line.arbiter =  id;

    line.save();
  }

  return line.id;
}

export function getOrCreateRevenueSummary(spigotController: Address, token: Address, now: BigInt): SpigotRevenueSummary {
  const controller = spigotController.toHexString();
  const id = `${controller}-${token.toHexString()}`
  let summary = SpigotRevenueSummary.load(id);
  if(!summary) {
    summary = new SpigotRevenueSummary(id);
    summary.token = token.toHexString();
    summary.totalVolume = BIG_INT_ZERO;
    summary.totalVolumeUsd = BIG_DECIMAL_ZERO;
    summary.timeOfFirstIncome = now;
    summary.timeOfLastIncome = now;
    summary.controller = controller;
  }

  return summary;
}

export function getOrCreateLineReserve(line: Address, token: Address): LineReserve {
  const lineId = line.toHexString();
  const reserveId = `${lineId}-${token.toHexString()}`
  let reserves = LineReserve.load(reserveId);
  if(!reserves) {
    reserves = new LineReserve(reserveId);
    reserves.token = token.toHexString();
    reserves.amount = BIG_INT_ZERO;
    reserves.line = lineId;
  }

  return reserves;
}


// export function createLineEvent<T>(Type: T, event: any): T {
//   let lineEvent = new Type();
//   return lineEvent;
// }

