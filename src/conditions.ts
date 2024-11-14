/* eslint-disable @typescript-eslint/no-var-requires */
export {}; 

"use strict";
const __importDefault = function (mod) {
  return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConditionMonitor = void 0;
const axios_1 = __importDefault(require("axios"));
const ethers_1 = require("ethers");
const events_1 = require("events");
const lit_listener_sdk_1 = require("./@types/lit-listener-sdk");
export class ConditionMonitor extends events_1.EventEmitter {
  constructor() {
    super();
    this.createCondition = async (condition, errorHandlingModeStrict) => {
      if (condition instanceof lit_listener_sdk_1.WebhookCondition) {
        await this.retry(() => this.startMonitoringWebHook(condition), 3, errorHandlingModeStrict, condition);
      }
      else if (condition instanceof lit_listener_sdk_1.ContractCondition) {
        await this.retry(() => this.startMonitoringContract(condition), 3, errorHandlingModeStrict, condition);
      }
    };
    this.startMonitoringWebHook = async (condition) => {
      const webhookListener = async () => {
        try {
          const headers = condition.apiKey
            ? { Authorization: `Bearer ${condition.apiKey}` }
            : undefined;
          const response = await axios_1.default.get(`${condition.baseUrl}${condition.endpoint}`, { headers });
          let value = response.data;
          let pathParts = condition.responsePath.split(".");
          pathParts = pathParts.flatMap((part) => part.split(/\[(.*?)\]/).filter(Boolean));
          for (const part of pathParts) {
            if (!isNaN(parseInt(part))) {
              value = value[parseInt(part)];
            }
            else {
              value = value[part];
            }
            if (value === undefined) {
              throw new Error(`Invalid response path: ${condition.responsePath}`);
            }
          }
          await this.checkAgainstExpected(condition, value);
        }
        catch (error) {
          condition.onError(error);
          this.emit("conditionError", error, condition);
          throw new Error(`Error in Webhook Action: ${error.message}`);
        }
      };
      return webhookListener();
    };
    this.startMonitoringContract = async (condition) => {
      try {
        const { contractAddress, abi, eventName, providerURL } = condition.contractAddress;
        const checkProviderValid = await this.checkProvider(providerURL);
        if (!providerURL || !checkProviderValid) {
          this.emit("conditionError", "Error: Invalid Provider URL.", condition);
          throw new Error("Error: Invalid Provider URL.");
        }
        const contract = new ethers_1.ethers.Contract(contractAddress, abi, new ethers_1.ethers.providers.JsonRpcProvider(providerURL, lit_listener_sdk_1.LitChainIds[condition.chainId]));
        const processEvent = async (...args) => {
          const eventData = args.pop();
          if (!eventData.args) {
            this.emit("conditionError", "Error in Retrieving contract args.", condition);
            throw new Error("Error in Retrieving contract args.");
          }
          try {
            const emittedValues = condition.contractAddress.eventArgName.map((argName) => {
              const value = eventData.args[argName];
              if (value === undefined) {
                throw new Error(`Argument '${argName}' not found in event arguments.`);
              }
              return value;
            });
            await this.checkAgainstExpected(condition.contractAddress, emittedValues);
          }
          catch (error) {
            condition.onError(error);
            this.emit("conditionError", error, condition);
          }
        };
        const subscribeToEvent = () => {
          contract.on(eventName, processEvent);
          console.log("Subscribed!");
        };
        return subscribeToEvent();
      }
      catch (error) {
        condition.onError(error);
        this.emit("conditionError", error, condition);
        throw new Error(`Error in Contract Action: ${error.message}`);
      }
    };
    this.checkAgainstExpected = async (condition, emittedValue) => {
      let match = false;
            
      const expectedValue = condition.expectedValue;
      const matchOperator = condition.matchOperator;
            
      if (typeof expectedValue === "number" ||
                typeof expectedValue === "string" ||
                typeof expectedValue === "bigint") {
        match = this.compareValues(expectedValue, emittedValue, matchOperator);
      }
      else if (Array.isArray(expectedValue) && Array.isArray(emittedValue)) {
        if (expectedValue.length !== emittedValue.length) {
          match = false;
        } else {
          match = expectedValue.every((expected, index) => {
            const emitted = emittedValue[index];
            return this.compareValues(expected, emitted, matchOperator);
          });
        }
      }
      else if (typeof expectedValue === "object" && typeof emittedValue === "object") {
        const expectedKeys = Object.keys(expectedValue);
        const emittedKeys = Object.keys(emittedValue);
                
        if (expectedKeys.length !== emittedKeys.length) {
          match = false;
        } else {
          match = expectedKeys.every((key) => {
            return this.compareValues(expectedValue[key], emittedValue[key], matchOperator);
          });
        }
      }
        
      try {
        if (match) {
          await condition.onMatched(emittedValue);
          console.log("Emitted Values: ", emittedValue);
          this.emit("conditionMatched", emittedValue);
        } else {
          await condition.onUnMatched(emittedValue);
          console.log("Emitted Values: ", emittedValue);
          this.emit("conditionNotMatched", emittedValue);
        }
      } catch (error) {
        throw new Error(`Error in Checking Against Expected Values: ${error.message}`);
      }
    };
    this.compareValues = (expectedValue, emittedValue, operator) => {
      if (ethers_1.ethers.BigNumber.isBigNumber(expectedValue) &&
                ethers_1.ethers.BigNumber.isBigNumber(emittedValue)) {
        switch (operator) {
        case "<":
          return emittedValue.lt(expectedValue);
        case ">":
          return emittedValue.gt(expectedValue);
        case "==":
        case "===":
          return emittedValue.eq(expectedValue);
        case "!==":
        case "!=":
          return !emittedValue.eq(expectedValue);
        case ">=":
          return emittedValue.gte(expectedValue);
        case "<=":
          return emittedValue.lte(expectedValue);
        }
      }
      else if (typeof expectedValue === "object" &&
                typeof emittedValue === "object") {
        switch (operator) {
        case "==":
        case "===":
          return this.deepEqualObjects(emittedValue, expectedValue);
        case "!=":
        case "!==":
          return !this.deepEqualObjects(emittedValue, expectedValue);
        default:
          throw new Error(`Operator '${operator}' not supported for object comparison.`);
        }
      }
      else {
        switch (operator) {
        case "<":
          return emittedValue < expectedValue;
        case ">":
          return emittedValue > expectedValue;
        case "==":
          return emittedValue == expectedValue;
        case "===":
          return emittedValue === expectedValue;
        case "!==":
          return emittedValue !== expectedValue;
        case "!=":
          return emittedValue != expectedValue;
        case ">=":
          return emittedValue >= expectedValue;
        case "<=":
          return emittedValue <= expectedValue;
        }
      }
    };
    this.deepEqualObjects = (obj1, obj2) => {
      return JSON.stringify(obj1) === JSON.stringify(obj2);
    };
    this.checkProvider = async (providerURL) => {
      try {
        const provider = new ethers_1.ethers.providers.JsonRpcProvider(providerURL);
        const network = await provider.send("eth_blockNumber", []);
        return true;
      } catch (error) {
        console.log("Provider check failed:", error);
        return false;
      }
    };
    this.retry = async (fn, retryCount = 3, errorHandlingModeStrict, condition) => {
      for (let i = 0; i < retryCount; i++) {
        try {
          await fn();
          break;
        }
        catch (err) {
          if (errorHandlingModeStrict) {
            this.emit("conditionError", err, condition);
            throw new Error(`Error in checking conditions: ${err.message}`);
          }
          else {
            if (i === retryCount - 1) {
              this.emit("conditionNotMatched", err.message);
            }
          }
        }
      }
    };
  }
}
exports.ConditionMonitor = ConditionMonitor;
