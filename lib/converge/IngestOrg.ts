import {
    logger,
    Secrets,
} from "@atomist/automation-client";
import {
    CommandHandlerRegistration,
    DeclarationType,
} from "@atomist/sdm";
import {
    IngestScmOrgs,
    IngestScmRepos,
    OwnerType,
    ReposByOrg,
    ScmRepoInput,
    ScmReposInput,
} from "../typings/types";
import { gitHub } from "./github";

// tslint:disable-next-line:interface-over-type-literal
export type IngestOrgParameters = { id: string, providerId: string, apiUrl: string, readOrg: boolean, token: string };

export const IngestOrg: CommandHandlerRegistration<IngestOrgParameters> = {
    name: "IngestOrg",
    description: "Ingests organizations and repository into the Graph",
    tags: ["github"],
    parameters: {
        id: { description: "Internal id of the provider" },
        providerId: { description: "Id of the provider" },
        apiUrl: { description: "URL of the api endpoint" },
        readOrg: { description: "True if the token has read:org scope", type: "boolean" },
        token: { uri: Secrets.userToken(["repo"]), declarationType: DeclarationType.Secret },
    },
    listener: async ci => {
        const gh = gitHub(ci.parameters.token, ci.parameters.apiUrl);
        let orgIds: IngestScmOrgs.IngestScmOrgs[] = [];

        if (!!ci.parameters.readOrg) {
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

        for (const orgId of orgIds) {
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
                options = gh.repos.listForOrg.endpoint.merge({ org: orgId.owner });
            } else {
                options = gh.repos.listForUser.endpoint.merge({ username: orgId.owner });
            }
            for await (const response of gh.paginate.iterator(options)) {
                const newRepos = response.data.filter((r: any) => !existingRepos.some(er => er.name === r.name));

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
        }

        logger.info(`Ingesting orgs and repos finished`);
    },
};
