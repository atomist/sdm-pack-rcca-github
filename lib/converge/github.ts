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
    GraphClient,
    logger,
} from "@atomist/automation-client";
import * as github from "@octokit/rest";
import { ScmProvider } from "../typings/types";
import {
    addWebhookTag,
    createWebhook,
} from "./api";

export async function createOrgWebhook(org: string,
                                       provider: ScmProvider.ScmProvider,
                                       token: string,
                                       graphClient: GraphClient): Promise<void> {

    const cw = await createWebhook(graphClient, provider, { name: "org", value: org });

    const webhook = await gitHub(token, provider).orgs.createHook({
        active: true,
        name: "web",
        events: ["*"],
        org,
        config: {
            content_type: "json",
            secret: cw.secret,
            url: cw.webhook.url,
        },
    });

    const hookId = webhook.data.id;
    await addWebhookTag(graphClient, cw.webhook, { name: "hook_id", value: hookId.toString() });

    logger.debug(`Created new webhook for GitHub org ${org} with hook_id '${hookId}' and url '${cw.webhook.url}'`);
}

export async function createRepoWebhook(owner: string,
                                        repo: string,
                                        provider: ScmProvider.ScmProvider,
                                        token: string,
                                        graphClient: GraphClient): Promise<void> {

    const slug = `${owner}/${repo}`;
    const cw = await createWebhook(graphClient, provider, { name: "repo", value: slug });

    const webhook = await gitHub(token, provider).repos.createHook({
        active: true,
        name: "web",
        events: ["*"],
        owner,
        repo,
        config: {
            content_type: "json",
            secret: cw.secret,
            url: cw.webhook.url,
        },
    });

    const hookId = webhook.data.id;
    await addWebhookTag(graphClient, cw.webhook, { name: "hook_id", value: hookId.toString() });

    logger.debug(`Created new webhook for GitHub repo ${slug} with hook_id '${hookId}' and url '${cw.webhook.url}'`);
}

export function gitHub(token: string, provider: ScmProvider.ScmProvider): github {
    const apiUrl = new URL(provider.apiUrl);
    const api = new github({
        auth: `token ${token}`,
        protocol: apiUrl.protocol,
        host: apiUrl.host,
        port: +apiUrl.port,
        pathPrefix: apiUrl.pathname,
    });
    return api;
}

export function isAuthError(error: any): boolean {
    if (!!error && !!error.status && error.status === 401) {
        return true;
    } else {
        return false;
    }
}

export function printError(error: any): string {
    return error.message;
}
