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
    Success,
} from "@atomist/automation-client";
import {
    EventHandlerRegistration,
    SoftwareDeliveryMachine,
} from "@atomist/sdm";
import * as _ from "lodash";
import {
    ConfigureGitHubScmProvider,
    OnSdmRepoProvenance,
    ScmProvider,
} from "../typings/types";
import { loadProvider } from "./api";
import TargetConfiguration = ScmProvider.TargetConfiguration;

export function onRepoProvenance(sdm: SoftwareDeliveryMachine): EventHandlerRegistration<OnSdmRepoProvenance.Subscription> {
    return {
        name: "onRepoProvenance",
        description: "Add repo level webhook for newly generated repositories",
        subscription: GraphQL.subscription("OnSdmRepoProvenance"),
        listener: async (e, ctx) => {
            const push = e.data.SdmRepoProvenance[0];

            const owner = push.repo.owner;
            const repo = push.repo.name;
            const providerId = push.repo.providerId;

            const provider = await loadProvider(ctx.graphClient, `${ctx.workspaceId}_${providerId}`);

            const targetConfiguration: TargetConfiguration = _.get(provider, "targetConfiguration") || { orgSpecs: [], repoSpecs: [] };

            const hasOrg = targetConfiguration.orgSpecs.some(o => o === owner);
            const hasRepo = targetConfiguration.repoSpecs.some(r => r.ownerSpec === owner && r.nameSpec === repo);
            if (!hasOrg && !hasRepo) {
                targetConfiguration.repoSpecs.push({ ownerSpec: owner, nameSpec: repo });
                await ctx.graphClient.mutate<ConfigureGitHubScmProvider.Mutation, ConfigureGitHubScmProvider.Variables>({
                    name: "ConfigureGitHubScmProvider",
                    variables: {
                        id: providerId,
                        orgs: targetConfiguration.orgSpecs,
                        repos: targetConfiguration.repoSpecs.map(r => ({ owner: r.ownerSpec, repo: r.nameSpec })),
                    },
                });
            }

            return Success;
        },
    };
}
