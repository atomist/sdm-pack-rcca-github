import { MappedParameters } from "@atomist/automation-client";
import {
    CommandHandlerRegistration,
    DeclarationType,
    slackSuccessMessage,
    SoftwareDeliveryMachine,
} from "@atomist/sdm";
import {
    bold,
    codeLine,
} from "@atomist/slack-messages";

/**
 * Command to configure default labels for Pull Requests.
 */
export function configureDefaultPullRequestLabels(sdm: SoftwareDeliveryMachine):
    CommandHandlerRegistration<{ owner: string, repo: string, labels: string }> {
    return {
        name: "ConfigureDefaultPullRequestLabels",
        description: "Configure default labels for PRs",
        intent: ["configure default pr labels"],
        autoSubmit: true,
        tags: ["github", "tags"],
        parameters: {
            owner: { uri: MappedParameters.GitHubOwner, declarationType: DeclarationType.Mapped },
            repo: { uri: MappedParameters.GitHubRepository, declarationType: DeclarationType.Mapped },
            labels: { description: "Comma-separated list of labels", required: true },
        },
        listener: async ci => {
            const labels = ci.parameters.labels.split(",").map(l => l.trim());
            const slug = `${ci.parameters.owner}/${ci.parameters.repo}`;
            await ci.preferences.put(defaultPullRequestLabelsPreferenceKey(ci.parameters.owner, ci.parameters.repo), labels);
            await ci.context.messageClient.respond(
                slackSuccessMessage(
                    "Configure Default Labels",
                    `Successfully configured pull request default labels to ${labels.map(codeLine).join(", ")} for ${bold(slug)}`));
        },
    };
}

export function defaultPullRequestLabelsPreferenceKey(owner: string, repo: string): string {
    const slug = `${owner}/${repo}`;
    return `@atomist/sdm-pack-rcca-github.pr.${slug}`;
}
