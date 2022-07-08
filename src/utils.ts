import {
  ethereum,
  crypto,
  log,

  Address,
  Bytes,
  BigDecimal,
  BigInt,
  ByteArray,
} from "@graphprotocol/graph-ts";

import {
  LineOfCredit,
  Token,
} from "../generated/schema"

import {
  SecuredLoan,
} from "../generated/LineOfCredit/SecuredLoan"
import { Oracle } from "../generated/LineOfCredit/Oracle"

export const BIG_INT_ZERO = new BigInt(0);
export const BIG_INT_ONE = new BigInt(1);
export const BIG_DECIMAL_ZERO = new BigDecimal(BIG_INT_ZERO);
export const NOT_IN_QUEUE = new BigInt(42069); // Can't set undefined so # to represent a position does not need to be repayed. 
export const ZERO_ADDRESS_STR = "0x0000000000000000000000000000000000000000";
export const ZERO_ADDRESS = Address.fromString(ZERO_ADDRESS_STR);

// apparently undefined/null doesnt exist so use empty strings for null (including Entity IDs)
function isNullString(thing: string = ""): bool {
  return thing.length > 0  ? false : true;
}
function isNullToken(thing: Token = new Token("")): bool {
  return isNullString(thing.id);
}

function encodeAndHash(values: Array<ethereum.Value>): ByteArray {
  return crypto.keccak256(
    ethereum.encode(
      // forcefully cast Value[] -> Tuple
      ethereum.Value.fromTuple( changetype<ethereum.Tuple>(values) )
    )!
  )
}

export function computePositionId(loan: Address, lender: Address, token: Address): string {
  return encodeAndHash([
    ethereum.Value.fromAddress(loan),
    ethereum.Value.fromAddress(lender),
    ethereum.Value.fromAddress(token)
  ]).toHexString();
}

export function getQueueIndex(loan: string, id: string): i32 {
  const c = SecuredLoan.bind(Address.fromString(loan));
  for(let i = BIG_INT_ZERO; i < new BigInt(100); i.plus(BIG_INT_ONE)) {
    if(c.positionIds(i).toHexString() === id) return i.toI32();
  }
  return NOT_IN_QUEUE.toI32();
}

export function getValue(
  oracle: Address,
  token: Token,
  amount: BigInt,
  block: BigInt
): BigDecimal {
  const prc = Oracle.bind(oracle).getLatestAnswer(Address.fromString(token.id));
  const price: BigInt = prc.lt(BIG_INT_ZERO) ? BIG_INT_ZERO : prc;
  const decimals = BigInt.fromString(token.decimals.toString());
  const value = new BigDecimal(amount.times(price).div(decimals));
  
  // update metadata on token so we can search historical prices in subgraph
  updateTokenPrice(value.div(new BigDecimal(amount)), block, "", token);

  return value;
}

/**
 * 
 * @dev can ass in either token or address depending on which you have available
 */
export function updateTokenPrice(
  price: BigDecimal,
  block: BigInt,
  address: string,
  token: Token
): void {
  log.warning("update price tkn/addr - {}, {}", [token.id, address]);

  if(!isNullToken(token)) {
    if(!isNullString(address)) return;
    else token = getOrCreateToken(address);
  }
  token.lastPriceBlockNumber = block;
  token.lastPriceUSD = price;
  token.save()
  return;
}

export function getOrCreateToken(addr: string): Token {
  let token = Token.load(addr);
  if(token) return token;
  token = new Token(addr);

  // get token metadata

  token.save()
  return token;
}

export function getEventId(block: BigInt, logIndex: BigInt): string {
  return `${block}-${logIndex}`
}

export const STATUSES = new Map<i32, string>(); 
// ¿hoo dis
// Loan has been deployed but terms and conditions are still being signed off by parties
STATUSES.set(0, "UNINITIALIZED");
STATUSES.set(1, "INITIALIZED");

// ITS ALLLIIIIVVEEE
// Loan is operational and actively monitoring status
STATUSES.set(2, "ACTIVE");
STATUSES.set(3, "UNDERCOLLATERALIZED");
STATUSES.set(4, "LIQUIDATABLE");
STATUSES.set(5, "DELINQUENT");

// Loan is in distress and paused
STATUSES.set(6, "LIQUIDATING");
STATUSES.set(7, "OVERDRAWN");
STATUSES.set(8, "DEFAULT");
STATUSES.set(9, "ARBITRATION");

// Lön izz ded
// Loan is no longer active, successfully repaid or insolvent
STATUSES.set(10, "REPAID");
STATUSES.set(11, "INSOLVENT");
