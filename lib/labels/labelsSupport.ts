import {
    ExtensionPack,
    metadata,
} from "@atomist/sdm";
import { configureDefaultPullRequestLabels } from "./configure";
import { configureLabelsOnPullRequest } from "./event";

export interface LabelOptions {
    labels?: string[];
}

/**
 * Automatically assign a set of default labels to a newly created PR.
 */
export function githubLabelSupport(options: LabelOptions = {}): ExtensionPack {
    return {
        ...metadata("labels"),
        configure: sdm => {
            sdm.addCommand(configureDefaultPullRequestLabels(sdm));
            sdm.addPullRequestListener(configureLabelsOnPullRequest(options.labels));
        },
    };
}
