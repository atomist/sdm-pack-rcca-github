import {
    GraphQL,
    logger,
    QueryNoCacheOptions,
    Success,
} from "@atomist/automation-client";
import {
    createJob,
    EventHandlerRegistration,
} from "@atomist/sdm";
import {
    AtmJobState,
    JobByName,
    OnGitHubAppInstallation,
} from "../typings/types";
import { ConvergenceOptions } from "./convergeGitHub";
import {
    IngestOrg,
    IngestOrgParameters,
} from "./IngestOrg";

export function onGitHubAppInstallation(options: ConvergenceOptions): EventHandlerRegistration<OnGitHubAppInstallation.Subscription> {
    return {
        name: "ConvergeOnGitHubAppInstallation",
        description: "Converge a GitHub app installing when it is getting linked",
        subscription: GraphQL.subscription("OnGitHubAppInstallation"),
        listener: async (e, ctx) => {
            const app = e.data.GitHubAppInstallation[0];
            const provider = app.gitHubAppResourceProvider;

            const name = `RepositoryDiscovery/${provider.providerId}/${provider.credential.owner.login}/${app.owner}`;
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
                            type: app.ownerType,
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
