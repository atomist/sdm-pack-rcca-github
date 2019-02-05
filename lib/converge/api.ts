import {
    GraphClient,
    logger,
} from "@atomist/automation-client";
import * as _ from "lodash";
import {
    AddWebhookTag,
    CreateWebhook,
    DeleteWebhook,
    ScmProvider,
    ScmProviderStateName,
    SetScmProviderState,
} from "../typings/types";
import { nonce } from "../util/utils";

export async function deleteWebhook(graphClient: GraphClient,
                                    id: string): Promise<void> {
    try {
        await graphClient.mutate<DeleteWebhook.Mutation, DeleteWebhook.Variables>({
            name: "DeleteWebhook",
            variables: {
                id,
            },
        });
    } catch (e) {
        logger.warn(`Failed to delete webhook with id '${id}'`);
    }
}

export async function createWebhook(graphClient: GraphClient,
                                    provider: ScmProvider.ScmProvider,
                                    tag: { name: string, value: string }): Promise<{ webhook: CreateWebhook.CreateWebhook, secret: string }> {
    const secret = nonce(50);
    return {
        webhook: (await graphClient.mutate<CreateWebhook.Mutation, CreateWebhook.Variables>({
            name: "CreateWebhook",
            variables: {
                header: "X-Hub-Signature",
                resourceProviderId: provider.id,
                name: `Atomist`,
                secret,
                tags: [{
                    name: tag.name,
                    value: tag.value,
                }],
            },
        })).createWebhook, secret,
    };
}

export async function addWebhookTag(graphClient: GraphClient,
                                    webhook: CreateWebhook.CreateWebhook,
                                    tag: { name: string, value: string }): Promise<void> {
    await graphClient.mutate<AddWebhookTag.Mutation, AddWebhookTag.Variables>({
        name: "AddWebhookTag",
        variables: {
            id: webhook.id,
            name: tag.name,
            value: tag.value,
        },
    });
}

export async function setScmProviderState(graphClient: GraphClient,
                                          provider: ScmProvider.ScmProvider,
                                          state: ScmProviderStateName,
                                          error?: string): Promise<void> {
    const currentState = _.get(provider, "state.name");
    let currentError = _.get(provider, "state.error");
    if (currentError === "") {
        currentError = undefined;
    }
    if (state !== currentState || currentError !== error) {
        await graphClient.mutate<SetScmProviderState.Mutation, SetScmProviderState.Variables>({
            name: "SetScmProviderState",
            variables: {
                id: provider.id,
                state,
                error,
            },
        });
    }
}
