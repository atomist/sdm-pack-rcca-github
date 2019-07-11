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
    OnGitHubAppScmId,
    OnScmProvider,
    ProviderType,
} from "../typings/types";
import { onChannelLinked } from "./channelLink";
import {
    convergeGitHubAppUserInstallations,
    convergeProvider,
    convergeWorkspace,
} from "./converge";
import { onGitHubAppInstallation } from "./convergeGitHubAppInstallation";
import { IngestOrg } from "./IngestOrg";
import { IngestOrgs } from "./IngestOrgs";
import { onRepoProvenance } from "./repo";

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

    /**
     * Additional events that can trigger convergence
     */
    events?: {
        /**
         * Generated repos via one of your SDM generators should get a repo webhook
         */
        repoGenerated?: boolean;
    };
}

/**
 * GitHub RCCA Extension Pack to manage webhook resources on GitHub.com or on-prem GHE
 * @param options
 */
export function githubConvergeSupport(options: ConvergenceOptions = {}): ExtensionPack {
    return {
        ...metadata("converge"),
        configure: sdm => {

            const optsToUse: ConvergenceOptions = {
                interval: _.get(sdm, "configuration.sdm.converge.github.interval", 1000 * 60 * 10),
                providerType: _.get(sdm, "configuration.sdm.converge.github.providerType", ProviderType.github_com),
                events: _.get(sdm, "configuration.sdm.converge.github.events", { repoGenerated: false }),
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

            if (_.get(optsToUse, "events.repoGenerated") === true) {
                sdm.addEvent(onRepoProvenance(sdm));
            }

            sdm.addEvent(onScmProvider(optsToUse));
            sdm.addEvent(onChannelLinked(sdm));
            sdm.addCommand(IngestOrg);
            sdm.addCommand(IngestOrgs);
            sdm.addEvent(onGitHubAppsScmId(optsToUse));
            sdm.addEvent(onGitHubAppInstallation(optsToUse));
        },
    };
}

/**
 * EventHandlerRegistration listening for new SCMProvider events and triggering the convergence function
 */
function onScmProvider(options: ConvergenceOptions): EventHandlerRegistration<OnScmProvider.Subscription> {
    return {
        name: "ConvergeGitHubOnScmProvider",
        subscription: GraphQL.subscription({
            name: "OnScmProvider",
            variables: {
                type: GraphQL.enumValue(options.providerType),
            },
        }),
        description: "Converge on GitHub ScmProvider events",
        listener: async (e, ctx) => {
            const providers = e.data;
            return convergeProvider(providers.SCMProvider[0], ctx.workspaceId, ctx.graphClient);
        },
    };
}

/**
 * EventHandlerRegistration listening for new SCMId events for github apps, and triggering user org convergence
 */
function onGitHubAppsScmId(options: ConvergenceOptions): EventHandlerRegistration<OnGitHubAppScmId.Subscription> {
    return {
        name: "ConvergeGitHubAppsOnScmId",
        subscription: GraphQL.subscription("OnGibHubAppScmId"),
        description: "Converge on GitHub Apps SCMId events",
        listener: async (e, ctx) => {
            const scmIds = e.data;
            return convergeGitHubAppUserInstallations(scmIds.SCMId[0], ctx.graphClient);
        },
    };
}
