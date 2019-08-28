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
    GraphQL,
    logger,
    Secrets,
    Success,
} from "@atomist/automation-client";
import { isTokenCredentials } from "@atomist/automation-client/lib/operations/common/ProjectOperationCredentials";
import {
    DeclarationType,
    EventHandlerRegistration,
    resolveCredentialsPromise,
    SoftwareDeliveryMachine,
} from "@atomist/sdm";
import * as github from "@octokit/rest";
import * as _ from "lodash";
import {
    OnPullRequestClosed,
    OnPullRequestOpened,
} from "../typings/types";
import { KnownLabels } from "../util/labels";
import { gitHub } from "./github";

export function onPullRequestOpened(sdm: SoftwareDeliveryMachine): EventHandlerRegistration<OnPullRequestOpened.Subscription> {
    return {
        name: "ConvergePullRequestLabelsOnPullRequest",
        description: "Add labels to pull requests",
        subscription: GraphQL.subscription("OnPullRequestOpened"),
        parameters: {
            orgToken: { uri: Secrets.OrgToken, declarationType: DeclarationType.Secret },
        },
        listener: async (e, ctx) => {
            const pr = e.data.PullRequest[0];

            if (!!pr && !!pr.body) {
                const tagRegex = /\[([-\w]+:[-\w:=\/\.]+)\]/g;
                let tagMatches = tagRegex.exec(pr.body);
                const tags = [];
                while (!!tagMatches) {
                    tags.push(tagMatches[0]);
                    tagMatches = tagRegex.exec(pr.body);
                }

                const knownTags = tags.filter(t => !!KnownLabels[t]);
                if (knownTags.length > 0) {
                    const credentials = await resolveCredentialsPromise(sdm.configuration.sdm.credentialsResolver.eventHandlerCredentials(ctx));
                    if (!!credentials && isTokenCredentials(credentials)) {
                        const api = gitHub(credentials.token, pr.repo.org.provider.apiUrl);
                        for (const knownTag of knownTags) {
                            await addLabel(knownTag, KnownLabels[knownTag], pr.repo.owner, pr.repo.name, api);
                        }
                        await api.issues.update({
                            owner: pr.repo.owner,
                            repo: pr.repo.name,
                            issue_number: pr.number,
                            labels: _.uniq([...pr.labels.map(l => l.name), ...knownTags]),
                        });
                    }
                }
            }

            return Success;
        },
    };
}

async function addLabel(name: string,
                        color: string,
                        owner: string,
                        repo: string,
                        api: github): Promise<void> {
    try {
        await api.issues.getLabel({
            name,
            repo,
            owner,
        });
    } catch (err) {
        await api.issues.createLabel({
            owner,
            repo,
            name,
            color,
        });
    }
}

export function onPullRequestClosed(sdm: SoftwareDeliveryMachine): EventHandlerRegistration<OnPullRequestClosed.Subscription> {
    return {
        name: "ConvergePullRequestBranchOnPullRequest",
        description: "Delete pull request branch",
        subscription: GraphQL.subscription("OnPullRequestClosed"),
        parameters: {
            orgToken: { uri: Secrets.OrgToken, declarationType: DeclarationType.Secret },
        },
        listener: async (e, ctx) => {
            const pr = e.data.PullRequest[0];

            const credentials = await resolveCredentialsPromise(sdm.configuration.sdm.credentialsResolver.eventHandlerCredentials(ctx));
            if (!!credentials && isTokenCredentials(credentials)) {
                const api = gitHub(credentials.token, pr.repo.org.provider.apiUrl);
                try {
                    await api.git.deleteRef({
                        owner: pr.repo.owner,
                        repo: pr.repo.name,
                        ref: `heads/${pr.branchName}`,
                    });
                } catch (e) {
                    logger.warn(`Failed to delete branch: ${e.message}`);
                }
            }

            return Success;
        },
    };
}
