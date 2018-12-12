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

import { HttpMethod } from "@atomist/automation-client";
import { SoftwareDeliveryMachineConfiguration } from "@atomist/sdm";
import {
    FeedEvent,
    ScmFeedCriteria,
} from "./support/FeedEvent";
import { AbstractActivityFeedEventReader } from "./support/AbstractActivityFeedEventReader";

export class GitHubActivityFeedEventReader extends AbstractActivityFeedEventReader {

    constructor(protected readonly criteria: ScmFeedCriteria,
                protected readonly configuration: SoftwareDeliveryMachineConfiguration) {
        super(criteria);
    }

    /**
     * Read the GitHub activity feed
     * @return {Promise<void>}
     */
    // TODO can get a CreateEvent also,
    public async readNewEvents(): Promise<FeedEvent[]> {

        // TODO how many events do you get
        const url = `${this.criteria.scheme || "https://"}${this.criteria.apiBase || "api.github.com"}/${
            !!this.criteria.user ? "users" : "orgs"}/${this.criteria.owner}/events`;

        const client = this.configuration.http.client.factory.create(url);
        const r = await client.exchange(url, {
            method: HttpMethod.Get,
            headers: {
                Authentication: `token ${this.configuration.token}`,
            },
        });
        const eventsRead = r.body as any[];

        const newEvents: FeedEvent[] = eventsRead
            .map(toFeedEvent)
            .filter(e => !this.eventWindow.some(seen => seen.id === e.id));
        this.eventWindow.push(...newEvents);
        return newEvents;
    }

}

function toFeedEvent(e: any): FeedEvent {
    // name is of form owner/name
    if (!!e.repo) {
        const elts = e.repo.name.split("/");
        e.repo.owner = elts[0];
        e.repo.repo = elts[1];
    }
    e.head = e.payload.head;
    e.ref = e.payload.ref;
    return e;
}
