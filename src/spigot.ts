import {
  log,

  Address,
  Bytes,
  BigInt,
  BigDecimal,
} from "@graphprotocol/graph-ts"

import {

  AddSpigot,
  RemoveSpigot,
  ClaimRevenue,
  UpdateWhitelistFunction,
} from "../generated/templates/Spigot/Spigot"
  
import {
  SecuredLoan,
  TradeSpigotRevenue,
} from "../generated/LineOfCredit/SecuredLoan"

import {
  Token,
  Spigot,
  SpigotController,

  WhitelistFunctionEvent,
  AddSpigotEvent,
  RemoveSpigotEvent,
  ClaimRevenueEvent,
  TradeRevenueEvent,
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
  computePositionId,
} from "./utils";


export function handleAddSpigot(event: AddSpigot): void {
  let spigot = new Spigot(`${event.address}-${event.params.revenueContract}`);
  spigot.controller = event.address.toHexString(); // controller must exist already because it emitted event
  spigot.contract = event.params.revenueContract;
  const token = getOrCreateToken(event.params.token.toHexString());
  spigot.token = token.id;
  spigot.ownerSplit = event.params.ownerSplit.toI32();
  spigot.save();

  const eventId = getEventId(event.block.number, event.logIndex);
  let loanEvent = new AddSpigotEvent(eventId);
  loanEvent.spigot = spigot.id;
  loanEvent.block = event.block.number;
  loanEvent.timestamp = event.block.timestamp;
  loanEvent.save();
}

export function handleRemoveSpigot(event: RemoveSpigot): void {
  let spigot = new Spigot(`${event.address}-${event.params.revenueContract}`);
  spigot.ownerSplit = 0;
  spigot.save();

  const eventId = getEventId(event.block.number, event.logIndex);
  let loanEvent = new RemoveSpigotEvent(eventId);
  loanEvent.spigot = spigot.id;
  loanEvent.block = event.block.number;
  loanEvent.timestamp = event.block.timestamp;
  loanEvent.save();
}


export function handleClaimRevenue(event: ClaimRevenue): void {
  const eventId = getEventId(event.block.number, event.logIndex);
  let loanEvent = new ClaimRevenueEvent(eventId);

  loanEvent.spigot = `${event.address}-${event.params.revenueContract}`;
  loanEvent.block = event.block.number;
  loanEvent.timestamp = event.block.timestamp;
  loanEvent.revenueToken = event.params.token.toHexString(); // already exists from AddSpigot
  loanEvent.escrowed = event.params.escrowed;
  loanEvent.netIncome = event.params.amount.minus(loanEvent.escrowed);
  
  loanEvent.save();
}


// technically event is generated in Loan contract but makes more sense to store code here
export function handleTradeRevenue(event: TradeSpigotRevenue): void {
  const eventId = getEventId(event.block.number, event.logIndex);
  const loan = SecuredLoan.bind(event.address);
  let loanEvent = new TradeRevenueEvent(eventId);

  loanEvent.spigot = `${loan.spigot()}-${event.logIndex}`
  loanEvent.block = event.block.number;
  loanEvent.timestamp = event.block.timestamp;

  loanEvent.revenueToken = event.params.revenueToken.toHexString(); // already exists from AddSpigot
  loanEvent.sold = event.params.revenueTokenAmount;
  loanEvent.debtToken = event.params.debtToken.toHexString(); // already exists from AddDebtPosition
  loanEvent.bought = event.params.debtTokensBought;

  const debtTokenPrice = getValue( // implicitly updates
    loan.oracle(),
    Token.load(loanEvent.debtToken)!,
    loanEvent.bought,
    loanEvent.block
  );

  const revenueTokenPrice = loanEvent.bought
    .times(BigInt.fromString(debtTokenPrice.toString()))
    .div(loanEvent.sold);

  updateTokenPrice(
    new BigDecimal(revenueTokenPrice),
    loanEvent.block,
    loanEvent.revenueToken,
    new Token("")
  );
  
  loanEvent.save();
}
