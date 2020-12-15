// Copyright 2020 IOTA Stiftung
// SPDX-License-Identifier: Apache-2.0
/**
 * Response from the /info endpoint.
 */
export interface INodeInfo {
    /**
     * The name of the node software.
     */
    name: string;

    /**
     * The version of the software running on the node.
     */
    version: string;

    /**
     * Is the node healthy.
     */
    isHealthy: boolean;

    /**
     * The network id.
     */
    networkId: string;

    /**
     * The latest milestone message index;
     */
    latestMilestoneIndex: number;

    /**
     * The latest solid milestone message index;
     */
    solidMilestoneIndex: number;

    /**
     * The pruning index;
     */
    pruningIndex: number;

    /**
     * Features supported by the node.
     */
    features: string[];
}