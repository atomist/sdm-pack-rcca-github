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
    ApolloGraphClient,
    GraphClient,
    HandlerResult,
    logger,
    QueryNoCacheOptions,
    Success,
} from "@atomist/automation-client";
import { SoftwareDeliveryMachine } from "@atomist/sdm";
import {
    ScmProvider,
    ScmProviderStateName,
    SetOwnerLogin,
    SetRepoLogin,
} from "../typings/types";
import {
    deleteWebhook,
    setScmProviderState,
} from "./api";
import { ConvergenceOptions } from "./convergeGitHub";
import {
    createOrgWebhook,
    createRepoWebhook,
    gitHub,
    isAuthError,
    printError,
} from "./github";

export async function convergeWorkspace(workspaceId: string,
                                        sdm: SoftwareDeliveryMachine,
                                        options: ConvergenceOptions): Promise<void> {

    // Look for SCMProviders of type github_com
    const graphClient = new ApolloGraphClient(
        `${sdm.configuration.endpoints.graphql}/${workspaceId}`,
        { Authorization: `Bearer ${sdm.configuration.apiKey}` });

    const providers = await graphClient.query<ScmProvider.Query, ScmProvider.Variables>({
        name: "ScmProvider",
        variables: {
            type: options.providerType,
        },
        options: QueryNoCacheOptions,
    });

    if (providers && providers.SCMProvider && providers.SCMProvider.length > 0) {
        const provider = providers.SCMProvider[0];
        await convergeProvider(provider, graphClient);
    }
}

// tslint:disable:cyclomatic-complexity
export async function convergeProvider(provider: ScmProvider.ScmProvider,
                                       graphClient: GraphClient): Promise<HandlerResult> {

    // Only deal with auth'ed providers
    if (!provider.credential || !provider.credential.secret || !provider.targetConfiguration) {
        return Success;
    }

    const token = provider.credential.secret;
    const orgs = provider.targetConfiguration.orgSpecs || [];
    const repos = provider.targetConfiguration.repoSpecs || [];

    let error = false;

    for (const org of orgs) {
        try {
            logger.info(`Converging GitHub org '${org}'`);
            await convergeOrg(org, provider, token, graphClient);
        } catch (e) {
            error = true;
            logger.error(`Error converging GitHub org '${org}': `, e);
            if (isAuthError(e)) {
                await setScmProviderState(
                    graphClient,
                    provider,
                    ScmProviderStateName.unauthorized,
                    `Authorization error occurred converging GitHub org '${org}'`);
            } else {
                await setScmProviderState(
                    graphClient,
                    provider,
                    ScmProviderStateName.misconfigured,
                    `Failed to converge GitHub org '${org}': ${printError(e)}`);
            }
        }
    }

    // Delete webhooks for orgs that went away
    for (const webhook of provider.webhooks) {
        const org = webhook.tags.find(t => t.name === "org");
        const hookId = webhook.tags.find(t => t.name === "hook_id");

        if (!provider.targetConfiguration.orgSpecs.some(o => o === org.value)) {
            logger.info(`Deleting GitHub webhook on org '${org.value}' because it is no longer in target configuration`);
            await deleteWebhook(graphClient, webhook.id);
            if (!!hookId) {
                try {
                    await gitHub(token, provider).orgs.deleteHook({
                        hook_id: +hookId.value,
                        org: org.value,
                    });
                } catch (e) {
                    logger.info(
                        `Failed to delete GitHub webhook on org '${org.value}'`);
                }
            }
        }
    }

    for (const repo of repos) {
        const slug = `${repo.ownerSpec}/${repo.nameSpec}`;
        try {
            logger.info(`Converging GitHub repo '${slug}'`);
            await convergeRepo(repo.ownerSpec, repo.nameSpec, provider, token, graphClient);
        } catch (e) {
            error = true;
            logger.error(`Error converging GitHub slug '${slug}': `, e);
            if (isAuthError(e)) {
                await setScmProviderState(
                    graphClient,
                    provider,
                    ScmProviderStateName.unauthorized,
                    `Authorization error occurred converging GitHub repo '${slug}'`);
            } else {
                await setScmProviderState(
                    graphClient,
                    provider,
                    ScmProviderStateName.misconfigured,
                    `Failed to converge GitHub repo '${slug}': ${printError(e)}`);
            }
        }
    }

    // Delete all hooks with no hook_id
    for (const webhook of provider.webhooks) {
        const hookId = webhook.tags.find(t => t.name === "hook_id");
        if (!hookId) {
            logger.info(`Deleting webhook because of missing hook_id`);
            await deleteWebhook(graphClient, webhook.id);
        }
    }

    if (!error) {
        await setScmProviderState(graphClient, provider, ScmProviderStateName.converged);
    }

    return Success;
}
// tslint:enable:cyclomatic-complexity

