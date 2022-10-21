
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
  const tokenId = event.params.token.toHexString();
  const depositId = `${escrowId}-${tokenId}`;
  let deposit = EscrowDeposit.load(depositId);

  if(!deposit) {
    deposit = new EscrowDeposit(depositId);
    deposit.escrow = escrow.id;
    deposit.amount = BIG_INT_ZERO;
    const token = getOrCreateToken(tokenId);
    deposit.token = token.id;
    deposit.enabled = true;
    deposit.save();
  }

  const eventId = getEventId(event.block.number, event.logIndex);
  let collateralEvent = new EnableCollateralEvent(eventId);
  collateralEvent.deposit = depositId;
  collateralEvent.block = event.block.number;
  collateralEvent.timestamp = event.block.timestamp;
  collateralEvent.save();
}


export function handleAddCollateral(event: AddCollateral): void {
  const escrowId = event.address.toHexString();
  const tokenId = event.params.token.toHexString();
  const depositId = `${escrowId}-${tokenId}`;
  const deposit = EscrowDeposit.load(depositId)!;
  
  deposit.amount = deposit.amount.plus(event.params.amount);
  deposit.save();
  
  const data = getValue(
    Address.fromBytes(Escrow.load(escrowId)!.oracle),
    getOrCreateToken(tokenId),
    deposit.amount,
    event.block.number
  );

  const eventId = getEventId(event.block.number, event.logIndex);
  const collateralEvent = new AddCollateralEvent(eventId);
  collateralEvent.deposit = depositId;
  collateralEvent.block = event.block.number;
  collateralEvent.timestamp = event.block.timestamp;
  collateralEvent.amount = deposit.amount;
  collateralEvent.value = data[0];
  
  collateralEvent.save();
}

export function handleRemoveCollateral(event: AddCollateral): void {
  const escrowId = event.address.toHexString();
  const tokenId = event.params.token.toHexString();
  const depositId = `${escrowId}-${tokenId}`;
  const deposit = EscrowDeposit.load(depositId)!;
  deposit.amount = deposit.amount.minus(event.params.amount);
  deposit.save();
  
  const data = getValue(
    Address.fromBytes(Escrow.load(escrowId)!.oracle),
    getOrCreateToken(tokenId),
    deposit.amount,
    event.block.number
  );
    
  const eventId = getEventId(event.block.number, event.logIndex);
  let collateralEvent = new RemoveCollateralEvent(eventId);
  collateralEvent.deposit = depositId;
  collateralEvent.block = event.block.number;
  collateralEvent.timestamp = event.block.timestamp;
  collateralEvent.amount = deposit.amount;
  // collateralEvent.value = data[0];
  collateralEvent.save();
}
