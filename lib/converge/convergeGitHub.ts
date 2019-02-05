/*
 * Copyright © 2019 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { GraphQL } from "@atomist/automation-client";
import {
    EventHandlerRegistration,
    ExtensionPack,
    metadata,
} from "@atomist/sdm";
import * as _ from "lodash";
import {
    OnScmProvider,
    ProviderType,
} from "../typings/types";
import {
    convergeProvider,
    convergeWorkspace,
} from "./converge";

/**
 * Configuration options for the GitHub RCCA
 */
export interface ConvergenceOptions {
    /**
     * Interval in ms of convergence runs
     * If not value is provided here, configuration is checked at 'sdm.converge.github.interval'
     */
    interval?: number;

    /**
     * Provider type to converge for
     * If not value is provided here, configuration is checked at 'sdm.converge.github.providerType'
     */
    providerType?: ProviderType.github_com | ProviderType.ghe;
}

/**
 * GitHub RCCA Extension Pack to manage webhook resources on GitHub.com or on-prem GHE
 * @param options
 */
export function convergeGitHub(options: ConvergenceOptions = {}): ExtensionPack {
    return {
        ...metadata("converge"),
        configure: sdm => {

            const optsToUse: ConvergenceOptions = {
                interval: _.get(sdm, "configuration.sdm.converge.github.interval", 1000 * 60 * 10),
                providerType: _.get(sdm, "configuration.sdm.converge.github.providerType", ProviderType.github_com),
                ...options,
            };

            const converge = async (l: any) => {
                for (const workspaceId of sdm.configuration.workspaceIds) {
                    await convergeWorkspace(workspaceId, sdm, optsToUse);
                }
            };

            if (!!sdm.configuration.workspaceIds && sdm.configuration.workspaceIds.length > 0) {
                sdm.addTriggeredListener({
                    listener: converge,
                    trigger: {
                        interval: optsToUse.interval,
                    },
                });
                sdm.addStartupListener(converge);
            }

            sdm.addEvent(onScmProviderHandler(optsToUse));
        },
    };
}

/**
 * EventHandlerRegistration listening for new SCMProvider events and triggering the convergence function
 */
function onScmProviderHandler(options: ConvergenceOptions): EventHandlerRegistration<OnScmProvider.Subscription> {
    return {
        name: "OnScmProvider",
        subscription: GraphQL.subscription({
            name: "OnScmProvider",
            variables: {
                type: GraphQL.enumValue(options.providerType),
            },
        }),
        description: "Converge on GitHub ScmProvider events",
        listener: async (e, ctx) => {
            const providers = e.data;
            return convergeProvider(providers.SCMProvider[0], ctx.graphClient);
        },
    };
}