export async function convergeOrg(org: string,
                                  provider: ScmProvider.ScmProvider,
                                  token: string,
                                  graphClient: GraphClient): Promise<void> {
    let createWebbook = false;
    const webhook = (provider.webhooks || []).find(
        wh => (wh.tags || []).some(t => t.name === "org" && t.value === org));

    if (!webhook) {
        // Case 1: no webhook on provider for given org
        logger.info(`No webhook found for GitHub org '${org}'. Creating new webhook`);
        createWebbook = true;
    } else {
        const tag = webhook.tags.find(wh => wh.name === "hook_id");
        if (tag) {
            const hookId = tag.value;

            try {
                const githubWebhook = await gitHub(token, provider).orgs.getHook({
                    hook_id: +hookId,
                    org,
                });
                if (!githubWebhook.data.active || githubWebhook.data.config.url !== webhook.url) {
                    // Case 2: webhook on provider different to the one on GitHub
                    logger.info(`Webhook found for GitHub org '${org}' on SCM provider but webhook is inactive or different url. ` +
                        `Deleting and creating new webhook`);
                    await deleteWebhook(graphClient, webhook.id);
                    await gitHub(token, provider).orgs.deleteHook({
                        hook_id: +hookId,
                        org,
                    });
                    createWebbook = true;
                }
            } catch (e) {
                // Case 3: webhook on provider but non on GitHub
                logger.info(
                    `Webhook found for GitHub org '${org}' on SCM provider but webhook not found on GitHub. Deleting and creating new webhook`);
                await deleteWebhook(graphClient, webhook.id);
                createWebbook = true;
            }
        } else {
            logger.info(`Webhook found for GitHub org '${org}' on SCM provider but no hook_id. Deleting and creating new webhook`);
            await deleteWebhook(graphClient, webhook.id);
            createWebbook = true;
        }
    }

    if (createWebbook) {
        await createOrgWebhook(org, provider, token, graphClient);
    }

    // Link up org and owner
    await graphClient.mutate<SetOwnerLogin.Mutation, SetOwnerLogin.Variables>({
        name: "SetOwnerLogin",
        variables: {
            providerId: provider.providerId,
            owner: org,
            login: provider.credential.owner.person.scmId.login,
        },
    });
}

// tslint:disable:cyclomatic-complexity
export async function convergeRepo(owner: string,
                                   repo: string,
                                   provider: ScmProvider.ScmProvider,
                                   token: string,
                                   graphClient: GraphClient): Promise<void> {
    let createWebbook = false;
    const slug = `${owner}/${repo}`;
    const webhook = (provider.webhooks || []).find(
        wh => (wh.tags || []).some(t => t.name === "repo" && t.value === slug));

    // Check if repo is covered by an org webhook
    const orgHasHook = (provider.targetConfiguration.orgSpecs || []).some(o => o === owner);

    if (!webhook) {
        // Case 1: no webhook on provider for given org
        logger.info(`No webhook found for GitHub repo '${slug}'. Creating new webhook`);
        createWebbook = true;
    } else {
        const tag = webhook.tags.find(wh => wh.name === "hook_id");
        if (tag) {
            const hookId = tag.value;

            try {
                const githubWebhook = await gitHub(token, provider).repos.getHook({
                    hook_id: +hookId,
                    owner,
                    repo,
                });
                if (orgHasHook || !githubWebhook.data.active || githubWebhook.data.config.url !== webhook.url) {
                    // Case 2: webhook on provider different to the one on GitHub
                    logger.info(
                        `Webhook found for GitHub repo '${slug}' on SCM provider but webhook is inactive or different url or the org has a hook. ` +
                        `Deleting and creating new webhook`);
                    await deleteWebhook(graphClient, webhook.id);
                    await gitHub(token, provider).repos.deleteHook({
                        hook_id: +hookId,
                        owner,
                        repo,
                    });
                    createWebbook = true;
                }
            } catch (e) {
                // Case 3: webhook on provider but non on GitHub
                logger.info(
                    `Webhook found for GitHub repo '${slug}' on SCM provider but webhook not found on GitHub. Deleting and creating new webhook`);
                await deleteWebhook(graphClient, webhook.id);
                createWebbook = true;
            }
        } else {
            logger.info(`Webhook found for GitHub repo '${repo}' on SCM provider but no hook_id. Deleting and creating new webhook`);
            await deleteWebhook(graphClient, webhook.id);
            createWebbook = true;
        }
    }

    if (orgHasHook) {
        return;
    }

    if (createWebbook) {
        await createRepoWebhook(owner, repo, provider, token, graphClient);
    }

    // Link up repo and owner
    await graphClient.mutate<SetRepoLogin.Mutation, SetRepoLogin.Variables>({
        name: "SetRepoLogin",
        variables: {
            providerId: provider.providerId,
            owner,
            repo,
            login: provider.credential.owner.person.scmId.login,
        },
    });
}
// tslint:enable:cyclomatic-complexity
