import {
  log,
  crypto,
  Address,
  BigInt,
  ethereum,
  Bytes,
  ByteArray,
  dataSource,
} from "@graphprotocol/graph-ts"

import { MutualConsentRegistered } from "../../generated/templates/SecuredLine/SecuredLine"
import {
  Spigot,
  SpigotController,
  Position,
  MarketplaceActor,
  Proposal,
  
  AddCreditEvent,
  IncreaseCreditEvent,
  SetRatesEvent,
  AddSpigotEvent,
  ProposeTermsEvent,
} from '../../generated/schema';
import { CreditLib } from "../../generated/templates/SecuredLine/CreditLib";

import {
  BYTES32_ZERO_STR,
  POSITION_STATUS_PROPOSED,
  BIG_INT_ZERO,
  getEventId,
  getNullPosition,
  NOT_IN_QUEUE,
  BIG_DECIMAL_ZERO,
  getNullToken,
  ZERO_ADDRESS_STR,
  getOrCreateToken,
  POSITION_STATUS_OPENED
} from "./utils";
import { Burn__Params } from "../../generated/templates/Spigot/UniswapPair";

// Mutual Consent Function Signatures
// generated IDs on remix then copied over
const ADD_CREDIT_U32 = 0;
const ADD_CREDIT_FUNC = '0xcb836209';
const ADD_CREDIT_ABI = '(uint128,uint128,uint256,address,address)';
const SET_RATES_U32 = 2;
const SET_RATES_FUNC = '0xac856fac';
const SET_RATES_ABI = '(bytes32,uint128,uint128)';
const INCREASE_CREDIT_U32 = 3;
const INCREASE_CREDIT_FUNC = '0xc3651574';
const INCREASE_CREDIT_ABI = '(address,uint8,bytes4,bytes4)';

export const MUTUAL_CONSENT_FUNCTIONS = new Map<string, u32>(); 
MUTUAL_CONSENT_FUNCTIONS.set(ADD_CREDIT_FUNC, ADD_CREDIT_U32);
MUTUAL_CONSENT_FUNCTIONS.set(INCREASE_CREDIT_FUNC, INCREASE_CREDIT_U32);
MUTUAL_CONSENT_FUNCTIONS.set(SET_RATES_FUNC, SET_RATES_U32);

// type yo_oy = string | number | Bytes | Address | BigInt
type dot_top = string[]

const CREDIT_LIB_GOERLI_ADDRESS: Address = Address.fromString("0x09a8d8eD61D117A3C550345BcA19bf0B8237B27e");
const CREDIT_LIB_MAINNET_ADDRESS: Address = Address.fromString("0x8e73667B175887B106A9F803F8b62DeffC11535e");

export function handleMutualConsentEvents(event: MutualConsentRegistered): void {
    // event emits mutual consent hash which is not useful
    // use function input params and decode them instead
    const functionSig = event.transaction.input.toHexString().slice(0, 10);
    const hasFunc = MUTUAL_CONSENT_FUNCTIONS.has(functionSig);
    // log.warning('mutual consent mappings {} {}', [functionSig, hasFunc.toString()]);
  
    if(!hasFunc) {
      log.warning(
        'No Mutual Consent Function registered in config for signature {}, total input is {}',
        [functionSig, event.transaction.input.toHexString()]
      );
      return;
    }
  
    const funcType = MUTUAL_CONSENT_FUNCTIONS.get(functionSig);
    
    switch(funcType) {
       // assembly script is retarded and doesnt allow switch cases on strings so we have to use numbers
      case ADD_CREDIT_U32:
        const inputs = decodeTxData(event.transaction.input.toHexString(), ADD_CREDIT_ABI);
    log.warning("get proposal inputs succeed? - {}, {}", [(!inputs).toString()])
    if (inputs) {
          // breakdown addCrdit function input params into individual values in typescript
          // ADD_CREDIT_ABI = '(uint128,uint128,uint256,address,address)';
          const args: string[] = [
            inputs[0].toBigInt().toString(),
            inputs[1].toBigInt().toString(),
            inputs[2].toBigInt().toString(),
            inputs[3].toAddress().toHexString(),
            inputs[4].toAddress().toHexString()
          ];
          const positionId = handleAddCreditMutualConsent(event, args);
          createProposal(event, functionSig, args, positionId);
        }
        break;
      case INCREASE_CREDIT_U32:
        break;
      case SET_RATES_U32:
        break;
      default:
        break;
    }
}

function createProposal(
  event: MutualConsentRegistered,
  functionSig: string,
  args: dot_top,
  positionId: string = BYTES32_ZERO_STR
): void {
  const proposalId = event.params.proposalId.toHexString();
  const proposal = new Proposal(proposalId);
  
  proposal.line = event.address.toHexString();
  log.warning("create proposal id, pos, line - {}, {}, {}", [proposalId, positionId, event.transaction.input.toHexString()])
  proposal.position = positionId;
  proposal.mutualConsentFunc = functionSig;
  proposal.maker = event.transaction.from.toHexString();
  proposal.taker = event.params.taker.toHexString();
  proposal.proposedAt = event.block.timestamp;
  proposal.msgData = event.transaction.input // TODO extrace from multisig data
  proposal.txInput = event.transaction.input
  proposal.args = args;
  proposal.save()

  const eventId = getEventId(typeof ProposeTermsEvent, event.transaction.hash, event.logIndex);
  const proposalEvent = new ProposeTermsEvent(eventId);
  proposalEvent.block = event.block.number;
  proposalEvent.timestamp = event.block.timestamp;
  proposalEvent.proposal = proposalId;
  proposalEvent.line = event.address.toHexString();

  proposalEvent.save();
}

