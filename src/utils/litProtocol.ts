/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable no-var */

export {};

declare global {
    const __createBinding: (o: any, m: any, k: string, k2?: string) => void;
    const __setModuleDefault: (o: any, v: any) => void;
    const __importStar: <T>(mod: T) => T;
    // const __importDefault: <T>(mod: T) => T | { default: T };
}

"use strict";
const __createBinding = function(o: any, m: any, k: string, k2?: string): void {
  if (k2 === undefined) k2 = k;
  let desc = Object.getOwnPropertyDescriptor(m, k);
  if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
    desc = { enumerable: true, get: function() { return m[k]; } };
  }
  Object.defineProperty(o, k2, desc);
};

const __setModuleDefault = function(o: any, v: any): void {
  Object.defineProperty(o, "default", { enumerable: true, value: v });
};

const __importStar = function(mod: any) {
  if (mod && mod.__esModule) return mod;
  const result = {};
  if (mod != null) for (const k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
  __setModuleDefault(result, mod);
  return result;
};

const __importDefault = function(mod: any) {
  return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bundleCodeManual = exports.hashHex = exports.generateSecureRandomKey = exports.getBytesFromMultihash = exports.generateSessionSig = void 0;
const ethers_1 = require("ethers");
const bs58_1 = __importDefault(require("bs58"));
const constants_1 = require("./../../src/constants");
const auth_helpers_1 = require("@lit-protocol/auth-helpers");
let cryptoLib: typeof import("crypto");
let CryptoJSInstance: typeof import("crypto-js");
const loadNodebuild = async () => {
  if (typeof window === "undefined") {
    const stream = await Promise.resolve().then(() => __importStar(require("stream")));
    cryptoLib = await Promise.resolve().then(() => __importStar(require("crypto")));
    CryptoJSInstance = await Promise.resolve().then(() => __importStar(require("crypto-js")));
  }
};
loadNodebuild();
export const generateSessionSig = async (client, signer, pkpPublicKey, resources = [], chainId = 1, uri = "https://localhost/login", version = "1") => {
  try {
    resources =
            resources.length > 0
              ? resources
              : [
                {
                  resource: new auth_helpers_1.LitPKPResource("*"),
                  ability: auth_helpers_1.LitAbility.PKPSigning,
                },
                {
                  resource: new auth_helpers_1.LitActionResource("*"),
                  ability: auth_helpers_1.LitAbility.LitActionExecution,
                },
              ];
    const sessionSigs = await client.getSessionSigs({
      chain: "ethereum",
      resourceAbilityRequests: resources,
      authNeededCallback: async (params) => {
        console.log("resourceAbilityRequests:", params.resources);
        if (!params.expiration) {
          throw new Error("expiration is required");
        }
        if (!params.resources) {
          throw new Error("resourceAbilityRequests is required");
        }
        if (!params.uri) {
          throw new Error("uri is required");
        }
        const blockHash = await client.getLatestBlockhash();
        const authSig = await generateAuthSig(client, signer, blockHash, params.resourceAbilityRequests, 1, params.uri);
        return authSig;
      },
    });
    return sessionSigs;
  }
  catch (err) {
    throw new Error(`Error generating signed message ${err}`);
  }
};
const generateAuthSig = async (client, signer, blockHash, resources, chainId = 1, uri = "https://localhost/login", version = "1") => {
  let address = await signer.getAddress();
  address = ethers_1.ethers.utils.getAddress(address);
  const message = await (0, auth_helpers_1.createSiweMessageWithRecaps)({
    walletAddress: address,
    nonce: blockHash,
    litNodeClient: client,
    expiration: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    resources,
    uri,
  });
  const sig = await signer.signMessage(message);
  return {
    sig,
    derivedVia: "web3.eth.personal.sign",
    signedMessage: message,
    address: address,
  };
};
export const getBytesFromMultihash = (multihash) => {
  const decoded = bs58_1.default.decode(multihash);
  return `0x${Buffer.from(decoded).toString("hex")}`;
};
export const generateSecureRandomKey = () => {
  if (!cryptoLib) {
    throw new Error("This function can only be run in a Node.js environment.");
  }
  return cryptoLib.randomBytes(32).toString("hex");
};
export const hashHex = async (input) => {
  await loadNodebuild();
  if (!CryptoJSInstance) {
    throw new Error("This function can only be run in a Node.js environment.");
  }
  const hash = CryptoJSInstance.SHA256(input);
  return "0x" + hash.toString(CryptoJSInstance.enc.Hex);
};
export const bundleCodeManual = (dynamicCode) => {
  return constants_1.DENO_BUNDLED + "\n\n" + dynamicCode;
};
exports.bundleCodeManual = bundleCodeManual;

// exports.generateSessionSig = generateSessionSig;
// exports.getBytesFromMultihash = getBytesFromMultihash;
// exports.generateSecureRandomKey = generateSecureRandomKey;
// exports.hashHex = hashHex;