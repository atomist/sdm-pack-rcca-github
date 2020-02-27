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

import { logger } from "@atomist/automation-client/lib/util/logger";
import * as github from "@octokit/rest";
import { ScmProvider } from "../typings/types";

// Install the throttling plugin
// tslint:disable:no-var-requires
github.plugin(require("@octokit/plugin-throttling"));

export function gitHub(token: string, providerOrApiUrl: ScmProvider.ScmProvider | string): github {
    const apiUrl = new URL(typeof providerOrApiUrl === "string" ? providerOrApiUrl : providerOrApiUrl.apiUrl);
    const api = new github({
        auth: `token ${token}`,
        protocol: apiUrl.protocol,
        host: apiUrl.host,
        port: +apiUrl.port,
        pathPrefix: apiUrl.pathname,
        throttle: {
            onRateLimit: (retryAfter: any, options: any) => {
                logger.warn(`Request quota exhausted for request '${options.method} ${options.url}'`);

                if (options.request.retryCount === 0) { // only retries once
                    logger.debug(`Retrying after ${retryAfter} seconds!`);
                    return true;
                }
                return false;
            },
            onAbuseLimit: (retryAfter: any, options: any) => {
                logger.warn(`Abuse detected for request '${options.method} ${options.url}'`);
            },
        },
    });
    return api;
}
