import {
    Bech32Helper,
    Bip32Path,
    Converter,
    Ed25519Address,
    Ed25519Seed,
    ED25519_ADDRESS_TYPE,
    IKeyPair,
    IUTXOInput,
    sendAdvanced,
    SingleNodeClient
} from "@iota/iota.js";

const API_ENDPOINT = "http://localhost:14265";

// Amount to distribute (Should be equal to amount faucet sends to every address)
const AMOUNT = 1000;

// Number of addresses to which the distribution should be made
const DISTRIBUTION_SPACE = 15;

const MAX_ADDRESS_LOOKUP_SPACE = DISTRIBUTION_SPACE * 5;

// Seed to spend funds from
const SEED = 'ENTER SEED HERE!';

type AddressWithKeyPairs = {
    address: string;
    keyIndex: number;
    keyPair: IKeyPair;
    balance: number;
}

type Output = {
    address: string;
    addressType: number,
    amount: number;
}

type InputOutputs = {
    inputAddresses: string[],
    outputAddresses: string[],
    input: AddressWithKeyPairs,
    outputs: Output[]
}

type DistributionResult = {
    messageId: string;
    inputAddresses: string[];
    outputAddresses: string[];
}

/**
 * Generates addresses
 * 
 * @method getAddressesWithKeyPairs
 * 
 * @param {number} start
 * 
 * @returns {AddressWithKeyPairs[]} 
 */
function getAddressesWithKeyPairs(start: number): AddressWithKeyPairs[] {
    const walletSeed = new Ed25519Seed(Converter.hexToBytes(SEED));

    const addresses = []

    for (let i = start; i < DISTRIBUTION_SPACE + start; i++) {
        const walletPath = new Bip32Path(`m/44'/4218'/0'/0'/${i}'`);
        const walletAddressSeed = walletSeed.generateSeedFromPath(walletPath);
        const walletEd25519Address = new Ed25519Address();

        const newAddress = walletEd25519Address.publicKeyToAddress(walletAddressSeed.keyPair().publicKey);

        addresses.push({
            address: Bech32Helper.toBech32(ED25519_ADDRESS_TYPE, newAddress),
            keyIndex: i,
            keyPair: walletAddressSeed.keyPair(),
            balance: 0
        });
    }

    return addresses;
}

async function assignBalances(addresses: AddressWithKeyPairs[]): Promise<AddressWithKeyPairs[]> {
    const addressesWithBalance: AddressWithKeyPairs[] = []

    for (const addressObject of addresses) {
        const info = await client.address(addressObject.address);

        addressesWithBalance.push(Object.assign({}, addressObject, {
            balance: info.balance
        }))
    }

    return addressesWithBalance;
}

/**
 * @method prepareInputAndOutputs
 * 
 * @param {number} start 
 * @param {AddressWithKeyPairs[]} addresses 
 * 
 * @return {InputOutputs}
 */
async function prepareInputAndOutputs(start = 0, addresses: AddressWithKeyPairs[] = []): Promise<InputOutputs> {
    if (start > MAX_ADDRESS_LOOKUP_SPACE) {
        throw new Error('Max attempts reached!')
    }

    addresses = [...addresses, ...getAddressesWithKeyPairs(start)];
    addresses = await assignBalances(addresses)

    if (
        addresses.every((addressObject: AddressWithKeyPairs) => addressObject.balance === 0)
    ) {
        return prepareInputAndOutputs(start + DISTRIBUTION_SPACE, addresses)
    }

    // Input should be the address with highest balance
    const input = addresses.reduce((acc, info) => acc.balance > info.balance ? acc : info);

    if (input.balance < DISTRIBUTION_SPACE * AMOUNT) {
        return prepareInputAndOutputs(start + DISTRIBUTION_SPACE, addresses)
    }

    const outputs = addresses.filter(
        (addressObject) => addressObject.balance === 0 &&
            addressObject.address !== input.address
    ).slice(0, DISTRIBUTION_SPACE)

    if (outputs.length < DISTRIBUTION_SPACE) {
        return prepareInputAndOutputs(start + DISTRIBUTION_SPACE, addresses)
    }

    return {
        inputAddresses: [input.address],
        outputAddresses: outputs.map((output) => output.address),
        input,
        outputs: [
            ...outputs
                .map((addressObject) => ({
                    // @ts-ignore
                    address: Converter.bytesToHex(Bech32Helper.fromBech32(addressObject.address).addressBytes),
                    addressType: ED25519_ADDRESS_TYPE,
                    amount: AMOUNT
                })),
            {
                // @ts-ignore
                // Send remainder to input address
                address: Converter.bytesToHex(Bech32Helper.fromBech32(input.address).addressBytes),
                addressType: ED25519_ADDRESS_TYPE,
                amount: input.balance - (AMOUNT * outputs.length)
            }
        ]
    }
}

const client = new SingleNodeClient(API_ENDPOINT);

/**
 * Distribute funds
 * 
 * @method distribute
 * 
 * @returns {Promise<DistributionResult>}
 */
async function distribute(): Promise<DistributionResult> {
    const { inputAddresses, outputAddresses, input, outputs } = await prepareInputAndOutputs();

    const inputAddressOutputs = await client.addressOutputs(input.address)

    const unspentOutputs = [];

    for (const outputId of inputAddressOutputs.outputIds) {
        const output = await client.output(outputId);

        if (!output.isSpent) {
            unspentOutputs.push(output)
        }
    }

    if (!unspentOutputs.length) {
        throw new Error('No unspent outputs against input address.')
    }

    const inputs: {
        input: IUTXOInput;
        addressKeyPair: IKeyPair;
    }[] = unspentOutputs.map((output) => {
        return {
            input: {
                type: 0,
                transactionId: output.transactionId,
                transactionOutputIndex: output.outputIndex
            },
            addressKeyPair: input.keyPair
        }
    })

    const { messageId } = await sendAdvanced(client, inputs, outputs, "WALLET");

    return {
        messageId,
        inputAddresses,
        outputAddresses
    }
}

function run() {
    const _distribute = (): Promise<any> => {
        return distribute()
            .then((result: DistributionResult) => {
                console.info('-'.repeat(75));
                console.info('Funds distributed successfully!');

                console.info('Message ID: ', result.messageId);
                console.info('Sender address: ', result.inputAddresses[0])
                console.info('Receiver addresses:')

                result.outputAddresses.forEach((address, idx) => {
                    console.info(`${idx + 1}: ${address}`)
                })

                console.info('-'.repeat(75));

                return new Promise((_, reject) => {
                    setTimeout(() => reject(new Error(`Paused!`)), 10000)
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
    setTimeout(resolve, 1000)
}).then(run);
