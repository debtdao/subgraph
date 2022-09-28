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
  Liquidate,
  RepayInterest,
  RepayPrincipal,
  UpdateStatus,
  WithdrawProfit,
  WithdrawDeposit,
  TradeSpigotRevenue,
  SetRates,
} from "../generated/templates/SecuredLine/SecuredLine"

import {
  // main entity types
  LineOfCredit,
  Credit,
  Borrower,
  SpigotController,
  Escrow,
  // graph schema events
  AddCreditEvent,
  BorrowEvent,
  ClosePositionEvent,
  DefaultEvent,
  InterestAccruedEvent,
  LiquidateEvent,
  RepayInterestEvent,
  RepayPrincipalEvent,
  UpdateStatusEvent,
  WithdrawProfitEvent,
  WithdrawDepositEvent,
  SetRatesEvent,
} from "../generated/schema"

import {
  STATUSES,
  NOT_IN_QUEUE,
  BIG_INT_ZERO,
  BYTES32_ZERO_STR,
  STATUS_DEFAULT,

  getValue,
  getQueueIndex,
  getEventId,
  getOrCreateToken,
  getValueForPosition,
  updateCollateralValue,
} from "./utils";

import { handleTradeRevenue as _handleTradeRevenue } from "./spigot"

export function handleDeployLine(event: DeployLine): void {
  const line = new LineOfCredit(event.address.toHexString());
  const borrower = new Borrower(event.params.borrower.toHexString());
  borrower.save(); // ensure entity persists
  const LoC = SecuredLine.bind(event.address);

  log.warning("new Line addy {}, borrower {}", [event.address.toHexString(), borrower.id]);

  line.borrower = borrower.id;
  line.type = "Crypto Credit Account";
  line.oracle = event.params.oracle;
  line.arbiter = event.params.arbiter;
  line.start = event.block.timestamp.toI32();
  line.end = LoC.deadline().toI32();
  line.status = STATUSES.get(0); // LoC is UNINITIALIZED on deployment
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
  log.warning(
    "calling handleUpdateStatus addy {}, block {}, status {}",
    [event.address.toHexString(), event.block.number.toString(), event.params.status.toString()]
  );
  if(STATUSES.has(event.params.status.toI32())) { // ensure its a known status with human label
    
    let credit = new LineOfCredit(event.address.toHexString());
    credit.status = STATUSES.get(event.params.status.toI32());
    credit.save();

    const eventId = getEventId(event.block.number, event.logIndex);
    let creditEvent = new UpdateStatusEvent(eventId);
    creditEvent.id = credit.id;
    creditEvent.block = event.block.number;
    creditEvent.timestamp = event.block.timestamp;

    creditEvent.line = event.address.toHexString();
    creditEvent.credit = credit.lines ? credit.lines![0] : BYTES32_ZERO_STR;
    creditEvent.status = event.params.status.toI32();

    creditEvent.save();
  } else {
    log.error('No STATUSES mapped for event', [event.params.status.toString()])
  }
}


export function handleAddCredit(event: AddCredit): void {
  log.warning("calling handleAddCredit addy {}, block {}", [event.address.toHexString(), event.block.number.toString()]);
  const line = LineOfCredit.load(event.address.toHexString())!;
  const token = getOrCreateToken(event.params.token.toHexString());
  const id = event.params.positionId.toHexString();
  let credit = Credit.load(id);
  if(credit) {
    // same lender/token already participated on line but it was closed, then reopened
    // keep historical data e.g. totalInterestAccrued and clear active data
  } else {
    credit = new Credit(id);
  }
  credit.token = token.id;
  credit.line = line.id;
  credit.lender = event.params.lender.toHexString();
  credit.deposit = event.params.deposit;
  
  credit.principal = BIG_INT_ZERO;
  credit.interestAccrued = BIG_INT_ZERO;
  credit.totalInterestEarned = BIG_INT_ZERO;
  
  // rates properly set on UpdateInterestRate event
  credit.drawnRate = 0; // get set on SetRates
  credit.facilityRate = 0; // get set on SetRates
  credit.queue = NOT_IN_QUEUE.toI32();
  credit.save();

  const eventId = getEventId(event.block.number, event.logIndex);
  let creditEvent = new AddCreditEvent(eventId);
  creditEvent.block = event.block.number;
  creditEvent.line = event.address.toHexString();
  creditEvent.credit = event.params.positionId.toHexString();
  creditEvent.timestamp = event.block.timestamp;
  creditEvent.amount = event.params.deposit;
  creditEvent.value = getValue(
    line.oracle as Address,
    token,
    credit.deposit,
    event.block.number
  )[0];
  creditEvent.drawnRate = 0; // get set on SetRates
  creditEvent.facilityRate = 0; // get set on SetRates
  creditEvent.save();
}

