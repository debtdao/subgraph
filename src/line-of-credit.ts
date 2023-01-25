import {
  log,
  Address,
  BigDecimal,
} from "@graphprotocol/graph-ts"

import {
  SecuredLine,
  // ABI events
  AddCredit,
  Borrow,

  CloseCreditPosition,
  Default,
  DeployLine,
  InterestAccrued,
  ReservesChanged,
  IncreaseCredit,
  Liquidate,
  RepayInterest,
  RepayPrincipal,
  UpdateStatus,
  WithdrawProfit,
  WithdrawDeposit,
  MutualConsentRegistered,
  TradeSpigotRevenue,
  SetRates,
  MutualConsentRevoked,
} from "../generated/templates/SecuredLine/SecuredLine"

import {
  // main entity types
  LineOfCredit,
  MarketplaceActor,
  SpigotController,
  Escrow,
  Position,
  LineReserve,
  // graph schema events
  AddCreditEvent,
  BorrowEvent,
  ClosePositionEvent,
  DefaultEvent,
  IncreaseCreditEvent,
  InterestAccruedEvent,
  LiquidateEvent,
  ReservesChangedEvent,
  RepayInterestEvent,
  RepayPrincipalEvent,
  UpdateStatusEvent,
  WithdrawProfitEvent,
  WithdrawDepositEvent,
  SetRatesEvent,
  RevokeConsentEvent,
  Proposal,
} from "../generated/schema"

import {
  STATUSES,
  NOT_IN_QUEUE,
  BIG_INT_ZERO,
  BYTES32_ZERO_STR,
  STATUS_UNINITIALIZED,
  STATUS_DEFAULT,

  getNullPosition,
  getValue,
  getQueueIndex,
  getEventId,
  getOrCreateToken,
  getValueForPosition,
  updateCollateralValue,
  BIG_DECIMAL_ZERO,
  POSITION_STATUS_OPENED,
  POSITION_STATUS_CLOSED,
  getOrCreateSpigot,
  getOrCreateLineReserve,
} from "./utils/utils";

import { handleTradeRevenue as _handleTradeRevenue } from "./spigot"
import { handleMutualConsentEvents } from "./utils/mutual-consent";
import { BIGINT_ZERO } from "./utils/prices/common/constants";
import { ProposeFeedCall } from "../generated/FeedRegistry/FeedRegistry";

export function handleDeployLine(event: DeployLine): void {
  // log.warning("new Line addy {}", [event.address.toHexString()]);

  const line = new LineOfCredit(event.address.toHexString());
  const borrower = new MarketplaceActor(event.params.borrower.toHexString());
  const arbiter = new MarketplaceActor(event.params.arbiter.toHexString());
  borrower.save(); // no metadata to add
  arbiter.save(); // no metadata to add

  const LoC = SecuredLine.bind(event.address);

  line.borrower = borrower.id;
  line.type = "Crypto Credit Account";
  line.oracle = event.params.oracle;
  line.arbiter = arbiter .id;
  line.start = event.block.timestamp.toI32();
  line.end = LoC.deadline().toI32();
  line.status = STATUS_UNINITIALIZED; // LoC is UNINITIALIZED on deployment
  line.defaultSplit = LoC.defaultRevenueSplit();
  
  // Add SecuredLine modules
  const spigotAddr = LoC.spigot();
  line.dex =  LoC.swapTarget();
  let spigot = new SpigotController(spigotAddr.toHexString());
  // claim spigot
  spigot.line = line.id;
  spigot.save();

  const escrowAddr = LoC.escrow();

  let escrow = new Escrow(escrowAddr.toHexString());
  // claim escrow
  escrow.line = line.id;
  escrow.save();

  // save line last incase we need to add more data from modules in the future
  line.save();
}

