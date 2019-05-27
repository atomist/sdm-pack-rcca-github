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

import { TokenCredentials } from "@atomist/automation-client";
import {
    PreferenceScope,
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
                PreferenceScope.Workspace,
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
