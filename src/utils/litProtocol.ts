import { ethers } from "ethers";
import bs58 from "bs58";
import {
  SessionSigsMap,
  AuthSig,
  AuthCallbackParams,
} from "@lit-protocol/types";
import { DENO_BUNDLED } from "../constants";
import { LitNodeClient } from "@lit-protocol/lit-node-client";
import {
  LitAbility,
  LitActionResource,
  LitPKPResource,
  LitResourceAbilityRequest,
  createSiweMessageWithRecaps,
} from "@lit-protocol/auth-helpers";

let cryptoLib: any, cryptoJSInstance: any;

const loadNodebuild = async () => {
  if (typeof window === "undefined") {
    const stream = await import("stream");
    cryptoLib = await import("crypto");
    cryptoJSInstance = await import("crypto-js");
  }
};

loadNodebuild();

export const generateSessionSig = async (
  client: any,
  signer: ethers.Signer,
  pkpPublicKey: string,
  resources: any[] = [],
  chainId = 1,
  uri = "https://localhost/login",
  version = "1"
): Promise<any> => {
  try {
    resources = resources.length > 0
      ? resources
      : [
        {
          resource: new LitPKPResource("*"),
          ability: LitAbility.PKPSigning,
        },
        {
          resource: new LitActionResource("*"),
          ability: LitAbility.LitActionExecution,
        },
      ];

    const sessionSigs = await client.getSessionSigs({
      chain: "ethereum",
      resourceAbilityRequests: resources,
      authNeededCallback: async (params: any) => {
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
        const authSig = await generateAuthSig(
          client,
          signer,
          blockHash,
          params.resourceAbilityRequests,
          1,
          params.uri
        );
        return authSig;
      },
    });
    return sessionSigs;
  } catch (err) {
    throw new Error(`Error generating signed message ${err}`);
  }
};

const generateAuthSig = async (
  client: any,
  signer: ethers.Signer,
  blockHash: string,
  resources: any[],
  chainId = 1,
  uri = "https://localhost/login",
  version = "1"
): Promise<any> => {
  let address = await signer.getAddress();
  address = ethers.utils.getAddress(address);

  const message = await createSiweMessageWithRecaps({
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

export const getBytesFromMultihash = (multihash: string): string => {
  const decoded = bs58.decode(multihash);
  return `0x${Buffer.from(decoded).toString("hex")}`;
};

export const generateSecureRandomKey = (): string => {
  if (!cryptoLib) {
    throw new Error("This function can only be run in a Node.js environment.");
  }
  return cryptoLib.randomBytes(32).toString("hex");
};

export const hashHex = async (input: string): Promise<string> => {
  await loadNodebuild();
  if (!cryptoJSInstance) {
    throw new Error("This function can only be run in a Node.js environment.");
  }
  const hash = cryptoJSInstance.SHA256(input);
  return "0x" + hash.toString(cryptoJSInstance.enc.Hex);
};

export const bundleCodeManual = (dynamicCode: string): string => {
  return DENO_BUNDLED + "\n\n" + dynamicCode;
};