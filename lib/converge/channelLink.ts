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
            const provider = _.get(e.data, "ChannelLink[0].repo.org.scmProvider") as ChannelLinkCreated.ScmProvider;

            if (!!provider) {
                const repoSpecs = provider.targetConfiguration.repoSpecs || [];
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
