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

import { logger } from "@atomist/automation-client";
import {
    execPromise,
    SoftwareDeliveryMachine,
} from "@atomist/sdm";
import { dirFor } from "@atomist/sdm-local/lib/sdm/binding/project/expandedTreeUtils";
import * as fs from "fs-extra";
import {
    FeedEventReader,
    isRelevantEvent,
    RepoEvent,
    ScmFeedCriteria,
} from "./FeedEvent";

/**
 * Start watching this remote org
 * @param {ScmFeedCriteria} criteria
 * @return {Promise<void>}
 */
export function startWatching(criteria: ScmFeedCriteria,
                              setup: {
                                  repositoryOwnerParentDirectory: string,
                                  interval?: number,
                                  feedEventReader: FeedEventReader,
                              },
                              sdm: SoftwareDeliveryMachine): void {

    if (criteria.owner && criteria.owner.length > 0) {
        sdm.addStartupListener(async () => setup.feedEventReader.start());
        sdm.addTriggeredListener({
            trigger: {
                interval: setup.interval,
            },
            listener: async () => {
                try {
                    logger.info("Reading SCM activity feed for '%s'", criteria.owner);
                    const newEvents = (await setup.feedEventReader.readNewEvents())
                        .filter(isRelevantEvent);
                    await updateClonedProjects(criteria, newEvents, setup.repositoryOwnerParentDirectory);
                    logger.info("Finished reading SCM activity feed for '%s'", criteria.owner);
                } catch (e) {
                    logger.error("Error attempting to poll SCM provider: %s", e.message);
                }
            },
        });
    }
}

/**
 * Update projects based on commit criteria
 */
async function updateClonedProjects(criteria: ScmFeedCriteria,
                                    feedEvents: RepoEvent[],
                                    repositoryOwnerParentDirectory: string): Promise<void> {
    for (const pushEvent of feedEvents) {
        // Update to events
        const dir = dirFor(repositoryOwnerParentDirectory, pushEvent.repo.owner, pushEvent.repo.repo);
        if (fs.existsSync(dir)) {
            logger.info("Updating project '%s/%s' at directory '%s'", pushEvent.repo.owner, pushEvent.repo.repo, dir);
            const result = await execPromise("git", ["pull"], { cwd: dir });
            if (result.stdout) {
                logger.debug(result.stdout);
            }
            if (result.stderr) {
                logger.debug(result.stderr);
            }
        } else {
            logger.info("Ignoring push to un-managed project '%s/%s'. Expected directory does not exist '%s'",
                pushEvent.repo.owner, pushEvent.repo.repo, dir);
        }
    }
}
