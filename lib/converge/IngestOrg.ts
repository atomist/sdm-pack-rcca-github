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
    logger,
    QueryNoCacheOptions,
    Success,
} from "@atomist/automation-client";
import { CommandHandlerRegistration } from "@atomist/sdm";
import {
    GitHubAppInstallationById,
    IngestScmRepos,
    OwnerType,
    ReposByOrg,
    ScmRepoInput,
    ScmReposInput,
} from "../typings/types";
import { gitHub } from "./github";

// tslint:disable-next-line:interface-over-type-literal
export type IngestOrgParameters = { id: string, providerId: string, apiUrl: string, org: string, orgId: string, type: OwnerType };

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
        type: { description: "Type of the org" },
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

        let options;
        if (ci.parameters.type === OwnerType.organization) {
            options = gh.repos.listForOrg.endpoint.merge({ org: ci.parameters.org, per_page: 100 });
        } else {
            options = gh.repos.listForUser.endpoint.merge({ username: ci.parameters.org, per_page: 100 });
        }

        let repos = 0;
        for await (const response of gh.paginate.iterator(options)) {
            const newRepos = response.data.filter((r: any) => !r.archived).filter((r: any) => !existingRepos.some(er => er.name === r.name));

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

        logger.info(`Ingesting repos for org '${ci.parameters.org}' completed`);

        return Success;

    },
};
