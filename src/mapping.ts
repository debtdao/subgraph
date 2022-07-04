import { BigInt } from "@graphprotocol/graph-ts"
import {
  CreditLoan,
  AddDebtPosition,
  Borrow,
  CloseDebtPosition,
  Default,
  DeployLoan,
  InterestAccrued,
  Liquidate,
  MutualUpgradeRegistered,
  RepayInterest,
  RepayPrincipal,
  UpdateLoanStatus,
  Withdraw
} from "../generated/CreditLoan/CreditLoan"
import { ExampleEntity } from "../generated/schema"

export function handleAddDebtPosition(event: AddDebtPosition): void {
  // Entities can be loaded from the store using a string ID; this ID
  // needs to be unique across all entities of the same type
  let entity = ExampleEntity.load(event.transaction.from.toHex())

  // Entities only exist after they have been saved to the store;
  // `null` checks allow to create entities on demand
  if (!entity) {
    entity = new ExampleEntity(event.transaction.from.toHex())

    // Entity fields can be set using simple assignments
    entity.count = BigInt.fromI32(0)
  }

  // BigInt and BigDecimal math are supported
  entity.count = entity.count + BigInt.fromI32(1)

  // Entity fields can be set based on event parameters
  entity.lender = event.params.lender
  entity.token = event.params.token

  // Entities can be written to the store with `.save()`
  entity.save()

  // Note: If a handler doesn't require existing field values, it is faster
  // _not_ to load the entity from the store. Instead, create it fresh with
  // `new Entity(...)`, set the fields that should be updated and save the
  // entity back to the store. Fields that were not set or unset remain
  // unchanged, allowing for partial updates to be applied.

  // It is also possible to access smart contracts from mappings. For
  // example, the contract that has emitted the event can be connected to
  // with:
  //
  // let contract = Contract.bind(event.address)
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

export function handleBorrow(event: Borrow): void {}

export function handleCloseDebtPosition(event: CloseDebtPosition): void {}

export function handleDefault(event: Default): void {}

export function handleDeployLoan(event: DeployLoan): void {}

export function handleInterestAccrued(event: InterestAccrued): void {}

export function handleLiquidate(event: Liquidate): void {}

export function handleMutualUpgradeRegistered(
  event: MutualUpgradeRegistered
): void {}

export function handleRepayInterest(event: RepayInterest): void {}

export function handleRepayPrincipal(event: RepayPrincipal): void {}

export function handleUpdateLoanStatus(event: UpdateLoanStatus): void {}

export function handleWithdraw(event: Withdraw): void {}