export function handleCloseCreditPosition(event: CloseCreditPosition): void {
  log.warning("calling handleCloseCreditPosition addy {}, block {}", [event.address.toHexString(), event.block.number.toString()]);
  let credit = Credit.load(event.params.id.toHexString())!;
  credit.principal = BIG_INT_ZERO;
  credit.deposit = BIG_INT_ZERO;
  credit.interestAccrued = BIG_INT_ZERO;
  credit.interestRepaid = BIG_INT_ZERO;
  credit.drawnRate = 0;
  credit.facilityRate = 0;
  credit.queue = NOT_IN_QUEUE.toI32(); // TODO figure out how to make null/undefined with type system
  credit.save();

  const eventId = getEventId(event.block.number, event.logIndex);
  let creditEvent = new ClosePositionEvent(eventId);
  creditEvent.id = credit.id;
  creditEvent.block = event.block.number;
  creditEvent.credit = event.params.id.toHexString();
  creditEvent.line = event.address.toHexString();
  creditEvent.timestamp = event.block.timestamp;
  creditEvent.save();
}


export function handleWithdrawProfit(event: WithdrawProfit): void {
  log.warning("calling handleWithdrawProfit addy {}, block {}", [event.address.toHexString(), event.block.number.toString()]);
  let credit = Credit.load(event.params.id.toHexString())!;
  credit.interestRepaid = credit.interestRepaid.minus(event.params.amount);
  credit.save();

  const eventId = getEventId(event.block.number, event.logIndex);
  let creditEvent = new WithdrawProfitEvent(eventId);
  creditEvent.id = credit.id;
  creditEvent.block = event.block.number;
  creditEvent.line = event.address.toHexString();
  creditEvent.credit = event.params.id.toHexString();
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
  log.warning("calling handleWithdrawDeposit addy {}, block {}", [event.address.toHexString(), event.block.number.toString()]);
  let credit = Credit.load(event.params.id.toHexString())!;
  credit.deposit = credit.deposit.minus(event.params.amount);
  credit.save();

  const eventId = getEventId(event.block.number, event.logIndex);
  let creditEvent = new WithdrawDepositEvent(eventId);
  creditEvent.id = credit.id;
  creditEvent.block = event.block.number;
  creditEvent.line = event.address.toHexString();
  creditEvent.credit = event.params.id.toHexString();
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
  log.warning("calling handleBorrow addy {}, block {}", [event.address.toHexString(), event.block.number.toString()]);
  let credit = Credit.load(event.params.id.toHexString())!;
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

  const eventId = getEventId(event.block.number, event.logIndex);
  let creditEvent = new BorrowEvent(eventId);
  creditEvent.id = credit.id;
  creditEvent.block = event.block.number;
  creditEvent.line = event.address.toHexString();
  creditEvent.credit = event.params.id.toHexString();
  creditEvent.timestamp = event.block.timestamp;
  creditEvent.amount = event.params.amount;
  creditEvent.value = data[0];
  creditEvent.save();
}


export function handleInterestAccrued(event: InterestAccrued): void {
  log.warning("calling handleInterestAccrued addy {}, block {}", [event.address.toHexString(), event.block.number.toString()]);
  let credit = Credit.load(event.params.id.toHexString())!;
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

  const eventId = getEventId(event.block.number, event.logIndex);
  let creditEvent = new InterestAccruedEvent(eventId);
  creditEvent.id = credit.id;
  creditEvent.block = event.block.number;
  creditEvent.credit = event.params.id.toHexString();
  creditEvent.line = event.address.toHexString();
  creditEvent.timestamp = event.block.timestamp;
  creditEvent.amount = event.params.amount;
  creditEvent.value = data[0];
  creditEvent.save();
}