export function handleUpdateStatus(event: UpdateStatus): void {
  // log.warning(
    // "calling handleUpdateStatus addy {}, block {}, status {}",
  //   [event.address.toHexString(), event.block.number.toString(), event.params.status.toString()]
  // );
  if(STATUSES.has(event.params.status.toI32())) { // ensure its a known status with human label
    let credit = new LineOfCredit(event.address.toHexString());
    credit.status = STATUSES.get(event.params.status.toI32());
    credit.save();

    const eventId = getEventId(typeof UpdateStatusEvent, event.transaction.hash, event.logIndex);
    let creditEvent = new UpdateStatusEvent(eventId);
    creditEvent.block = event.block.number;
    creditEvent.timestamp = event.block.timestamp;

    creditEvent.line = event.address.toHexString();
    creditEvent.position = getNullPosition();
    creditEvent.status = event.params.status.toI32();

    creditEvent.save();
  } else {
    log.error('No STATUSES mapped for event', [event.params.status.toString()])
  }
}


export function handleAddCredit(event: AddCredit): void {
  // log.warning("calling handleAddCredit line {}, block {}", [event.address.toHexString(), event.block.number.toString()]);
  const line = LineOfCredit.load(event.address.toHexString())!;
  const token = getOrCreateToken(event.params.token.toHexString());
  const id = event.params.id.toHexString();

  // Credit must exist and fields are filled in from mutual-consent
  const credit = new Position(id);
  credit.deposit =  event.params.deposit;

  // update position proposal on acceptance
  // const prop = credit.proposal ? credit.proposal! : 'null'
  // log.warning('accept proposal: pos id - {}, proposal {}', [id, prop])
  // if(credit.proposal) {
  //   const proposal = new Proposal(credit.proposal!)
  //   proposal.taker = event.transaction.from.toHexString()
  //   proposal.acceptedAt = event.block.timestamp
  //   proposal.save();
  // }

  // log.warning("addCredit existing p ID {}, lender {}, deposit {}", [id, credit.lender, credit.deposit.toString()])
  credit.borrower = line.borrower;
  credit.status = POSITION_STATUS_OPENED;
  credit.save();

  const eventId = getEventId(typeof AddCreditEvent, event.transaction.hash, event.logIndex);
  let creditEvent = new AddCreditEvent(eventId);
  creditEvent.block = event.block.number;
  creditEvent.line = event.address.toHexString();
  creditEvent.position = event.params.id.toHexString();
  creditEvent.timestamp = event.block.timestamp;
  creditEvent.amount = event.params.deposit;
  creditEvent.value = getValue(
    Address.fromBytes(line.oracle),
    token,
    event.params.deposit,
    event.block.number
  )[0];
  creditEvent.save();


}

export function handleIncreaseCredit(event: IncreaseCredit): void {
  // log.warning("calling handleIncreaseCredit line {}, block {}", [event.address.toHexString(), event.block.number.toString()]);
  const id = event.params.id.toHexString();

  let credit = Position.load(id)!; // must have credit position from AddCredit

  credit.deposit = event.params.deposit.plus(credit.deposit);
  credit.save();

  const eventId = getEventId(typeof IncreaseCreditEvent, event.transaction.hash, event.logIndex);
  let creditEvent = new IncreaseCreditEvent(eventId);
  creditEvent.block = event.block.number;
  creditEvent.line = event.address.toHexString();
  creditEvent.position = event.params.id.toHexString();
  creditEvent.timestamp = event.block.timestamp;
  creditEvent.amount = event.params.deposit;
  creditEvent.value = BIG_DECIMAL_ZERO;
  creditEvent.save();
}

export function handleCloseCredit(event: CloseCreditPosition): void {
  let credit = Position.load(event.params.id.toHexString())!;
  credit.status = POSITION_STATUS_CLOSED;
  credit.queue = NOT_IN_QUEUE.toI32(); // TODO figure out how to make null/undefined with type system
  credit.save();
  
  // const prop = credit.proposal ? credit.proposal! : 'null'
  // log.warning("calling handleCloseCredit position {}, proposal {}", [credit.id, prop]);
  // if(credit.proposal) {
  //   const proprosal = new Proposal(credit.proposal!)
  //   proprosal.endedAt = event.block.timestamp;
  //   proprosal.save()
  // }

  const eventId = getEventId(typeof ClosePositionEvent, event.transaction.hash, event.logIndex);
  let creditEvent = new ClosePositionEvent(eventId);
  creditEvent.block = event.block.number;
  creditEvent.position = event.params.id.toHexString();
  creditEvent.line = event.address.toHexString();
  creditEvent.timestamp = event.block.timestamp;
    // compatability
  creditEvent.amount = BIG_INT_ZERO;
  creditEvent.value = BIG_DECIMAL_ZERO;

  creditEvent.save();
}

