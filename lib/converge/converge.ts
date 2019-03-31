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
import * as _ from "lodash";
import {
    ScmProvider,
    ScmProviderStateName,
    SetOwnerLogin,
    SetRepoLogin,
} from "../typings/types";
import {
    deleteWebhook,
    loadProvider,
    setProviderState,
} from "./api";
import { ConvergenceOptions } from "./convergeGitHub";
import {
    createOrgWebhook,
    createRepoWebhook,
    gitHub,
    isAuthError,
    printError,
} from "./github";

/**
 * Start the convergence for an entire workspace
 */
export async function convergeWorkspace(workspaceId: string,
                                        sdm: SoftwareDeliveryMachine,
                                        options: ConvergenceOptions): Promise<void> {

    // Look for SCMProviders of type github_com
    const graphClient = sdm.configuration.graphql.client.factory.create(workspaceId, sdm.configuration);
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

/**
 * Converge a single provider
 *
 * This is main entry point into the GitHub webhook convergence logic
 */
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

    const errors: string[] = [];
    let state: ScmProviderStateName;

    for (const org of _.uniq(orgs)) {
        try {
            logger.info(`Converging GitHub org '${org}'`);
            await convergeOrg(org, provider, token, graphClient);
        } catch (e) {
            logger.error(`Error converging GitHub org '${org}': `, e);
            if (isAuthError(e)) {
                state = ScmProviderStateName.unauthorized;
                errors.push(`Authorization error occurred converging GitHub org '${org}'`);
            } else {
                state = ScmProviderStateName.unauthorized ? ScmProviderStateName.unauthorized : ScmProviderStateName.misconfigured;
                logger.error(`Failed to converge GitHub org '${org}': ${printError(e)}\n${e.stack}`);
                errors.push(`Failed to converge GitHub org '${org}': ${printError(e)}`);
            }
        }
    }

    for (const repo of _.uniqWith(repos, _.isEqual)) {
        const slug = `${repo.ownerSpec}/${repo.nameSpec}`;
        try {
            logger.info(`Converging GitHub repo '${slug}'`);
            await convergeRepo(repo.ownerSpec, repo.nameSpec, provider, token, graphClient);
        } catch (e) {
            logger.error(`Error converging GitHub repo '${slug}': `, e);
            if (isAuthError(e)) {
                state = ScmProviderStateName.unauthorized;
                errors.push(`Authorization error occurred converging GitHub repo '${slug}'`);
            } else {
                state = ScmProviderStateName.unauthorized ? ScmProviderStateName.unauthorized : ScmProviderStateName.misconfigured;
                logger.error(`Failed to converge GitHub repo '${slug}': ${printError(e)}\n${e.stack}`);
                errors.push(`Failed to converge GitHub repo '${slug}': ${printError(e)}`);
            }
        }
    }

    const webhooksToDelete: string[] = [];
    // Delete webhooks for orgs or repos that went away; for now only mark them to get deleted later
    for (const webhook of (await loadProvider(graphClient, provider.id)).webhooks) {
        const org = webhook.tags.find(t => t.name === "org");
        const repo = webhook.tags.find(t => t.name === "repo");
        const hookId = webhook.tags.find(t => t.name === "hook_id");

        if (!!org && !provider.targetConfiguration.orgSpecs.some(o => o === org.value)) {
            logger.info(`Deleting GitHub webhook on org '${org.value}' because it is no longer in target configuration`);
            webhooksToDelete.push(webhook.id);
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
        } else if (!!repo) {
            const slug = repo.value.split("/");
            if (!provider.targetConfiguration.repoSpecs.some(o => o.ownerSpec === slug[0] && o.nameSpec === slug[1])) {
                logger.info(`Deleting GitHub webhook on repo '${repo.value}' because it is no longer in target configuration`);
                webhooksToDelete.push(webhook.id);
                if (!!hookId) {
                    try {
                        await gitHub(token, provider).repos.deleteHook({
                            hook_id: +hookId.value,
                            owner: slug[0],
                            repo: slug[1],
                        });
                    } catch (e) {
                        logger.info(
                            `Failed to delete GitHub webhook on repo '${repo.value}'`);
                    }
                }
            }
        }
    }

    // Mark all hooks with no hook_id to get deleted
    for (const webhook of (await loadProvider(graphClient, provider.id)).webhooks) {
        const hookId = webhook.tags.find(t => t.name === "hook_id");
        if (!hookId) {
            logger.info(`Deleting webhook because of missing hook_id`);
            webhooksToDelete.push(webhook.id);
        }
    }

    // Finally delete webhooks that got marked for deletion
    for (const webhookToDelete of _.uniq(webhooksToDelete)) {
        await deleteWebhook(graphClient, webhookToDelete);
    }

    await setProviderState(graphClient, provider, state, errors);

    return Success;
}

// tslint:enable:cyclomatic-complexity

/**
 * Converge a single org
 */
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

/**
 * Converge a single repo
 */
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
