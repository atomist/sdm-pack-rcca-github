import { Configuration } from "@atomist/automation-client";
import {
    SoftwareDeliveryMachine,
    SoftwareDeliveryMachineConfiguration,
} from "@atomist/sdm";
import {
    configureSdm,
    createSoftwareDeliveryMachine,
} from "@atomist/sdm-core";
import { convergeGitHub } from "../lib/converge/convergeGitHub";

function machine(config: SoftwareDeliveryMachineConfiguration): SoftwareDeliveryMachine {
    const sdm = createSoftwareDeliveryMachine({ name: "RCCA Test SDM", configuration: config });
    sdm.addExtensionPacks(convergeGitHub());
    return sdm;
}

export const configuration: Configuration = {
    postProcessors: [
        configureSdm(machine),
    ],
};