export function handleRepayInterest(event: RepayInterest): void {
  log.warning("calling handleRepayInterest addy {}, block {}", [event.address.toHexString(), event.block.number.toString()]);
  let credit = Credit.load(event.params.id.toHexString())!;
  credit.interestAccrued = credit.interestAccrued.minus(event.params.amount);
  const data = getValueForPosition(
    event.address.toHexString(),
    credit.token,
    event.params.amount,
    event.block.number
  );
  credit.interestUsd = new BigDecimal(credit.interestAccrued).times(data[1]);

  credit.totalInterestEarned = credit.totalInterestEarned.plus(event.params.amount);
  credit.interestRepaid = credit.interestRepaid.plus(event.params.amount);
  
  credit.save();

  const eventId = getEventId(event.block.number, event.logIndex);
  let creditEvent = new RepayInterestEvent(eventId);
  creditEvent.id = credit.id;
  creditEvent.block = event.block.number;
  creditEvent.line = event.address.toHexString();
  creditEvent.credit = event.params.id.toHexString();
  creditEvent.timestamp = event.block.timestamp;
  creditEvent.amount = event.params.amount;
  creditEvent.value = data[0];
  creditEvent.save();
  
  updateCollateralValue(event.address);
}

export function handleRepayPrincipal(event: RepayPrincipal): void {
  log.warning("calling handleRepayPrincipal addy {}, block {}", [event.address.toHexString(), event.block.number.toString()]);
  let credit = Credit.load(event.params.id.toHexString())!;
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

  const eventId = getEventId(event.block.number, event.logIndex);
  let creditEvent = new RepayPrincipalEvent(eventId);
  creditEvent.id = credit.id;
  creditEvent.block = event.block.number;
  creditEvent.credit = event.params.id.toHexString();
  creditEvent.line = event.address.toHexString();
  creditEvent.timestamp = event.block.timestamp;
  creditEvent.amount = event.params.amount;
  creditEvent.value = data[0];
  creditEvent.save();
}

export function handleDefault(event: Default): void {
  log.warning("calling handleDefault addy {}, block {}", [event.address.toHexString(), event.block.number.toString()]);
  // TODO: loop over all current credits and generate default events
  let line = LineOfCredit.load(event.address.toHexString())!;
  line.status = STATUS_DEFAULT;
  line.save();
  
  // must be lines if default event is emitted
  for(let i = 0; i < line.lines!.length; i ++) {
    let c = new Credit(line.lines![i]);
    let id = getEventId(event.block.number, event.logIndex);
    let creditEvent = new DefaultEvent(id);
    creditEvent.credit = c.id;
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

export function handleLiquidate(event: Liquidate): void {
  log.warning("calling handleLiquidate addy {}, block {}", [event.address.toHexString(), event.block.number.toString()]);
  let credit = Credit.load(event.params.positionId.toHexString())!;
  credit.principal = credit.principal.minus(event.params.amount);
  const data = getValue(
    SecuredLine.bind(Address.fromString(credit.line)).oracle(),
    getOrCreateToken(event.params.token.toString()),
    event.params.amount,
    event.block.number
  );
  credit.principalUsd = credit.principalUsd.times(data[1]);

  if(credit.principal.equals(BIG_INT_ZERO)) credit.queue = NOT_IN_QUEUE.toI32();

  credit.save();

  const eventId = getEventId(event.block.number, event.logIndex);
  let creditEvent = new LiquidateEvent(eventId);
  creditEvent.id = credit.id;
  creditEvent.block = event.block.number;
  creditEvent.line = event.address.toHexString();
  creditEvent.credit = credit.id;
  creditEvent.timestamp = event.block.timestamp;
  creditEvent.amount = event.params.amount;
  creditEvent.value = data[0];
  creditEvent.save();
}


export function handleSetRates(event: SetRates): void {
  log.warning("calling handleSetRates addy {}, block {}", [event.address.toHexString(), event.block.number.toString()]);
  let credit = new Credit(event.params.id.toHexString());
  credit.drawnRate = event.params.drawnRate.toI32();
  credit.facilityRate = event.params.facilityRate.toI32();
  credit.save();

  const eventId = getEventId(event.block.number, event.logIndex);
  let creditEvent = new SetRatesEvent(eventId);
  creditEvent.id = credit.id;
  creditEvent.block = event.block.number;
  creditEvent.line = event.address.toHexString();
  creditEvent.credit = event.params.id.toHexString();
  creditEvent.timestamp = event.block.timestamp;
  creditEvent.drawnRate = event.params.drawnRate.toI32();
  creditEvent.facilityRate = event.params.facilityRate.toI32();
  creditEvent.save();
}

export function handleTradeRevenue(event: TradeSpigotRevenue): void {
  log.warning("calling handleTradeRevenue addy {}, block {}", [event.address.toHexString(), event.block.number.toString()]);
  // event emitted by Line but code stored in Spigot for organization
  _handleTradeRevenue(event);
}
