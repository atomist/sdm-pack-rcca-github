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

import { subscription } from "@atomist/automation-client/lib/graph/graphQL";
import { Success } from "@atomist/automation-client/lib/HandlerResult";
import { QueryNoCacheOptions } from "@atomist/automation-client/lib/spi/graph/GraphClient";
import { logger } from "@atomist/automation-client/lib/util/logger";
import { createJob } from "@atomist/sdm/lib/api-helper/misc/job/createJob";
import { EventHandlerRegistration } from "@atomist/sdm/lib/api/registration/EventHandlerRegistration";
import {
    AtmJobState,
    JobByName,
    OnGitHubAppInstallation,
} from "../typings/types";
import {
    IngestOrg,
    IngestOrgParameters,
} from "./IngestOrg";

export function onGitHubAppInstallation(): EventHandlerRegistration<OnGitHubAppInstallation.Subscription> {
    return {
        name: "ConvergeOnGitHubAppInstallation",
        description: "Converge a GitHub app installing when it is getting linked",
        subscription: subscription("OnGitHubAppInstallation"),
        listener: async (e, ctx) => {
            const app = e.data.GitHubAppInstallation[0];
            const provider = app.gitHubAppResourceProvider;

            const name = `RepositoryDiscovery/${provider.providerId}/${app.owner}`;
            const jobs = await ctx.graphClient.query<JobByName.Query, JobByName.Variables>({
                name: "JobByName",
                variables: {
                    name,
                },
                options: QueryNoCacheOptions,
            });

            if (!(jobs.AtmJob || []).some(j => j.state === AtmJobState.running)) {
                await createJob<IngestOrgParameters>({
                        name,
                        description: "Discovering repositories",
                        command: IngestOrg,
                        parameters: {
                            id: provider.id,
                            providerId: provider.providerId,
                            apiUrl: provider.apiUrl,
                            org: app.owner,
                            orgId: app.id,
                        },
                    },
                    ctx);
            } else {
                logger.info("Not creating repository discovery job as one is already running");
            }

            return Success;
        },
    };
}
