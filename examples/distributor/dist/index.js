"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const iota_js_1 = require("@iota/iota.js");
const API_ENDPOINT = "http://localhost:14265";
// Amount to distribute (Should be equal to amount faucet sends to every address)
const AMOUNT = 1;
// Number of addresses to which the distribution should be made
const DISTRIBUTION_SPACE = 5;
const MAX_ADDRESS_LOOKUP_SPACE = DISTRIBUTION_SPACE * 5;
// Seed to spend funds from
const SEED = '256a818b2aac458941f7274985a410e57fb750f3a3a67969ece5bd9ae7eef5b2';
/**
 * Generates addresses
 *
 * @method getAddressesWithKeyPairs
 *
 * @param {number} start
 *
 * @returns {AddressWithKeyPairs[]}
 */
function getAddressesWithKeyPairs(start) {
    const walletSeed = new iota_js_1.Ed25519Seed(iota_js_1.Converter.hexToBytes(SEED));
    const addresses = [];
    for (let i = start; i < DISTRIBUTION_SPACE + start; i++) {
        const walletPath = new iota_js_1.Bip32Path(`m/44'/4218'/0'/0'/${i}'`);
        const walletAddressSeed = walletSeed.generateSeedFromPath(walletPath);
        const walletEd25519Address = new iota_js_1.Ed25519Address();
        const newAddress = walletEd25519Address.publicKeyToAddress(walletAddressSeed.keyPair().publicKey);
        addresses.push({
            address: iota_js_1.Bech32Helper.toBech32(iota_js_1.ED25519_ADDRESS_TYPE, newAddress),
            keyIndex: i,
            keyPair: walletAddressSeed.keyPair(),
            balance: 0
        });
    }
    return addresses;
}
function assignBalances(addresses) {
    return __awaiter(this, void 0, void 0, function* () {
        const addressesWithBalance = [];
        for (const addressObject of addresses) {
            const info = yield client.address(addressObject.address);
            addressesWithBalance.push(Object.assign({}, addressObject, {
                balance: info.balance
            }));
        }
        return addressesWithBalance;
    });
}
/**
 * @method prepareInputAndOutputs
 *
 * @param {number} start
 * @param {AddressWithKeyPairs[]} addresses
 *
 * @return {InputOutputs}
 */
function prepareInputAndOutputs(start = 0, addresses = []) {
    return __awaiter(this, void 0, void 0, function* () {
        if (start > MAX_ADDRESS_LOOKUP_SPACE) {
            throw new Error('Max attempts reached!');
        }
        addresses = [...addresses, ...getAddressesWithKeyPairs(start)];
        addresses = yield assignBalances(addresses);
        if (addresses.every((addressObject) => addressObject.balance === 0)) {
            return prepareInputAndOutputs(start + DISTRIBUTION_SPACE, addresses);
        }
        // Input should be the address with highest balance
        const input = addresses.reduce((acc, info) => acc.balance > info.balance ? acc : info);
        if (input.balance < DISTRIBUTION_SPACE * AMOUNT) {
            return prepareInputAndOutputs(start + DISTRIBUTION_SPACE, addresses);
        }
        const outputs = addresses.filter((addressObject) => addressObject.balance === 0 &&
            addressObject.address !== input.address).slice(0, DISTRIBUTION_SPACE);
        if (outputs.length < DISTRIBUTION_SPACE) {
            return prepareInputAndOutputs(start + DISTRIBUTION_SPACE, addresses);
        }
        return {
            inputAddresses: [input.address],
            outputAddresses: outputs.map((output) => output.address),
            input,
            outputs: [
                ...outputs
                    .map((addressObject) => ({
                    // @ts-ignore
                    address: iota_js_1.Converter.bytesToHex(iota_js_1.Bech32Helper.fromBech32(addressObject.address).addressBytes),
                    addressType: iota_js_1.ED25519_ADDRESS_TYPE,
                    amount: AMOUNT
                })),
                {
                    // @ts-ignore
                    // Send remainder to input address
                    address: iota_js_1.Converter.bytesToHex(iota_js_1.Bech32Helper.fromBech32(input.address).addressBytes),
                    addressType: iota_js_1.ED25519_ADDRESS_TYPE,
                    amount: input.balance - (AMOUNT * outputs.length)
                }
            ]
        };
    });
}
const client = new iota_js_1.SingleNodeClient(API_ENDPOINT);
/**
 * Distribute funds
 *
 * @method distribute
 *
 * @returns {Promise<DistributionResult>}
 */
