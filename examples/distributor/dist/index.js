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
const AMOUNT = 1000;
// Number of addresses to which the distribution should be made
const DISTRIBUTION_SPACE = 15;
const MAX_ADDRESS_LOOKUP_SPACE = DISTRIBUTION_SPACE * 5;
// Seed to spend funds from
const SEED = 'ENTER SEED HERE!';
const DELAY_TIME = 120000;
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
/**
 * Promotes and reattaches a message
 *
 * @method promoteAndReattach
 *
 * @param {string} messageId
 */
function promoteAndReattach(messageId) {
    const _checkMeta = (id) => {
        return client.messageMetadata(id)
            .then((metadata) => {
            if (metadata.ledgerInclusionState) {
                return Promise.resolve(metadata);
            }
            if (metadata.shouldPromote) {
                return _promote(id);
            }
            if (metadata.shouldReattach) {
                return _reattach(id);
            }
            return new Promise((resolve) => {
                setTimeout(resolve, 1000);
            }).then(() => {
                return _checkMeta(id);
            });
        });
    };
    const _promote = (id) => {
        return iota_js_1.promote(client, id).then(() => {
            console.info(`Successfully promoted message with id ${id}`);
            return _checkMeta(id);
        });
    };
    const _reattach = (id) => {
        return iota_js_1.reattach(client, id).then((message) => {
            console.info(`Successfully reattached message id ${id}`);
            console.info(`Reattached id ${message.messageId}`);
            return _checkMeta(message.messageId);
        });
    };
    return _checkMeta(messageId).catch((error) => {
        return _checkMeta(messageId);
    });
}
function run() {
    const _distribute = () => {
        return new Promise((resolve) => {
            setTimeout(resolve, DELAY_TIME);
        }).then(() => distribute())
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
            return promoteAndReattach(result.messageId).then((metadata) => {
                console.log(`Included in ledger state: ${metadata.ledgerInclusionState}`);
                return new Promise((_, reject) => {
                    setTimeout(() => reject(new Error(`Paused!`)), DELAY_TIME);
                });
            });
        }).catch((error) => {
            console.info('-'.repeat(75));
            console.error(error.message);
            console.info('-'.repeat(75));
            return _distribute();
        });
    };
    return _distribute();
}
new Promise((resolve) => {
    setTimeout(resolve, 1000);
}).then(run);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7QUFBQSwyQ0FhdUI7QUFFdkIsTUFBTSxZQUFZLEdBQUcsd0JBQXdCLENBQUM7QUFFOUMsaUZBQWlGO0FBQ2pGLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQztBQUVwQiwrREFBK0Q7QUFDL0QsTUFBTSxrQkFBa0IsR0FBRyxFQUFFLENBQUM7QUFFOUIsTUFBTSx3QkFBd0IsR0FBRyxrQkFBa0IsR0FBRyxDQUFDLENBQUM7QUFFeEQsMkJBQTJCO0FBQzNCLE1BQU0sSUFBSSxHQUFHLGtCQUFrQixDQUFDO0FBRWhDLE1BQU0sVUFBVSxHQUFHLE1BQU0sQ0FBQztBQTRCMUI7Ozs7Ozs7O0dBUUc7QUFDSCxTQUFTLHdCQUF3QixDQUFDLEtBQWE7SUFDM0MsTUFBTSxVQUFVLEdBQUcsSUFBSSxxQkFBVyxDQUFDLG1CQUFTLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFFL0QsTUFBTSxTQUFTLEdBQUcsRUFBRSxDQUFBO0lBRXBCLEtBQUssSUFBSSxDQUFDLEdBQUcsS0FBSyxFQUFFLENBQUMsR0FBRyxrQkFBa0IsR0FBRyxLQUFLLEVBQUUsQ0FBQyxFQUFFLEVBQUU7UUFDckQsTUFBTSxVQUFVLEdBQUcsSUFBSSxtQkFBUyxDQUFDLHFCQUFxQixDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzVELE1BQU0saUJBQWlCLEdBQUcsVUFBVSxDQUFDLG9CQUFvQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3RFLE1BQU0sb0JBQW9CLEdBQUcsSUFBSSx3QkFBYyxFQUFFLENBQUM7UUFFbEQsTUFBTSxVQUFVLEdBQUcsb0JBQW9CLENBQUMsa0JBQWtCLENBQUMsaUJBQWlCLENBQUMsT0FBTyxFQUFFLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFbEcsU0FBUyxDQUFDLElBQUksQ0FBQztZQUNYLE9BQU8sRUFB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