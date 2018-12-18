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

import { toStringArray } from "@atomist/automation-client";
import {
    ExtensionPack,
    metadata,
} from "@atomist/sdm";
import { isInLocalMode } from "@atomist/sdm-core";
import { determineDefaultRepositoryOwnerParentDirectory } from "@atomist/sdm-local/lib/sdm/configuration/defaultLocalSoftwareDeliveryMachineConfiguration";
import * as _ from "lodash";
import { GitHubActivityFeedEventReader } from "./GitHubActivityFeedEventReader";
import { ScmFeedCriteria } from "./support/FeedEvent";
import { startWatching } from "./support/watcher";

/**
 * An extension pack for watching GitHub organizations.
 *
 * Configuration:
 * sdm.scm.owners configuration is required -- name of your GitHub owner
 * sdm.scm.user should be "true" if this is the name of an owner, not an org
 * sdm.scm.intervalSeconds changes the polling interval, which defaults to 10 seconds
 * sdm.scm.apiBase enables you to set your GHE server: default is GitHub.com
 */

export interface WatchOptions {
    token?: string;
    owner?: string | string[];
    user?: boolean;
    interval?: number;
    apiUrl?: string;
}

export function watchGitHub(options: WatchOptions = {}): ExtensionPack {
    return {
        ...metadata("watch"),
        requiredConfigurationValues: [
            // TODO CD make optional configuration values work
            /*{
                path: "sdm.watch.github.owner",
                type: ConfigurationValueType.String,
            },*/
        ],
        configure: sdm => {
            if (!isInLocalMode()) {
                return;
            }

            const optsToUse: WatchOptions = {
                token: _.get(sdm, "configuration.sdm.watch.github.token") || _.get(sdm, "configuration.token"),
                owner: _.get(sdm, "configuration.sdm.watch.github.owner", []),
                user: _.get(sdm, "configuration.sdm.watch.github.user", false),
                interval: _.get(sdm, "configuration.sdm.watch.github.interval", 1000 * 10),
                apiUrl: _.get(sdm, "configuration.sdm.watch.github.apiUrl", "https://api.github.com"),
                ...options,
            };

            const owners = toStringArray(optsToUse.owner);

            for (const owner of owners) {
                const criteria: ScmFeedCriteria = {
                    owner,
                    user: optsToUse.user,
                    apiUrl: optsToUse.apiUrl,
                };

                const feedEventReader = new GitHubActivityFeedEventReader(criteria, optsToUse.token, sdm.configuration);

                startWatching(criteria,
                    {
                        repositoryOwnerParentDirectory: determineDefaultRepositoryOwnerParentDirectory(),
                        interval: optsToUse.interval,
                        feedEventReader,
                    },
                    sdm);
            }
        },
    };
}