function distribute() {
    return __awaiter(this, void 0, void 0, function* () {
        const { inputAddresses, outputAddresses, input, outputs } = yield prepareInputAndOutputs();
        const inputAddressOutputs = yield client.addressOutputs(input.address);
        const unspentOutputs = [];
        for (const outputId of inputAddressOutputs.outputIds) {
            const output = yield client.output(outputId);
            if (!output.isSpent) {
                unspentOutputs.push(output);
            }
        }
        if (!unspentOutputs.length) {
            throw new Error('No unspent outputs against input address.');
        }
        const inputs = unspentOutputs.map((output) => {
            return {
                input: {
                    type: 0,
                    transactionId: output.transactionId,
                    transactionOutputIndex: output.outputIndex
                },
                addressKeyPair: input.keyPair
            };
        });
        const { messageId } = yield iota_js_1.sendAdvanced(client, inputs, outputs, "WALLET");
        return {
            messageId,
            inputAddresses,
            outputAddresses
        };
    });
}
distribute()
    .then((result) => {
    console.info('-'.repeat(75));
    console.info('Funds distributed successfully!');
    console.info('Message ID: ', result.messageId);
    console.info('Sender address: ', result.inputAddresses[0]);
    console.info('Receiver addresses:');
    result.outputAddresses.forEach((address, idx) => {
        console.info(`${idx + 1}: ${address}`);
    });
    console.info('-'.repeat(75));
}).catch(console.error);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7QUFBQSwyQ0FXdUI7QUFFdkIsTUFBTSxZQUFZLEdBQUcsd0JBQXdCLENBQUM7QUFFOUMsaUZBQWlGO0FBQ2pGLE1BQU0sTUFBTSxHQUFHLENBQUMsQ0FBQztBQUVqQiwrREFBK0Q7QUFDL0QsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLENBQUM7QUFFN0IsTUFBTSx3QkFBd0IsR0FBRyxrQkFBa0IsR0FBRyxDQUFDLENBQUM7QUFFeEQsMkJBQTJCO0FBQzNCLE1BQU0sSUFBSSxHQUFHLGtFQUFrRSxDQUFDO0FBNEJoRjs7Ozs7Ozs7R0FRRztBQUNILFNBQVMsd0JBQXdCLENBQUMsS0FBYTtJQUMzQyxNQUFNLFVBQVUsR0FBRyxJQUFJLHFCQUFXLENBQUMsbUJBQVMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUUvRCxNQUFNLFNBQVMsR0FBRyxFQUFFLENBQUE7SUFFcEIsS0FBSyxJQUFJLENBQUMsR0FBRyxLQUFLLEVBQUUsQ0FBQyxHQUFHLGtCQUFrQixHQUFHLEtBQUssRUFBRSxDQUFDLEVBQUUsRUFBRTtRQUNyRCxNQUFNLFVBQVUsR0FBRyxJQUFJLG1CQUFTLENBQUMscUJBQXFCLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDNUQsTUFBTSxpQkFBaUIsR0FBRyxVQUFVLENBQUMsb0JBQW9CLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDdEUsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLHdCQUFjLEVBQUUsQ0FBQztRQUVsRCxNQUFNLFVBQVUsR0FBRyxvQkFBb0IsQ0FBQyxrQkFBa0IsQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUVsRyxTQUFTLENBQUMsSUFBSSxDQUFDO1lBQ1gsT0FBTyxFQUFFLHNCQUFZLENBQUMsUUFBUSxDQUFDLDhCQUFvQixF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