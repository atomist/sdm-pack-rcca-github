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
    executeAll,
    logger,
} from "@atomist/automation-client";
import { CommandHandlerRegistration } from "@atomist/sdm";
import {
    IngestScmOrgs,
    IngestScmRepos,
    OwnerType,
    ReposByOrg,
    ScmRepoInput,
    ScmReposInput,
} from "../typings/types";
import { loadProvider } from "./api";
import { gitHub } from "./github";

// tslint:disable-next-line:interface-over-type-literal
export type IngestOrgParameters = { id: string, providerId: string, apiUrl: string };

export const IngestOrg: CommandHandlerRegistration<IngestOrgParameters> = {
    name: "IngestOrg",
    description: "Ingests organizations and repository into the Graph",
    tags: ["github"],
    parameters: {
        id: { description: "Internal id of the provider" },
        providerId: { description: "Id of the provider" },
        apiUrl: { description: "URL of the api endpoint" },
    },
    listener: async ci => {

        const provider = await loadProvider(ci.context.graphClient, ci.parameters.id);
        if (!provider.credential || !provider.credential || !provider.credential.secret) {
            return;
        }

        const gh = gitHub(provider.credential.secret, ci.parameters.apiUrl);
        let orgIds: IngestScmOrgs.IngestScmOrgs[] = [];

        const readOrg = provider.credential.scopes.some(scope => scope === "read:org");
        if (!!readOrg) {
            logger.info(`Ingesting orgs`);
            const newOrgs = [];

            const options = gh.orgs.listForAuthenticatedUser.endpoint.merge({});
            for await (const response of gh.paginate.iterator(options)) {
                newOrgs.push(...response.data);
            }

            const user = await gh.users.getAuthenticated();

            orgIds = (await ci.context.graphClient.mutate<IngestScmOrgs.Mutation, IngestScmOrgs.Variables>({
                name: "ingestScmOrgs",
                variables: {
                    scmProviderId: ci.parameters.id,
                    scmOrgsInput: {
                        orgs: [...newOrgs.map(org => ({
                            name: org.login,
                            url: org.url,
                            ownerType: OwnerType.organization,
                            id: org.id.toString(),
                        })), {
                            name: user.data.login,
                            url: user.data.html_url,
                            ownerType: OwnerType.user,
                            id: user.data.id.toString(),
                        }],
                    },
                },
            })).ingestSCMOrgs;
        } else {

            // If we didn't get read:org scope, only ingest the user org
            const user = await gh.users.getAuthenticated();

            orgIds = (await ci.context.graphClient.mutate<IngestScmOrgs.Mutation, IngestScmOrgs.Variables>({
                name: "ingestScmOrgs",
                variables: {
                    scmProviderId: ci.parameters.id,
                    scmOrgsInput: {
                        orgs: [{
                            name: user.data.login,
                            url: user.data.html_url,
                            ownerType: OwnerType.user,
                            id: user.data.id.toString(),
                        }],
                    },
                },
            })).ingestSCMOrgs;
        }

        await executeAll(orgIds.map(orgId =>
            async () => {
                logger.info(`Ingesting repos for org '${orgId.owner}'`);

                const existingRepos = (await ci.context.graphClient.query<ReposByOrg.Query, ReposByOrg.Variables>({
                    name: "reposByOrg",
                    variables: {
                        owner: orgId.owner,
                        providerId: ci.parameters.providerId,
                    },
                })).Repo;

                let options;
                if (orgId.ownerType === OwnerType.organization) {
                    options = gh.repos.listForOrg.endpoint.merge({ org: orgId.owner, per_page: 100 });
                } else {
                    options = gh.repos.listForUser.endpoint.merge({ username: orgId.owner, per_page: 100 });
                }
                for await (const response of gh.paginate.iterator(options)) {
                    const newRepos = response.data.filter((r: any) => !r.archived).filter((r: any) => !existingRepos.some(er => er.name === r.name));

                    const scmIngest: ScmReposInput = {
                        orgId: orgId.id,
                        owner: orgId.owner,
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

                logger.info(`Ingesting repos for org '${orgId.owner}' completed`);
            },
        ));

        logger.info(`Ingesting orgs and repos finished`);
    },
};
