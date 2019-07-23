import {
    ExtensionPack,
    metadata,
} from "@atomist/sdm";
import {
    isGitHubAction,
    isInLocalMode,
} from "@atomist/sdm-core";
import {
    createPendingChecksOnGoalSet,
    setChecksOnGoalCompletion,
} from "./checksSetters";

export function githubGoalChecksSupport(): ExtensionPack {
    return {
        ...metadata("github-goal-checks"),
        configure: sdm => {
            if (!isGitHubAction() && !isInLocalMode()) {
                sdm.addGoalsSetListener(createPendingChecksOnGoalSet(sdm));
                sdm.addGoalCompletionListener(setChecksOnGoalCompletion(sdm));
            }
        },
    };
}