export function handleWithdrawProfit(event: WithdrawProfit): void {
  // log.warning("calling handleWithdrawProfit line {}, block {}", [event.address.toHexString(), event.block.number.toString()]);
  let credit = Position.load(event.params.id.toHexString())!;
  if(!credit) {
    log.warning
  }
  credit.interestRepaid = credit.interestRepaid.minus(event.params.amount);
  credit.save();

  const eventId = getEventId(typeof WithdrawProfitEvent, event.transaction.hash, event.logIndex);
  let creditEvent = new WithdrawProfitEvent(eventId);
  creditEvent.block = event.block.number;
  creditEvent.line = event.address.toHexString();
  creditEvent.position = event.params.id.toHexString();
  creditEvent.timestamp = event.block.timestamp;
  creditEvent.amount = event.params.amount;
  creditEvent.value = getValueForPosition(
    credit.line,
    credit.token,
    event.params.amount,
    event.block.number
  )[0];
  creditEvent.save();
}

export function handleWithdrawDeposit(event: WithdrawDeposit): void {
  log.warning("calling handleWithdrawDeposit line {}, block {}", [event.address.toHexString(), event.block.number.toString()]);
  let credit = Position.load(event.params.id.toHexString())!;
  credit.deposit = credit.deposit.minus(event.params.amount);
  credit.save();

  const eventId = getEventId(typeof WithdrawDepositEvent, event.transaction.hash, event.logIndex);
  let creditEvent = new WithdrawDepositEvent(eventId);
  creditEvent.block = event.block.number;
  creditEvent.line = event.address.toHexString();
  creditEvent.position = event.params.id.toHexString();
  creditEvent.timestamp = event.block.timestamp;
  creditEvent.amount = event.params.amount;
  creditEvent.value = getValueForPosition(
    credit.line,
    credit.token,
    event.params.amount,
    event.block.number
  )[0];
  creditEvent.save();
}

export function handleBorrow(event: Borrow): void {
  log.warning("calling handleBorrow line {}, block {}", [event.address.toHexString(), event.block.number.toString()]);
  let credit = Position.load(event.params.id.toHexString())!;
  credit.principal = credit.principal.plus(event.params.amount);
  const data = getValueForPosition(
    event.address.toHexString(),
    credit.token,
    event.params.amount,
    event.block.number
  );
  credit.principalUsd =  new BigDecimal(credit.principal).times(data[1]);
  credit.queue = getQueueIndex(credit.line, credit.id);

  credit.save();
  
  
  updateCollateralValue(event.address);

  const eventId = getEventId(typeof BorrowEvent, event.transaction.hash, event.logIndex);
  let creditEvent = new BorrowEvent(eventId);
  creditEvent.block = event.block.number;
  creditEvent.line = event.address.toHexString();
  creditEvent.position = event.params.id.toHexString();
  creditEvent.timestamp = event.block.timestamp;
  creditEvent.amount = event.params.amount;
  creditEvent.value = data[0];
  creditEvent.save();
}


export function handleInterestAccrued(event: InterestAccrued): void {
  // log.warning("calling handleInterestAccrued - block {}, log {}, tx log {},", [event.block.number.toString(), event.logIndex.toString(),  event.transactionLogIndex.toString() ]);

  let credit = Position.load(event.params.id.toHexString())!;
  const data = getValueForPosition(
    event.address.toHexString(),
    credit.token,
    event.params.amount,
    event.block.number
  );
  credit.interestAccrued = credit.interestAccrued.plus(event.params.amount);
  credit.interestUsd = new BigDecimal(credit.interestAccrued).times(data[1]);
  credit.save();

  
  updateCollateralValue(event.address);

  const eventId = getEventId(typeof InterestAccruedEvent, event.transaction.hash, event.logIndex);
  let creditEvent = new InterestAccruedEvent(eventId);
  creditEvent.block = event.block.number;
  creditEvent.position = event.params.id.toHexString();
  creditEvent.line = event.address.toHexString();
  creditEvent.timestamp = event.block.timestamp;
  creditEvent.amount = event.params.amount;
  creditEvent.value = data[0];
  creditEvent.save();
}


