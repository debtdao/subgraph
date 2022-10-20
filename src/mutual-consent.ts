import {
  log,
  Address,
  BigInt,
  ethereum,
  Bytes,
} from "@graphprotocol/graph-ts"

import { MutualConsentRegistered } from "../generated/templates/SecuredLine/SecuredLine"
import {
  Spigot,
  SpigotController,
  Credit,
  
  AddCreditEvent,
  IncreaseCreditEvent,
  SetRatesEvent,
  AddSpigotEvent,
} from '../generated/schema';
import { LiquidateCall__Outputs } from "../generated/templates/Escrow/Escrow";

// Mutual Consent Function Signatures
// generated IDs on remix then copied over
const ADD_CREDIT_FUNC = '0xcb836209'; // 
const ADD_CREDIT_ABI = 'uint128,uint128,uint256,address,address';
const ADD_CREDIT_U32 = 0;
const ADD_SPIGOT_FUNC = ''; // todo cant get struct to work on remix
const ADD_SPIGOT_ABI = 'bytes32,uint256';
const ADD_SPIGOT_U32 = 1;
const SET_RATES_FUNC = '0xac856fac';
const SET_RATES_ABI = 'bytes32,uint128,uint128';
const SET_RATES_U32 = 2;
const INCREASE_CREDIT_FUNC = '0xc3651574';
const INCREASE_CREDIT_ABI = 'address,uint8,bytes4,bytes4';
const INCREASE_CREDIT_U32 = 3;

export const MUTUAL_CONSENT_FUNCTIONS = new Map<string, u32>(); 
MUTUAL_CONSENT_FUNCTIONS.set(ADD_CREDIT_FUNC, ADD_CREDIT_U32);
MUTUAL_CONSENT_FUNCTIONS.set(INCREASE_CREDIT_FUNC, ADD_SPIGOT_U32);
MUTUAL_CONSENT_FUNCTIONS.set(SET_RATES_FUNC, SET_RATES_U32);
MUTUAL_CONSENT_FUNCTIONS.set(ADD_SPIGOT_FUNC, INCREASE_CREDIT_U32);  // on SpigotedLine 


export function handleMutualConsentEvents(event: MutualConsentRegistered): void {
    // event emits hash, we use tx data directly for 
    const functionSig = event.transaction.input.toHexString().slice(2, 10);
    const hasFunc = MUTUAL_CONSENT_FUNCTIONS.has(functionSig);
    log.warning('mutual consent mappings {} {}', [functionSig, hasFunc.toString()]);
  
    if(!hasFunc) {
      log.warning(
        'No Mutual Consent Function registered in config for signature {}, total input is {}',
        [functionSig]
      );
      return;
    }
  
    const funcType = MUTUAL_CONSENT_FUNCTIONS.get(functionSig);

    switch(funcType) {
       // assembly script is retarded and doesnt allow switch cases on strings so we have to use numbers
      case ADD_CREDIT_U32:
        handleAddCreditMutualConsent(event);
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
}


function handleAddCreditMutualConsent(event: MutualConsentRegistered): void {
  // credit hasnt been created yet so assume none exists in the db already (some data will be overwritten but not events)
  const inputParams = decodeTxData(event.transaction.input.toHexString(), ADD_CREDIT_ABI);
  if(!inputParams) {
    log.warning('could not get input params for AddCredit mutual consent proposal', []);
  }
  // const credit = new Credit();
}


function decodeTxData(rawTxData: string, decodeTemplate: string): ethereum.Tuple | null {
  const functionParams = rawTxData.slice(8);
  const encodedData = Bytes.fromHexString('0x'+rawTxData)
  const decoded = ethereum.decode(decodeTemplate, encodedData);
  return decoded ?  decoded.toTuple() : null;
}
