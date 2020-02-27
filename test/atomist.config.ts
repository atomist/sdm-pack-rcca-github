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

import { Configuration } from "@atomist/automation-client/lib/configuration";
import { SoftwareDeliveryMachine } from "@atomist/sdm/lib/api/machine/SoftwareDeliveryMachine";
import { SoftwareDeliveryMachineConfiguration } from "@atomist/sdm/lib/api/machine/SoftwareDeliveryMachineOptions";
import { configureSdm } from "@atomist/sdm/lib/core/machine/configureSdm";
import { createSoftwareDeliveryMachine } from "@atomist/sdm/lib/core/machine/machineFactory";
import { githubConvergeSupport } from "../lib/converge/convergeGitHub";

function machine(config: SoftwareDeliveryMachineConfiguration): SoftwareDeliveryMachine {
    const sdm = createSoftwareDeliveryMachine({ name: "RCCA Test SDM", configuration: config });
    sdm.addExtensionPacks(githubConvergeSupport());
    return sdm;
}

export const configuration: Configuration = {
    postProcessors: [
        configureSdm(machine),
    ],
};