export function handleRepayInterest(event: RepayInterest): void {
  // log.warning("calling handleRepayInterest line {}, block {}", [event.address.toHexString(), event.block.number.toString()]);
  let credit = Position.load(event.params.id.toHexString())!;
  const data = getValueForPosition(
    event.address.toHexString(),
    credit.token,
    event.params.amount,
    event.block.number
  );
  
  credit.interestAccrued = credit.interestAccrued.minus(event.params.amount);
  credit.interestUsd = new BigDecimal(credit.interestAccrued).times(data[1]);
  credit.totalInterestEarned = credit.totalInterestEarned.plus(event.params.amount);
  credit.interestRepaid = credit.interestRepaid.plus(event.params.amount);
  
  credit.save();

  const eventId = getEventId(typeof RepayInterestEvent, event.transaction.hash, event.logIndex);
  let creditEvent = new RepayInterestEvent(eventId);
  creditEvent.block = event.block.number;
  creditEvent.line = event.address.toHexString();
  creditEvent.position = event.params.id.toHexString();
  creditEvent.timestamp = event.block.timestamp;
  creditEvent.amount = event.params.amount;
  creditEvent.value = data[0];
  creditEvent.save();
  
  updateCollateralValue(event.address);
}

export function handleRepayPrincipal(event: RepayPrincipal): void {
  // log.warning("calling handleRepayPrincipal line {}, block {}", [event.address.toHexString(), event.block.number.toString()]);
  let credit = Position.load(event.params.id.toHexString())!;
  credit.principal = credit.principal.minus(event.params.amount);
  const data = getValueForPosition(
    event.address.toHexString(),
    credit.token,
    event.params.amount,
    event.block.number
  );
  credit.principalUsd = new BigDecimal(credit.principal).times(data[1]);

  if(credit.principal.equals(BIG_INT_ZERO)) credit.queue = NOT_IN_QUEUE.toI32();

  credit.save();
  
  updateCollateralValue(event.address);

  const eventId = getEventId(typeof RepayPrincipalEvent, event.transaction.hash, event.logIndex);
  let creditEvent = new RepayPrincipalEvent(eventId);
  creditEvent.block = event.block.number;
  creditEvent.position = event.params.id.toHexString();
  creditEvent.line = event.address.toHexString();
  creditEvent.timestamp = event.block.timestamp;
  creditEvent.amount = event.params.amount;
  creditEvent.value = data[0];
  creditEvent.save();
}

export function handleDefault(event: Default): void {
  log.error("BORROWER DEFAULT: line {}, block {}", [event.address.toHexString(), event.block.number.toString()]);
  // TODO: loop over all current credits and generate default events
  const line = LineOfCredit.load(event.address.toHexString())!;
  line.status = STATUS_DEFAULT;
  line.save();
  
  // must be lines if default event is emitted
  const numPositions = line.positions ? line.positions!.length : 0
  if(numPositions > 0) {
    for(let i = 0; i < numPositions; i ++) {
      let c = new Position(line.positions![i]);
      let id = getEventId(typeof DefaultEvent, event.transaction.hash, event.logIndex);
      let creditEvent = new DefaultEvent(id);
      creditEvent.position = c.id;
      creditEvent.block = event.block.number;
      creditEvent.line = event.address.toHexString();
      creditEvent.timestamp = event.block.timestamp;
      creditEvent.amount = c.principal.plus(c.interestAccrued);
      creditEvent.value = getValueForPosition(
        line.oracle.toHexString(),
        c.token,
        creditEvent.amount,
        creditEvent.block
      )[0];
      creditEvent.save();
    }
  }
}

