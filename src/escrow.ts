
import {
  log,

  Address,
  Bytes,
  BigInt,
  BigDecimal,
} from "@graphprotocol/graph-ts"

import {
  EnableCollateral,
  AddCollateral,
  RemoveCollateral
} from "../generated/templates/Escrow/Escrow"

import {
  Token,
  Escrow,
  EscrowDeposit,

  EnableCollateralEvent,
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
} from "./utils";


export function handleEnableCollateral(event: EnableCollateral): void {
  const escrowId = event.address.toHexString();
  let escrow = Escrow.load(escrowId)!;
  const depositId = `${escrowId}-${event.params.token}`;
  let deposit = EscrowDeposit.load(depositId);
  const token = getOrCreateToken(event.params.token.toHexString());
  if(!deposit) {
    deposit = new EscrowDeposit(depositId);
    deposit.escrow = escrow.id;
    deposit.token = token.id;
  }

  deposit.save();

  const eventId = getEventId(event.block.number, event.logIndex);
  let creditEvent = new EnableCollateralEvent(eventId);
  creditEvent.deposit = depositId;
  creditEvent.block = event.block.number;
  creditEvent.timestamp = event.block.timestamp;
  creditEvent.save();
}


export function handleAddCollateral(event: AddCollateral): void {
  const escrowId = event.address.toHexString();
  const depositId = `${escrowId}-${event.params.token}`;
  let deposit = EscrowDeposit.load(depositId)!;
  
  deposit.amount = deposit.amount.plus(event.params.amount);
  
  let escrow = Escrow.load(escrowId)!;
  const data = getValue(
    Address.fromBytes(escrow.oracle),
    getOrCreateToken(event.params.token.toHexString()),
    deposit.amount,
    event.block.number
  );

  deposit.save();

  const eventId = getEventId(event.block.number, event.logIndex);
  let creditEvent = new AddCollateralEvent(eventId);
  creditEvent.deposit = depositId;
  creditEvent.block = event.block.number;
  creditEvent.timestamp = event.block.timestamp;
  creditEvent.amount = deposit.amount;
  creditEvent.value = data[0];
  
  creditEvent.save();
}

export function handleRemoveCollateral(event: AddCollateral): void {
  const escrowId = event.address.toHexString();
  let escrow = Escrow.load(escrowId)!;
  const depositId = `${escrowId}-${event.params.token}`;
  let deposit = EscrowDeposit.load(depositId)!;
  const token = getOrCreateToken(event.params.token.toHexString());
  deposit.amount = deposit.amount.minus(event.params.amount);
  const data = getValue(
    Address.fromBytes(escrow.oracle),
    token,
    deposit.amount,
    event.block.number
  );

  deposit.save();

  const eventId = getEventId(event.block.number, event.logIndex);
  let creditEvent = new RemoveCollateralEvent(eventId);
  creditEvent.deposit = depositId;
  creditEvent.block = event.block.number;
  creditEvent.timestamp = event.block.timestamp;
  creditEvent.amount = deposit.amount;
  creditEvent.value = data[0];
  creditEvent.save();
}
