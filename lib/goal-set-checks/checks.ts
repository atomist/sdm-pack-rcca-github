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

import { metadata } from "@atomist/sdm/lib/api-helper/misc/extensionPack";
import { ExtensionPack } from "@atomist/sdm/lib/api/machine/ExtensionPack";
import {
    isGitHubAction,
    isInLocalMode,
} from "@atomist/sdm/lib/core/machine/modes";
import {
    createPendingChecksOnGoalSet,
    setChecksOnGoalCompletion,
} from "./checksSetters";

export function githubGoalChecksSupport(): ExtensionPack {
    return {
        ...metadata("github-goal-checks"),
        configure: sdm => {
            if (!isGitHubAction() && !isInLocalMode()) {
                sdm.addGoalsSetListener(createPendingChecksOnGoalSet(sdm));
                sdm.addGoalCompletionListener(setChecksOnGoalCompletion(sdm));
            }
        },
    };
}
