import {
  BigDecimal,
} from "@graphprotocol/graph-ts"

import { 
  DeployedSecuredLine,
  DeployedSpigot,
  DeployedEscrow,
} from "../generated/LineFactory/LineFactory"

import { 
  SpigotController,
  Escrow,

  DeploySecuredLineEvent,
  DeploySpigotEvent,
  DeployEscrowEvent,
} from "../generated/schema";

import {
  Spigot as SpigotTemplate,
  Escrow as EscrowTemplate,
  SecuredLine as SecuredLineTemplate,
} from "../generated/templates"

import {
  getEventId,
  getOrCreateLine,
  getOrCreateSpigot,

  LINE_TYPE_SECURED,
  BIG_DECIMAL_ZERO,
  BYTES32_ZERO_STR,
} from "./utils";


export function handleDeploySecuredLine(event: DeployedSecuredLine): void {
  // track all events emitted on new line
  SecuredLineTemplate.create(event.params.line);

  // dont need  to create LoC entity bc created in line's own deploy event

  const eventId = getEventId(event.block.number, event.logIndex);
  const deployEvent = new DeploySecuredLineEvent(eventId);
  deployEvent.factory = event.address;
  deployEvent.block = event.block.number;
  deployEvent.timestamp = event.block.timestamp;
  deployEvent.address = event.params.line;
  deployEvent.deployer = event.transaction.from;

  deployEvent.contract = event.params.line.toHexString();
  deployEvent.credit = BYTES32_ZERO_STR; // no positions yet but need to add to line log
  
  // deployEvent.escrow = event.params.escrow;
  // deployEvent.spigot = event.params.spigot;
  deployEvent.save();
}

export function handleDeploySpigot(event: DeployedSpigot): void {
  const addr = event.params.spigotAddress;
  // track all events emitted on new spigot
  SpigotTemplate.create(addr);

  // create and save entity to use later
  // modules dont have their own deploy event like LoC so need to create here
  const spigot = new SpigotController(addr.toHexString());
  spigot.owner = event.params.owner;
  spigot.contract = null; // LoC will claim Spigot when deployed
  // spigot.operator = event.params.operator;
  spigot.treasury = event.params.treasury;
  spigot.startTime = event.block.number;
  spigot.save()

  const eventId = getEventId(event.block.number, event.logIndex);
  const deployEvent = new DeploySpigotEvent(eventId);
  deployEvent.factory = event.address;
  deployEvent.block = event.block.number;
  deployEvent.timestamp = event.block.timestamp;
  deployEvent.address = addr;
  deployEvent.deployer = event.transaction.from;

  deployEvent.owner = event.params.owner;
  // deployEvent.operator = event.params.operator;
  deployEvent.treasury = event.params.treasury;
  deployEvent.save();
}

export function handleDeployEscrow(event: DeployedEscrow): void {
  const addr = event.params.escrowAddress;
  // track all events emitted on new spigot
  EscrowTemplate.create(addr);

  // create and save entity to use later
  // modules dont have their own deploy event like LoC so need to create here
  const escrow = new Escrow(addr.toHexString());
  escrow.contract = event.params.borrower.toHexString();
  // escrow.oracle = event.params.oracle;
  escrow.cratio = BIG_DECIMAL_ZERO;
  escrow.collateralValue = BIG_DECIMAL_ZERO;
  escrow.minCRatio = new BigDecimal(event.params.minCRatio);
  escrow.save();

  const eventId = getEventId(event.block.number, event.logIndex);
  const deployEvent = new DeployEscrowEvent(eventId);
  deployEvent.factory = event.address;
  deployEvent.block = event.block.number;
  deployEvent.timestamp = event.block.timestamp;
  deployEvent.address = addr;
  deployEvent.deployer = event.transaction.from;
  deployEvent.minCRatio = event.params.minCRatio;
  deployEvent.save();
}
