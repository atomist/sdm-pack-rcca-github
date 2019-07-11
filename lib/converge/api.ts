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
    MutationNoCacheOptions,
    QueryNoCacheOptions,
} from "@atomist/automation-client";
import * as _ from "lodash";
import {
    AddWebhookTag,
    CreateWebhook,
    DeleteWebhook,
    FetchResourceProvider,
    GitHubAppInstallationInput,
    OnGitHubAppScmId,
    SaveGitHubAppUserInstallations,
    ScmProvider,
    ScmProviderById,
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

export async function setProviderState(graphClient: GraphClient,
                                       provider: ScmProvider.ScmProvider,
                                       state: ScmProviderStateName = ScmProviderStateName.converged,
                                       errors?: string[]): Promise<void> {
    const newError = (errors || []).sort((e1, e2) => e1.localeCompare(e2)).join(", ");
    const currentState = _.get(provider, "state.name");
    const currentError = _.get(provider, "state.error");
    if (state !== currentState || newError !== currentError) {
        await graphClient.mutate<SetScmProviderState.Mutation, SetScmProviderState.Variables>({
            name: "SetScmProviderState",
            variables: {
                id: provider.id,
                state,
                error: newError,
            },
        });
    }
}

export async function loadScmProvider(graphClient: GraphClient,
                                      id: string): Promise<ScmProvider.ScmProvider> {
    return (await graphClient.query<ScmProviderById.Query, ScmProviderById.Variables>({
        name: "ScmProviderById",
        variables: {
            id,
        },
        options: QueryNoCacheOptions,
    })).SCMProvider[0];
}

export async function saveGitHubAppUserInstallations(graphClient: GraphClient,
                                                     scmId: OnGitHubAppScmId.ScmId,
                                                     installations: GitHubAppInstallationInput[]):
    Promise<SaveGitHubAppUserInstallations.SaveGitHubAppUserInstallations> {
        return (await graphClient.mutate<SaveGitHubAppUserInstallations.Mutation, SaveGitHubAppUserInstallations.Variables>({
            name: "saveGitHubAppUserInstallations",
            variables: {
                installations,
                pid: scmId.provider.id,
                userId: scmId.id,
            },
            options: MutationNoCacheOptions,
        })).saveGitHubAppUserInstallations[0];
}

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
