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

import { Success } from "@atomist/automation-client/lib/HandlerResult";
import { QueryNoCacheOptions } from "@atomist/automation-client/lib/spi/graph/GraphClient";
import { logger } from "@atomist/automation-client/lib/util/logger";
import { CommandHandlerRegistration } from "@atomist/sdm/lib/api/registration/CommandHandlerRegistration";
import { AppsListReposResponseRepositoriesItem } from "@octokit/rest";
import * as _ from "lodash";
import {
    GitHubAppInstallationById,
    IngestScmRepos,
    OrgInitializationState,
    ReposByOrg,
    ScmRepoInput,
    ScmReposInput,
    SetOrgInitializationStateMutation,
    SetOrgInitializationStateMutationVariables,
} from "../typings/types";
import { gitHub } from "./github";

// tslint:disable-next-line:interface-over-type-literal
export type IngestOrgParameters = { id: string, providerId: string, apiUrl: string, org: string, orgId: string };

export const IngestOrg: CommandHandlerRegistration<IngestOrgParameters> = {
    name: "IngestOrg",
    description: "Ingest repositories of a single organization into the Graph",
    tags: ["github"],
    parameters: {
        id: { description: "Internal id of the provider" },
        providerId: { description: "Id of the provider" },
        apiUrl: { description: "URL of the api endpoint" },
        org: { description: "Name of the org" },
        orgId: { description: "Internal id of the org" },
    },
    listener: async ci => {

        const app = await ci.context.graphClient.query<GitHubAppInstallationById.Query, GitHubAppInstallationById.Variables>({
            name: "GitHubAppInstallationById",
            variables: {
                id: ci.parameters.orgId,
            },
            options: QueryNoCacheOptions,
        });

        const token = _.get(app, "GitHubAppInstallation[0].token.secret");
        if (!token) {
            return Success;
        }

        const gh = gitHub(token, ci.parameters.apiUrl);

        logger.info(`Ingesting repos for org '${ci.parameters.org}'`);

        const existingRepos = (await ci.context.graphClient.query<ReposByOrg.Query, ReposByOrg.Variables>({
            name: "reposByOrg",
            variables: {
                owner: ci.parameters.org,
                providerId: ci.parameters.providerId,
            },
        })).Repo;

        const options = gh.apps.listRepos.endpoint.merge({ per_page: 100 });

        let repos = 0;
        for await (const response of gh.paginate.iterator(options)) {
            const newRepos = (response.data as AppsListReposResponseRepositoriesItem[])
                .filter(r => !r.archived)
                .filter(r => r.owner.login === ci.parameters.org)
                .filter(r => !existingRepos.some(er => er.name === r.name));

            const scmIngest: ScmReposInput = {
                orgId: ci.parameters.orgId,
                owner: ci.parameters.org,
                repos: [],
            };

            for await (const newRepo of newRepos) {
                logger.debug(`Preparing repo ${newRepo.full_name}`);

                const ingest: ScmRepoInput = {
                    name: newRepo.name,
                    repoId: newRepo.id.toString(),
                    url: newRepo.html_url,
                    defaultBranch: newRepo.default_branch,
                };

                scmIngest.repos.push(ingest);
                repos++;
            }

            if (scmIngest.repos.length > 0) {
                await ci.context.graphClient.mutate<IngestScmRepos.Mutation, IngestScmRepos.Variables>({
                    name: "ingestScmRepos",
                    variables: {
                        providerId: ci.parameters.id,
                        repos: scmIngest,
                    },
                });
            }
        }

        await ci.context.graphClient.mutate<SetOrgInitializationStateMutation, SetOrgInitializationStateMutationVariables>({
            name: "setOrgInitializationState",
            variables: {
                initializationState: OrgInitializationState.initialized,
                orgId: ci.parameters.orgId,
                providerId: ci.parameters.id,
            },
        });

        logger.info(`Ingesting repos for org '${ci.parameters.org}' completed`);

        return Success;

    },
};
