import {
  log,
  crypto,
  Address,
  BigInt,
  ethereum,
  Bytes,
  ByteArray,
} from "@graphprotocol/graph-ts"

import { MutualConsentRegistered } from "../../generated/templates/SecuredLine/SecuredLine"
import {
  Spigot,
  SpigotController,
  Position,
  Lender,
  
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
  getOrCreateToken
} from "./utils";

// Mutual Consent Function Signatures
// generated IDs on remix then copied over
const ADD_CREDIT_FUNC = '0xcb836209'; // 
const ADD_CREDIT_ABI = '(uint128,uint128,uint256,address,address)';
const ADD_CREDIT_U32 = 0;
const ADD_SPIGOT_FUNC = ''; // todo cant get struct to work on remix
const ADD_SPIGOT_ABI = '(bytes32,uint256)';
const ADD_SPIGOT_U32 = 1;
const SET_RATES_FUNC = '0xac856fac';
const SET_RATES_ABI = '(bytes32,uint128,uint128)';
const SET_RATES_U32 = 2;
const INCREASE_CREDIT_FUNC = '0xc3651574';
const INCREASE_CREDIT_ABI = '(address,uint8,bytes4,bytes4)';
const INCREASE_CREDIT_U32 = 3;

export const MUTUAL_CONSENT_FUNCTIONS = new Map<string, u32>(); 
MUTUAL_CONSENT_FUNCTIONS.set(ADD_CREDIT_FUNC, ADD_CREDIT_U32);
MUTUAL_CONSENT_FUNCTIONS.set(INCREASE_CREDIT_FUNC, ADD_SPIGOT_U32);
MUTUAL_CONSENT_FUNCTIONS.set(SET_RATES_FUNC, SET_RATES_U32);
MUTUAL_CONSENT_FUNCTIONS.set(ADD_SPIGOT_FUNC, INCREASE_CREDIT_U32);  // on SpigotedLine 


const CREDIT_LIB_GOERLI_ADDRESS: Address = Address.fromString("0x09a8d8eD61D117A3C550345BcA19bf0B8237B27e");

export function handleMutualConsentEvents(event: MutualConsentRegistered): void {
    // event emits mutual consent hash which is not useful
    // use function input params and decode them instead
    const functionSig = event.transaction.input.toHexString().slice(0, 10);
    const hasFunc = MUTUAL_CONSENT_FUNCTIONS.has(functionSig);
    log.warning('mutual consent mappings {} {}', [functionSig, hasFunc.toString()]);
  
    if(!hasFunc) {
      log.warning(
        'No Mutual Consent Function registered in config for signature {}, total input is {}',
        [functionSig, event.transaction.input.toHexString()]
      );
      return;
    }
  
    const funcType = MUTUAL_CONSENT_FUNCTIONS.get(functionSig);
    let inputParams: Bytes[] | null;
    
    switch(funcType) {
       // assembly script is retarded and doesnt allow switch cases on strings so we have to use numbers
      case ADD_CREDIT_U32:
        const inputs = decodeTxData(event.transaction.input.toHexString(), ADD_CREDIT_ABI);
        if (inputs) {
          handleAddCreditMutualConsent(event, inputs);
        }
        break;
      case INCREASE_CREDIT_U32:
        break;
      case ADD_SPIGOT_U32:
        break;
      case SET_RATES_U32:
        break;
      default:
        break;
    }

    // emit event for new terms
    if(inputParams!) {
      const eventId = getEventId(event.block.number, event.logIndex);
      const proposalEvent = new ProposeTermsEvent(eventId);
      proposalEvent.block = event.block.number;
      proposalEvent.timestamp = event.block.timestamp;
      proposalEvent.line = event.address.toHexString();
      proposalEvent.funcSignature = functionSig;
      // TODO return creditID from functions to save here
      proposalEvent.position = getNullPosition();
      // proposalEvent.params = inputParams! || [];

      proposalEvent.save();
    }
}

