import {
    GraphQL,
    Success,
} from "@atomist/automation-client";
import { EventHandlerRegistration } from "@atomist/sdm";
import * as _ from "lodash";
import {
    ConfigureGitHubScmProvider,
    OnSdmRepoProvenance,
    ScmProvider,
} from "../typings/types";
import { loadProvider } from "./api";
import TargetConfiguration = ScmProvider.TargetConfiguration;

export const ConvergeRepoOnRepoProvenance: EventHandlerRegistration<OnSdmRepoProvenance.Subscription> = {
    name: "ConvergeRepoOnRepoProvenance",
    description: "Add repo level webhook for newly generated repositories",
    subscription: GraphQL.subscription("OnSdmRepoProvenance"),
    listener: async (e, ctx) => {
        const push = e.data.SdmRepoProvenance[0];

        const owner = push.repo.owner;
        const repo = push.repo.name;
        const providerId = push.repo.providerId;

        const provider = await loadProvider(ctx.graphClient, `${ctx.workspaceId}_${providerId}`);

        const targetConfiguration = _.get(provider, "targetConfiguration", { orgSpecs: [], repoSpecs: [] }) as TargetConfiguration;

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
