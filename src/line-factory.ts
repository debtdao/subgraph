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

  BIG_DECIMAL_ZERO,
} from "./utils/utils";


export function handleDeploySecuredLine(event: DeployedSecuredLine): void {
  // track all events emitted on new line
  SecuredLineTemplate.create(event.params.deployedAt);

  // dont need  to create LoC entity bc created in line's own deploy event
  const eventId = getEventId(event.block.number, event.logIndex);
  const deployEvent = new DeploySecuredLineEvent(eventId);
  deployEvent.factory = event.address;
  deployEvent.block = event.block.number;
  deployEvent.timestamp = event.block.timestamp;
  deployEvent.deployedAt = event.params.deployedAt;
  deployEvent.deployer = event.transaction.from;

  deployEvent.line = event.params.deployedAt.toHexString();
  
  deployEvent.escrow = event.params.escrow.toHexString();
  deployEvent.spigot = event.params.spigot.toHexString();
  deployEvent.save();
}

export function handleDeploySpigot(event: DeployedSpigot): void {
  const addr = event.params.deployedAt;
  // track all events emitted on new spigot
  SpigotTemplate.create(addr);

  // create and save entity to use later
  // modules dont have their own deploy event like LoC so need to create here
  const spigot = new SpigotController(addr.toHexString());
  spigot.owner = event.params.owner; // may or may not be a line contract
  spigot.line = null; // LoC will claim module when deployed
  spigot.operator = event.params.operator;
  spigot.treasury = event.params.treasury;
  spigot.startTime = event.block.number;
  spigot.save();

  const eventId = getEventId(event.block.number, event.logIndex);
  const deployEvent = new DeploySpigotEvent(eventId);
  deployEvent.factory = event.address;
  deployEvent.block = event.block.number;
  deployEvent.timestamp = event.block.timestamp;
  deployEvent.deployer = event.transaction.from; // line factory or EOA
  deployEvent.deployedAt = addr;

  deployEvent.controller = addr.toHexString();

  deployEvent.owner = event.params.owner;
  deployEvent.operator = event.params.operator;
  deployEvent.treasury = event.params.treasury;
  deployEvent.save();
}

export function handleDeployEscrow(event: DeployedEscrow): void {
  const addr = event.params.deployedAt;
  // track all events emitted on new spigot
  EscrowTemplate.create(addr);

  // create and save entity to use later
  // modules dont have their own deploy event like LoC so need to create here
  const escrow = new Escrow(addr.toHexString());
  escrow.line = null; // LoC will claim module when deployed
  escrow.oracle = event.params.oracle;
  escrow.owner = event.params.owner;
  escrow.minCRatio = new BigDecimal(event.params.minCRatio);
  escrow.collateralValue = BIG_DECIMAL_ZERO;
  escrow.save();

  const eventId = getEventId(event.block.number, event.logIndex);
  const deployEvent = new DeployEscrowEvent(eventId);
  deployEvent.factory = event.address;
  deployEvent.block = event.block.number;
  deployEvent.timestamp = event.block.timestamp;
  deployEvent.deployedAt = addr;
  deployEvent.deployer = event.transaction.from; // line factory or EOA
  deployEvent.minCRatio = new BigDecimal(event.params.minCRatio);
  deployEvent.save();
}
