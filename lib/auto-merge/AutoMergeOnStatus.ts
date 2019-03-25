/*
 * Copyright © 2018 Atomist, Inc.
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
    failure,
    Success,
} from "@atomist/automation-client";
import * as GraphQL from "@atomist/automation-client/lib/graph/graphQL";
import {
    EventHandlerRegistration,
    resolveCredentialsPromise,
    SoftwareDeliveryMachine,
} from "@atomist/sdm";
import * as _ from "lodash";
import { AutoMergeOnStatus } from "../typings/types";
import {
    executeAutoMerge,
    OrgTokenParameters,
} from "./autoMerge";

export function autoMergeOnStatus(sdm: SoftwareDeliveryMachine)
    : EventHandlerRegistration<AutoMergeOnStatus.Subscription, { token: string }> {
    return {
        name: "AutoMergeOnStatus",
        description: "Auto merge reviewed and approved pull requests on Status events",
        subscription: GraphQL.subscription("autoMergeOnStatus"),
        parameters: OrgTokenParameters,
        tags: ["github", "pr", "automerge"],
        listener: async (e, ctx, params) => {
            const creds = await resolveCredentialsPromise(sdm.configuration.sdm.credentialsResolver.eventHandlerCredentials(ctx));
            const prs = _.get(e, "data.Status[0].commit.pullRequests") as AutoMergeOnStatus.PullRequests[];
            if (prs) {
                return Promise.all(prs.map(pr => executeAutoMerge(pr, creds)))
                    .then(() => Success)
                    .catch(failure);
            } else {
                return Success;
            }
        },
    };
}