function computeId(line: Address, lender: Address, token: Address): string {
  const data = ethereum.encode(
    ethereum.Value.fromAddressArray([line, lender, token])
  );
  return data ? crypto.keccak256(data).toHexString() : '0xblahblag';
}

function handleAddCreditMutualConsent(event: MutualConsentRegistered, inputParams: ethereum.Tuple | null): void {
  if(!inputParams) {
    log.warning('could not get input params for AddCredit mutual consent proposal', []);
    return;
  }
  
  // breakdown addCrdit function input params into individual values in typescript
  // ADD_CREDIT_ABI = '(uint128,uint128,uint256,address,address)';
  const args: string[] = [
    inputParams[0].toBigInt().toString(),
    inputParams[1].toBigInt().toString(),
    inputParams[2].toBigInt().toString(),
    inputParams[3].toAddress().toHexString(),
    inputParams[4].toAddress().toHexString()
  ];

  // log.warning('add credit inputs [1]. {} [2]. {} [3]. {} [4].  {} [5].  {}', args);
  
  log.warning(
    'line, lender, token addy for compute id {} ----- {} ------- {}',
    [event.address.toHexString(), args[3], args[4]]
  );

  // generate position id from inputParam data
  let id = '';
  const computeResult = CreditLib.bind(CREDIT_LIB_GOERLI_ADDRESS).try_computeId(
    event.address,
    Address.fromString(args[4]),
    Address.fromString(args[3])
  );
  
  log.warning('credit lib computing position id {}', [computeResult.value.toHexString()]);

  if(!computeResult.reverted) {
    log.warning('line lib computed id {}', [computeResult.value.toHexString()]);
    id = computeResult.value.toHexString()
  } else {
    // log.warning("computing position ID call to lib failed. inputs {}", [event.transaction.input.toHexString()]);
    
    // this doesnt work for whatever reason. Returns a different result than CreditLib
    // id = computeId(
    //   event.address,
    //   Address.fromString(args[4]),
    //   Address.fromString(args[3])
    // );
    // log.warning("assemblyscript computing position success. ID {}", [id]);
  }
  
  log.warning("final addCredit position id {}", [id]);

  if(!id) return;

  // credit hasnt been created yet so assume none exists in the db already 
  // some data will be overwritten but not events
  let credit = new Position(id);
  credit.line = event.address.toHexString(); // line entity must exist for proposal to happen
  credit.status = POSITION_STATUS_PROPOSED;
  
  // fill with null data since position doesnt exist yet
  
  credit.borrower = ZERO_ADDRESS_STR; // TODO: pull from line contract or entity
  credit.queue = NOT_IN_QUEUE.toI32();
  credit.principal = BIG_INT_ZERO;
  credit.interestAccrued = BIG_INT_ZERO;
  credit.interestRepaid = BIG_INT_ZERO;
  credit.totalInterestEarned = BIG_INT_ZERO;
  
  credit.principalUsd = BIG_DECIMAL_ZERO;
  credit.interestUsd = BIG_DECIMAL_ZERO;
  
  const dRate = args[0] && args[0].length > 10 ? args[0].slice(0, 4) : args[0];
  const fRate = args[1] && args[1].length > 10 ? args[1].slice(0, 4) : args[1];
  
  credit.dRate = BigInt.fromString(dRate).toI32();
  credit.fRate = BigInt.fromString(fRate).toI32();

  credit.deposit =  BigInt.fromString(args[2]);
  
  const lendy = new Lender(args[4]);
  lendy.save(); // ensure entity persists
  credit.lender = lendy.id;
  credit.token = getOrCreateToken(args[3]).id;
  
  log.warning("saving credit to {}", [id]);
  credit.save();
}


function decodeTxData(rawTxData: string, decodeTemplate: string): ethereum.Tuple | null {
  const inputs = rawTxData.slice(10);
  const encodedData = Bytes.fromHexString(inputs);
  const decoded = ethereum.decode(decodeTemplate, encodedData);
  return decoded ? decoded.toTuple() : null;
}
