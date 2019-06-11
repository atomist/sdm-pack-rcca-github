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

import {
    GraphQL,
    logger,
    Success,
} from "@atomist/automation-client";
import {
    EventHandlerRegistration,
    SoftwareDeliveryMachine,
} from "@atomist/sdm";
import * as _ from "lodash";
import {
    ChannelLinkCreated,
    ConfigureGitHubScmResourceProvider,
} from "../typings/types";

export function onChannelLinked(sdm: SoftwareDeliveryMachine): EventHandlerRegistration<ChannelLinkCreated.Subscription> {
    return {
        name: "ConvergeOnChannelLinked",
        description: "Converge a repo when it is getting linked",
        subscription: GraphQL.subscription("channelLinkCreated"),
        listener: async (e, ctx) => {
            const repo = e.data.ChannelLink[0].repo;
            const provider = _.get(e.data, "ChannelLink[0].repo.org.scmProvider");

            if (!!provider) {
                const repoSpecs: ChannelLinkCreated.RepoSpecs[] = _.get(provider, "targetConfiguration.repoSpecs") || [];
                if (!repoSpecs.some(r => r.ownerSpec === repo.owner && r.nameSpec === repo.name)) {
                    repoSpecs.push({ nameSpec: repo.name, ownerSpec: repo.owner });

                    await ctx.graphClient.mutate<ConfigureGitHubScmResourceProvider.Mutation, ConfigureGitHubScmResourceProvider.Variables>({
                        name: "configureGitHubScmResourceProvider",
                        variables: {
                            id: provider.id,
                            orgs: provider.targetConfiguration.orgSpecs || [],
                            repos: repoSpecs.map(r => ({
                                owner: r.ownerSpec,
                                repo: r.nameSpec,
                            })),
                        },
                    });
                }
            } else {
                logger.warn(`No provider found on newly linked repo`);
            }

            return Success;
        },
    };
}
