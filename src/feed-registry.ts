// TODO: uncomment this file if want to use Chainlink Feed Registry

// import {
//   log,
//   Address,
//   Bytes,
//   BigInt,
//   BigDecimal,
// } from "@graphprotocol/graph-ts"

// import {
//   Token, Oracle, SupportedToken
// } from "../generated/schema";

// import {
//   FeedConfirmed
// } from "../generated/FeedRegistry/FeedRegistry"

// import {
//   getOrCreateToken
// } from "./utils/utils";

// export function handleAddSupportedToken(event: FeedConfirmed): void {

//   // Chainlink Feed Registry Address
//   const feedRegistryAddress = event.address.toHexString();

//   // Chainlink Feed Address and ERC20
//   let contractAddress = event.params.asset.toHexString();
//   let token = getOrCreateToken(contractAddress, true);

//   // Remove non-ERC20 compliant tokens
//   if (token.name !== "Unknown Token") {
//     let oracle = Oracle.load(feedRegistryAddress);
//     if(!oracle) {
//       oracle = new Oracle(feedRegistryAddress);
//     }
//     let supportedToken = SupportedToken.load(token.id.toString());
//     let oracles = [feedRegistryAddress];
//     if(!supportedToken) {
//       supportedToken = new SupportedToken(token.id.toString());
//       supportedToken.oracles = oracles;
//     } else {
//       oracles = supportedToken.oracles;
//       oracles.push(feedRegistryAddress);
//       supportedToken.oracles = oracles;
//     }
//     supportedToken.token = token.id;

//     // Save entities
//     token.save()
//     supportedToken.save();
//     oracle.save();
//   }
// }