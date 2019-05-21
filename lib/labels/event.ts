import { TokenCredentials } from "@atomist/automation-client";
import {
    PullRequestAction,
    PullRequestListener,
} from "@atomist/sdm";
import { gitHub } from "../converge/github";
import { defaultPullRequestLabelsPreferenceKey } from "./configure";

/**
 * PullRequestListener to assign default labels for newly created or openend PRs.
 */
export function configureLabelsOnPullRequest(defaultLabels: string[] = []): PullRequestListener {
    return async pli => {
        if (pli.pullRequest.action === PullRequestAction.created || pli.pullRequest.action === PullRequestAction.opened) {
            const labels = await pli.preferences.get<string[]>(
                defaultPullRequestLabelsPreferenceKey(pli.pullRequest.repo.owner, pli.pullRequest.repo.name),
                { defaultValue: defaultLabels });
            if (!!labels && labels.length > 0) {
                const api = gitHub((pli.credentials as TokenCredentials).token, pli.pullRequest.repo.org.provider.apiUrl);
                await api.issues.addLabels({
                    owner: pli.pullRequest.repo.owner,
                    repo: pli.pullRequest.repo.name,
                    number: pli.pullRequest.number,
                    labels,
                });
            }
        }
    };
}
