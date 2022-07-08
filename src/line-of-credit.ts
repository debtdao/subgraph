import {
  log,

  Address,
  Bytes,
  BigInt,
  BigDecimal,
} from "@graphprotocol/graph-ts"

import {
  SecuredLoan,
  // ABI events
  AddDebtPosition,
  Borrow,
  CloseDebtPosition,
  Default,
  DeployLoan,
  InterestAccrued,
  Liquidate,
  RepayInterest,
  RepayPrincipal,
  UpdateLoanStatus,
  WithdrawProfit,
  WithdrawDeposit,
  TradeSpigotRevenue,
  UpdateRates,
} from "../generated/LineOfCredit/SecuredLoan"

import { Spigot as SpigotContract } from "../generated/templates/Spigot/Spigot"
import { Escrow as EscrowContract } from "../generated/templates/Escrow/Escrow"
import {
  Spigot as SpigotTemplate,
  Escrow as EscrowTemplate,
} from "../generated/templates"

import {
  LineOfCredit,
  DebtPosition,
  Borrower,
  Token,
  Lender,
  Spigot,
  SpigotController,
  Escrow,

  // graph schema events
  AddPositionEvent,
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
  RemoveSpigotEvent,
  TradeRevenueEvent,  
  UpdateRatesEvent,
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

import { handleTradeRevenue as _handleTradeRevenue } from "./spigot"

export function handleDeployLoan(event: DeployLoan): void {
  const loan = new LineOfCredit(event.address.toHexString());
  const borrower = new Borrower(event.params.borrower.toHexString());

  loan.borrower = borrower.id;
  loan.oracle = event.params.oracle;
  loan.arbiter = event.params.arbiter;
  loan.start = event.block.timestamp.toI32();
  loan.end = SecuredLoan.bind(event.address).deadline().toI32();
  loan.status = STATUSES.get(2); // LoC is ACTIVE on deployment
  
  const Loan = SecuredLoan.bind(Address.fromString(loan.id));
  // Add modules if present
  if(Loan.spigot() !== ZERO_ADDRESS) {
    const addr = Loan.spigot();
    // start tracking events emitted by spigot
    SpigotTemplate.create(addr);
    // call contract to init data
    const Spigot = SpigotContract.bind(addr);
    let spigot = new SpigotController(addr.toHexString());
    
    // save module to loan
    loan.spigot = spigot.id;
    
    spigot.contract = loan.id;
    spigot.operator = Spigot.operator()
    spigot.treasury = Spigot.treasury()
    spigot.dex =  Loan.swapTarget()
    spigot.save()
  }

  if(Loan.escrow() !== ZERO_ADDRESS) {
    const addr = Loan.escrow();
    let escrow = new Escrow(addr.toHexString());
    loan.spigot = escrow.id;
    // start tracking events emitted by escrow
    EscrowTemplate.create(addr);
    
    escrow.contract = loan.id;
    escrow.oracle = loan.oracle;
    escrow.minCRatio = new BigDecimal(
      (EscrowContract.bind(addr)).minimumCollateralRatio()
      );
    escrow.cratio = BIG_DECIMAL_ZERO;
    escrow.collateralValue = BIG_DECIMAL_ZERO;
    escrow.save()
  }

  loan.save();
}

export function handleUpdateLoanStatus(event: UpdateLoanStatus): void {
  if(STATUSES.has(event.params.status.toI32())) {
    let position = LineOfCredit.load(event.address.toHexString())!;
    position.status = STATUSES.get(event.params.status.toI32());
    position.save();

    const eventId = getEventId(event.block.number, event.logIndex);
    let loanEvent = new UpdateStatusEvent(eventId);
    loanEvent.positionId = position.id;
    loanEvent.block = event.block.number;
    loanEvent.timestamp = event.block.timestamp;
    loanEvent.status = event.params.status.toI32();
    loanEvent.save();
  } else {
    log.error('No STATUSES mapped for event', [event.params.status.toString()])
  }
}


export function handleAddPosition(event: AddDebtPosition): void {
  const loan = LineOfCredit.load(event.address.toHexString())!;
  const token = getOrCreateToken(event.params.token.toHexString());
  const id = computePositionId(event.address, event.params.lender, event.params.token)
  let position = DebtPosition.load(id);
  if(position) {
    // same lender/token already participated on loan but it was closed, then reopened
    // keep historical data e.g. totalInterestAccrued and clear active data
  } else {
    position = new DebtPosition(id);
  }
  position.token = token.id;
  position.contract = loan.id;
  position.lender = event.params.lender.toHexString();
  position.deposit = event.params.deposit;
  
  position.principal = BIG_INT_ZERO;
  position.interestAccrued = BIG_INT_ZERO;
  position.totalInterestEarned = BIG_INT_ZERO;
  
  // rates properly set on UpdateInterestRate event
  position.drawnRate = 0; // get set on UpdateRates
  position.facilityRate = 0; // get set on UpdateRates
  position.queue = NOT_IN_QUEUE.toI32();
  position.save();

  const eventId = getEventId(event.block.number, event.logIndex);
  let loanEvent = new AddPositionEvent(eventId);
  loanEvent.positionId = id;
  loanEvent.block = event.block.number;
  loanEvent.timestamp = event.block.timestamp;
  loanEvent.amount = event.params.deposit;
  loanEvent.value = getValue(
    loan.oracle as Address,
    token,
    position.deposit,
    event.block.number
  );
  loanEvent.save();




  // Note: If a handler doesn't require existing field values, it is faster
  // _not_ to load the entity from the store. Instead, create it fresh with
  // `new Entity(...)`, set the fields that should be updated and save the
  // entity back to the store. Fields that were not set or unset remain
  // unchanged, allowing for partial updates to be applied.

  // It is also possible to access smart contracts from mappings. For
  // example, the contract that has emitted the event can be connected to
  // with:
  //
  // const contract = Contract.bind(event.address)
  //
  // The following functions can then be called on this contract to access
  // state variables and other data:
  //
  // - contract.accrueInterest(...)
  // - contract.addDebtPosition(...)
  // - contract.arbiter(...)
  // - contract.borrow(...)
  // - contract.borrower(...)
  // - contract.close(...)
  // - contract.deadline(...)
  // - contract.debts(...)
  // - contract.depositAndClose(...)
  // - contract.depositAndRepay(...)
  // - contract.getOutstandingDebt(...)
  // - contract.healthcheck(...)
  // - contract.interestRate(...)
  // - contract.interestUsd(...)
  // - contract.liquidate(...)
  // - contract.loanStatus(...)
  // - contract.mutualUpgrades(...)
  // - contract.oracle(...)
  // - contract.positionIds(...)
  // - contract.principalUsd(...)
  // - contract.withdraw(...)
}

export function handleCloseDebtPosition(event: CloseDebtPosition): void {
  let position = DebtPosition.load(event.params.positionId.toHexString())!;
  position.principal = BIG_INT_ZERO;
  position.deposit = BIG_INT_ZERO;
  position.interestAccrued = BIG_INT_ZERO;
  position.interestRepaid = BIG_INT_ZERO;
  position.drawnRate = 0;
  position.facilityRate = 0;
  position.queue = NOT_IN_QUEUE.toI32(); // TODO figure out how to make null/undefined with type system
  position.save();

  const eventId = getEventId(event.block.number, event.logIndex);
  let loanEvent = new ClosePositionEvent(eventId);
  loanEvent.positionId = position.id;
  loanEvent.block = event.block.number;
  loanEvent.timestamp = event.block.timestamp;
  loanEvent.save();
}


export function handleWithdrawProfit(event: WithdrawProfit): void {
  let position = DebtPosition.load(event.params.positionId.toHexString())!;
  position.interestAccrued = position.interestAccrued.minus(event.params.amount);
  position.save();

  const eventId = getEventId(event.block.number, event.logIndex);
  let loanEvent = new WithdrawProfitEvent(eventId);
  loanEvent.positionId = position.id;
  loanEvent.block = event.block.number;
  loanEvent.timestamp = event.block.timestamp;
  loanEvent.amount = event.params.amount;
  loanEvent.value = getValue(
    LineOfCredit.load(position.contract)!.oracle as Address,
    Token.load(position.token)!,
    event.params.amount,
    event.block.number
  );
  loanEvent.save();
}

export function handleWithdrawDeposit(event: WithdrawDeposit): void {
  let position = DebtPosition.load(event.params.positionId.toHexString())!;
  position.deposit = position.deposit.minus(event.params.amount);
  position.save();

  const eventId = getEventId(event.block.number, event.logIndex);
  let loanEvent = new WithdrawDepositEvent(eventId);
  loanEvent.positionId = position.id;
  loanEvent.block = event.block.number;
  loanEvent.timestamp = event.block.timestamp;
  loanEvent.amount = event.params.amount;
  loanEvent.value = getValue(
    LineOfCredit.load(position.contract)!.oracle as Address,
    Token.load(position.token)!,
    event.params.amount,
    event.block.number
  );
  loanEvent.save();
}

export function handleBorrow(event: Borrow): void {
  let position = DebtPosition.load(event.params.positionId.toHexString())!;
  position.principal = position.principal.plus(event.params.amount);
  position.principalUsd = position.principalUsd.plus(new BigDecimal(event.params.value));
  position.queue = getQueueIndex(position.contract, position.id);

  position.save();
  
  // TODO if Escrow update value/cratio
  updateTokenPrice(
    new BigDecimal(event.params.value.div(event.params.amount)),
    event.block.number,
    position.token,
    new Token("")
  )

  const eventId = getEventId(event.block.number, event.logIndex);
  let loanEvent = new BorrowEvent(eventId);
  loanEvent.positionId = position.id;
  loanEvent.block = event.block.number;
  loanEvent.timestamp = event.block.timestamp;
  loanEvent.save();
}


export function handleInterestAccrued(event: InterestAccrued): void {
  let position = DebtPosition.load(event.params.positionId.toHexString())!;
  position.interestAccrued = position.interestAccrued.plus(event.params.amount);
  position.interestUsd = position.interestUsd.plus(new BigDecimal(event.params.value));
  position.save();

  // TODO if Escrow update value/cratio

  const eventId = getEventId(event.block.number, event.logIndex);
  let loanEvent = new InterestAccruedEvent(eventId);
  loanEvent.positionId = position.id;
  loanEvent.block = event.block.number;
  loanEvent.timestamp = event.block.timestamp;
  loanEvent.amount = event.params.amount;
  loanEvent.value = new BigDecimal(event.params.value);
  updateTokenPrice(
    new BigDecimal(event.params.value.div(event.params.amount)),
    event.block.number,
    position.token,
    new Token("")
  )
  loanEvent.save();
}


export function handleRepayInterest(event: RepayInterest): void {
  let position = DebtPosition.load(event.params.positionId.toHexString())!;
  position.interestAccrued = position.interestAccrued.minus(event.params.amount);
  position.interestUsd = position.interestUsd.minus(new BigDecimal(event.params.value));

  position.totalInterestEarned = position.totalInterestEarned.plus(event.params.amount);
  position.interestRepaid = position.interestRepaid.plus(event.params.amount);
  
  position.save();

  const eventId = getEventId(event.block.number, event.logIndex);
  let loanEvent = new RepayInterestEvent(eventId);
  loanEvent.positionId = position.id;
  loanEvent.block = event.block.number;
  loanEvent.timestamp = event.block.timestamp;
  loanEvent.amount = event.params.amount;
  loanEvent.value = new BigDecimal(event.params.value);
  loanEvent.save();
  // TODO if Escrow update value/cratio

  updateTokenPrice(
    new BigDecimal(event.params.value.div(event.params.amount)),
    event.block.number,
    position.token,
    new Token("")
  );
  
}

export function handleRepayPrincipal(event: RepayPrincipal): void {
  let position = DebtPosition.load(event.params.positionId.toHexString())!;
  position.principal = position.principal.minus(event.params.amount);
  position.principalUsd = position.principalUsd.minus(new BigDecimal(event.params.value));

  if(position.principal.equals(BIG_INT_ZERO)) position.queue = NOT_IN_QUEUE.toI32();

  position.save();
  // TODO if Escrow update value/cratio

  const eventId = getEventId(event.block.number, event.logIndex);
  let loanEvent = new RepayPrincipalEvent(eventId);
  loanEvent.positionId = position.id;
  loanEvent.block = event.block.number;
  loanEvent.timestamp = event.block.timestamp;
  loanEvent.amount = event.params.amount;
  loanEvent.value = new BigDecimal(event.params.value);
  loanEvent.save();
  
  updateTokenPrice(
    new BigDecimal(event.params.value.div(event.params.amount)),
    event.block.number,
    position.token,
    new Token("")
  );

}

// Not sure whart to do here. UpdateLoanStatus already has it as Liquidatable
export function handleDefault(event: Default): void {}


export function handleLiquidate(event: Liquidate): void {
  let position = DebtPosition.load(event.params.positionId.toHexString())!;
  position.principal = position.principal.minus(event.params.amount);
  const value = getValue(
    SecuredLoan.bind(Address.fromString(position.contract)).oracle(),
    getOrCreateToken(event.params.token.toString()),
    event.params.amount,
    event.block.number
  );
  position.principalUsd = position.principalUsd.minus(value);

  if(position.principal.equals(BIG_INT_ZERO)) position.queue = NOT_IN_QUEUE.toI32();

  position.save();

  const eventId = getEventId(event.block.number, event.logIndex);
  let loanEvent = new LiquidateEvent(eventId);
  loanEvent.positionId = position.id;
  loanEvent.block = event.block.number;
  loanEvent.timestamp = event.block.timestamp;
  loanEvent.amount = event.params.amount;
  loanEvent.value = value;
  loanEvent.save();
  
  updateTokenPrice(
    value.div(new BigDecimal(event.params.amount)),
    event.block.number,
    position.token,
    new Token("")
  );

}


export function handleUpdateRates(event: UpdateRates): void {
  let position = new DebtPosition(event.params.positionId.toHexString());
  position.drawnRate = event.params.drawnRate.toI32();
  position.facilityRate = event.params.facilityRate.toI32();
  position.save();

  const eventId = getEventId(event.block.number, event.logIndex);
  let loanEvent = new UpdateRatesEvent(eventId);
  loanEvent.positionId = position.id;
  loanEvent.block = event.block.number;
  loanEvent.timestamp = event.block.timestamp;
  loanEvent.drawnRate = event.params.drawnRate.toI32();
  loanEvent.facilityRate = event.params.facilityRate.toI32();
  loanEvent.save();
}

export function handleTradeRevenue(event: TradeSpigotRevenue): void {
  // event emitted by Loan but code store in Spigot for organization
  _handleTradeRevenue(event);
}
