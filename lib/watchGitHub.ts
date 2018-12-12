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
    ClientLogging,
    configureLogging,
    logger,
} from "@atomist/automation-client";
import {
    ExtensionPack,
    metadata,
} from "@atomist/sdm";
import { isInLocalMode } from "@atomist/sdm-core";
import {
    determineDefaultRepositoryOwnerParentDirectory,
} from "@atomist/sdm-local/lib/sdm/configuration/defaultLocalSoftwareDeliveryMachineConfiguration";
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
// TODO CD allow configuration options to be passed into the pack function
export function watchGitHub(): ExtensionPack {
    return {
        ...metadata("watch-github"),
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
            // TODO CD remove this! This is required as sdm-local will disable logging via its index
            configureLogging(ClientLogging);

            const provider = "github";
            const watchConfig: any = (!!sdm.configuration.sdm.watch ? sdm.configuration.sdm.watch[provider] : undefined) || {};

            if (!watchConfig.user && !watchConfig.owner) {
                logger.warn(`GitHub watching not starting. Configuration for user or owner at 'sdm.configuration.sdm.watch.github' missing.`);
                return;
            }

            const criteria: ScmFeedCriteria = {
                owner: watchConfig.owner,
                user: watchConfig.user,
                apiBase: watchConfig.apiBase,
            };

            const feedEventReader = new GitHubActivityFeedEventReader(criteria, sdm.configuration);

            startWatching(criteria,
                {
                    repositoryOwnerParentDirectory: determineDefaultRepositoryOwnerParentDirectory(),
                    intervalSeconds: watchConfig.seconds,
                    feedEventReader,
                },
                sdm);
        },
    };
}
