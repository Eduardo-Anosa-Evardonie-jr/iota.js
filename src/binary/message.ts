// Copyright 2020 IOTA Stiftung
// SPDX-License-Identifier: Apache-2.0
import { IMessage } from "../models/IMessage";
import { ReadStream } from "../utils/readStream";
import { WriteStream } from "../utils/writeStream";
import { MESSAGE_ID_LENGTH, UINT64_SIZE } from "./common";
import { deserializePayload, MIN_PAYLOAD_LENGTH, serializePayload } from "./payload";

const MIN_MESSAGE_LENGTH: number = UINT64_SIZE +
    (2 * MESSAGE_ID_LENGTH) +
    MIN_PAYLOAD_LENGTH +
    UINT64_SIZE;

const EMPTY_MESSAGE_ID_HEX: string = "0".repeat(MESSAGE_ID_LENGTH * 2);

/**
 * Deserialize the message from binary.
 * @param readStream The message to deserialize.
 * @returns The deserialized message.
 */
export function deserializeMessage(readStream: ReadStream): IMessage {
    if (!readStream.hasRemaining(MIN_MESSAGE_LENGTH)) {
        throw new Error(`Message data is ${readStream.length()
            } in length which is less than the minimimum size required of ${MIN_MESSAGE_LENGTH}`);
    }

    const networkId = readStream.readUInt64("message.networkId");

    const parent1MessageId = readStream.readFixedHex("message.parent1MessageId", MESSAGE_ID_LENGTH);
    const parent2MessageId = readStream.readFixedHex("message.parent2MessageId", MESSAGE_ID_LENGTH);

    const payload = deserializePayload(readStream);

    const nonce = readStream.readUInt64("message.nonce");

    const unused = readStream.unused();
    if (unused !== 0) {
        throw new Error(`Message data length ${readStream.length()} has unused data ${unused}`);
    }

    return {
        networkId: networkId.toString(10),
        payload,
        parent1MessageId,
        parent2MessageId,
        nonce: nonce.toString(10)
    };
}

/**
 * Serialize the message essence to binary.
 * @param writeStream The stream to write the data to.
 * @param object The object to serialize.
 */
export function serializeMessage(writeStream: WriteStream, object: IMessage): void {
    writeStream.writeUInt64("message.networkId", BigInt(object.networkId ?? 0));

    writeStream.writeFixedHex("message.parent1MessageId",
        MESSAGE_ID_LENGTH, object.parent1MessageId ?? EMPTY_MESSAGE_ID_HEX);
    writeStream.writeFixedHex("message.parent2MessageId",
        MESSAGE_ID_LENGTH, object.parent2MessageId ?? EMPTY_MESSAGE_ID_HEX);

    serializePayload(writeStream, object.payload);

    writeStream.writeUInt64("message.nonce", BigInt(object.nonce ?? 0));
}