export function handleLiquidate(event: Liquidate): void {
  // log.warning("calling handleLiquidate line {}, block {}", [event.address.toHexString(), event.block.number.toString()]);
  let credit = Position.load(event.params.id.toHexString())!;
  log.warning('liquidate token {} - {}', [event.params.token.toString(), event.params.amount.toString()])

  const data = getValue(
    SecuredLine.bind(event.address).oracle(),
    getOrCreateToken(credit.token),
    event.params.amount,
    event.block.number
  );
  
  log.warning('Liquidate line/position - {}  -  - - {}' , [event.address.toHexString(), credit.id]);

  credit.principalUsd = credit.principalUsd.times(data[1]);

  if(credit.principal.equals(BIG_INT_ZERO)) credit.queue = NOT_IN_QUEUE.toI32();

  credit.save();

  updateCollateralValue(event.address);

  const eventId = getEventId(typeof LiquidateEvent, event.transaction.hash, event.logIndex);
  let creditEvent = new LiquidateEvent(eventId);
  creditEvent.block = event.block.number;
  creditEvent.line = event.address.toHexString();
  creditEvent.position = credit.id;
  creditEvent.timestamp = event.block.timestamp;
  creditEvent.liquidator = event.transaction.from;
  creditEvent.amount = event.params.amount;
  creditEvent.value = data[0];
  creditEvent.save();
}


export function handleSetRates(event: SetRates): void {
  // log.warning("calling handleSetRates line {}, block {}", [event.address.toHexString(), event.block.number.toString()]);
  let credit = new Position(event.params.id.toHexString());
  credit.dRate = event.params.dRate.toI32();
  credit.fRate = event.params.fRate.toI32();
  credit.save();

  const eventId = getEventId(typeof SetRatesEvent, event.transaction.hash, event.logIndex);
  let creditEvent = new SetRatesEvent(eventId);
  creditEvent.block = event.block.number;
  creditEvent.line = event.address.toHexString();
  creditEvent.position = event.params.id.toHexString();
  creditEvent.timestamp = event.block.timestamp;
  creditEvent.dRate = event.params.dRate.toI32();
  creditEvent.fRate = event.params.fRate.toI32();

  creditEvent.save();
}

export function handleTradeRevenue(event: TradeSpigotRevenue): void {
  // log.warning("calling handleTradeRevenue line {}, block {}", [event.address.toHexString(), event.block.number.toString()]);
  // event emitted by Line but code stored in Spigot with other rev functions for organization
  _handleTradeRevenue(event);
}


export function handleMutualConsentRegistered(event: MutualConsentRegistered): void {
  handleMutualConsentEvents(event);
}


export function handleReservesChanged(event: ReservesChanged): void {
  // log.warning("calling handleSetRates line {}, block {}", [event.address.toHexString(), event.block.number.toString()]);
  const lineId = event.address.toHexString()
  const token = getOrCreateToken(event.params.token.toHexString())
  const reserveId = `${lineId}-${token.id}`
  const reserves  = getOrCreateLineReserve(event.address, event.params.token);
  reserves.line = lineId;
  reserves.token = token.id;
  // diff is int not uint so .plus() is always right
  log.warning('resrve change token {} -- diff {} -- type {}', [token.id, event.params.diff.toString(), event.params.tokenType.toString()])
  reserves.amount = reserves.amount.plus(event.params.diff)
  token.save();
  reserves.save();

  const eventId = getEventId(typeof ReservesChangedEvent, event.transaction.hash, event.logIndex);
  let creditEvent = new ReservesChangedEvent(eventId);
  creditEvent.block = event.block.number;
  creditEvent.line = lineId;
  creditEvent.position = BYTES32_ZERO_STR; // for compatibility
  creditEvent.timestamp = event.block.timestamp;

  creditEvent.reserve = reserveId;
  creditEvent.amount = event.params.diff;
  creditEvent.value = BIG_DECIMAL_ZERO;
  creditEvent.type = event.params.tokenType.toI32();
  
  creditEvent.save();
}


export function handleRevokeConsent(event: MutualConsentRevoked): void {
  // log.warning("calling handleSetRates line {}, block {}", [event.address.toHexString(), event.block.number.toString()]);
  const proposalId = event.params._toRevoke.toHexString()
  const proposal = new Proposal(proposalId)
  proposal.revokedAt = event.block.timestamp;

  const eventId = getEventId(typeof RevokeConsentEvent, event.transaction.hash, event.logIndex);
  let creditEvent = new RevokeConsentEvent(eventId);
  creditEvent.block = event.block.number;
  creditEvent.line = event.address.toHexString();
  creditEvent.timestamp = event.block.timestamp;
  creditEvent.proposal = proposalId;
  
  creditEvent.save();
}

