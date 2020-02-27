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
    QueryNoCacheOptions,
} from "@atomist/automation-client/lib/spi/graph/GraphClient";
import {
    FetchResourceProvider,
    ScmProvider,
} from "../typings/types";

export async function loadResourceProvider(graphClient: GraphClient,
                                           id: string): Promise<FetchResourceProvider.ResourceProvider> {
    return (await graphClient.query<FetchResourceProvider.Query, FetchResourceProvider.Variables>({
        name: "FetchResourceProvider",
        variables: {
            id,
        },
        options: QueryNoCacheOptions,
    })).ResourceProvider[0];
}

export async function isGitHubAppsResourceProvider(graphClient: GraphClient,
                                                   provider: ScmProvider.ScmProvider): Promise<boolean> {
    const rp = await loadResourceProvider(graphClient, provider.id);
    return rp.__typename as any === "GitHubAppResourceProvider";
}