// manually compute position id if call to onchain lib used fails.
function computeId(line: Address, lender: Address, token: Address): string {
  const data = ethereum.encode(
    ethereum.Value.fromAddressArray([line, lender, token])
  );
  return data ? crypto.keccak256(data).toHexString() : '';
}

function getCreditLibForNetwork(): CreditLib {
  const network = dataSource.network()
  // log.warning('subgraph network {}, is main/test {}/{}', [network, (network == 'mainnet').toString(), (network == 'goerli').toString()]);
  
  if( network == 'mainnet' ) {
    return CreditLib.bind(CREDIT_LIB_MAINNET_ADDRESS);
  } else if ( network == 'goerli' ) {
    return CreditLib.bind(CREDIT_LIB_GOERLI_ADDRESS);
  } else {
    return CreditLib.bind(CREDIT_LIB_GOERLI_ADDRESS);
  }
} 

function handleAddCreditMutualConsent(event: MutualConsentRegistered, args: dot_top | null): string {
  if(!args) {
    log.warning('could not get input params for AddCredit mutual consent proposal', []);
    return BYTES32_ZERO_STR;
  }

  // generate position id from inputParam data
  let id = '';
  const creditLib = getCreditLibForNetwork();

  // log.warning("compute positoin id linelender,token ", [event.address.toHexString(), args[4], args[3]])
  const computeResult = creditLib.try_computeId(
    event.address,
    Address.fromString(args[4]),
    Address.fromString(args[3])
  );

  log.warning("Credit Lib for network *{}* =  {}. Call failed ?= {}", [dataSource.network(), creditLib._address.toHexString(), computeResult.reverted.toString()])
  // log.warning('credit lib computing position id {}', [computeResult.value.toHexString()]);

  if(!computeResult.reverted) {
    // log.warning('line lib computed id {}', [computeResult.value.toHexString()]);
    id = computeResult.value.toHexString()
  } else {
    log.warning("computing position ID call to lib failed. inputs {}", [event.transaction.input.toHexString()]);
    
    // this doesnt work for whatever reason. Returns a different result than CreditLib
    // id = computeId(
    //   event.address,
    //   Address.fromString(args[4]),
    //   Address.fromString(args[3])
    // );
    // log.warning("assemblyscript computing position success. ID {}", [id]);
  }

  // cant compute position from input params. revert bc cant instantiate position
  if(!id) return BYTES32_ZERO_STR;

  // credit hasnt been created yet so assume none exists in the db already 
  // some data will be overwritten but not events
  let credit = Position.load(id);

  // we already accepted a proposal. dont overwrite position
  if(credit && credit.status == POSITION_STATUS_OPENED) return id;
  else credit = new Position(id);

  credit.line = event.address.toHexString(); // line entity must exist for proposal to happen
  credit.status = POSITION_STATUS_PROPOSED;
  
  // fill with null data since position doesnt exist yet
  
  // Exact position terms are null on proposal. Fill in hanldeAddCredit.
  credit.borrower = ZERO_ADDRESS_STR;
  credit.queue = NOT_IN_QUEUE.toI32();
  credit.principal = BIG_INT_ZERO;
  credit.interestAccrued = BIG_INT_ZERO;
  credit.interestRepaid = BIG_INT_ZERO;
  credit.totalInterestEarned = BIG_INT_ZERO;
  credit.principalUsd = BIG_DECIMAL_ZERO;
  credit.interestUsd = BIG_DECIMAL_ZERO;
  credit.dRate = 0;
  credit.fRate = 0;
  credit.deposit = BIG_INT_ZERO;

 // lender MUST be the same for one position across multiple prososals
  const lendy = new MarketplaceActor(args[4]);
  lendy.save(); // ensure entity persists
  credit.lender = lendy.id;
  credit.token = getOrCreateToken(args[3]).id;

  // log.warning('could not get input params for AddCredit mutual consent proposal', []);
  // log.warning("saving credit propoal to {} from proposer {}", [id, event.transaction.from.toHexString()]);
  log.warning("propsoal params d/fRate - {}/{} - amount {} -  token {} - lender {}", args);
  credit.save();

  return id;
}


function decodeTxData(rawTxData: string, decodeTemplate: string): ethereum.Tuple | null {
  // NOTE: this only works for EOAs. if tx sent by multisig then data comes in a different format.
  // TODO: add support for gnosis multisig tx formats
  const inputs = rawTxData.slice(10);
  const encodedData = Bytes.fromHexString(inputs);
  const decoded = ethereum.decode(decodeTemplate, encodedData);
  return decoded ? decoded.toTuple() : null;
}
