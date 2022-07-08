
import {
  log,

  Address,
  Bytes,
  BigInt,
  BigDecimal,
} from "@graphprotocol/graph-ts"

import {
  AddCollateral,
  RemoveCollateral
} from "../generated/templates/Escrow/Escrow"

import {
  Token,
  Escrow,
  EscrowDeposit,

  AddCollateralEvent,
  RemoveCollateralEvent
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



export function handleAddCollateral(event: AddCollateral): void {
  const escrowId = event.address.toHexString();
  let escrow = Escrow.load(escrowId)!;
  const depositId = `${escrowId}-${event.params.token}`;
  let deposit = EscrowDeposit.load(depositId);
  const token = getOrCreateToken(event.params.token.toHexString());
  if(!deposit) {
    deposit = new EscrowDeposit(depositId);
    deposit.escrow = escrow.id;
    deposit.token = token.id;
    deposit.amount = event.params.amount;
  } else {
    deposit.amount = deposit.amount.plus(event.params.amount);
    getValue(
      Address.fromBytes(escrow.oracle),
      token,
      deposit.amount,
      event.block.number
    );
  }

  deposit.save();

  const eventId = getEventId(event.block.number, event.logIndex);
  let loanEvent = new AddCollateralEvent(eventId);
  loanEvent.deposit = depositId;
  loanEvent.block = event.block.number;
  loanEvent.timestamp = event.block.timestamp;
  loanEvent.save();
}

export function handleRemoveCollateral(event: AddCollateral): void {
  const escrowId = event.address.toHexString();
  let escrow = Escrow.load(escrowId)!;
  const depositId = `${escrowId}-${event.params.token}`;
  let deposit = EscrowDeposit.load(depositId)!;
  const token = getOrCreateToken(event.params.token.toHexString());
  deposit.amount = deposit.amount.minus(event.params.amount);
  getValue(
    Address.fromBytes(escrow.oracle),
    token,
    deposit.amount,
    event.block.number
  );

  deposit.save();

  const eventId = getEventId(event.block.number, event.logIndex);
  let loanEvent = new AddCollateralEvent(eventId);
  loanEvent.deposit = depositId;
  loanEvent.block = event.block.number;
  loanEvent.timestamp = event.block.timestamp;
  loanEvent.save();
}
