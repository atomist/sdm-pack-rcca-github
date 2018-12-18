import {
    GraphClient,
    GraphQL,
    logger,
    QueryNoCacheOptions,
    Success,
} from "@atomist/automation-client";
import { ApolloGraphClient } from "@atomist/automation-client/lib/graph/ApolloGraphClient";
import {
    EventHandlerRegistration,
    ExtensionPack,
    metadata,
    SoftwareDeliveryMachine,
} from "@atomist/sdm";
import * as github from "@octokit/rest";
import * as _ from "lodash";
import * as minimatch from "minimatch";
import {
    AddWebhookTag,
    CreateWebhook,
    DeleteWebhook,
    OnScmProvider,
    ProviderType,
    ScmProvider,
    SetScmProviderConfiguration,
} from "../typings/types";
import { nonce } from "../util/utils";

/**
 * Configuration options for the GitHub RCCA
 */
export interface ConvergenceOptions {
    /**
     * Token to use for managing webhooks against GitHub.
     * If not value is provided here, configuration is checked for a token at 'sdm.converge.github.token' and 'token'
     */
    token?: string;

    /**
     * Interval in ms of convergence runs
     */
    interval?: number;
}

/**
 * GitHub RCCA Extension Pack to manage webhook resources on GitHub.com or on-prem GHE
 * @param options
 */
export function convergeGitHub(options: ConvergenceOptions = {}): ExtensionPack {
    return {
        ...metadata("converge"),
        configure: sdm => {

            const optsToUse: ConvergenceOptions = {
                token: _.get(sdm, "configuration.sdm.converge.github.token") || _.get(sdm, "configuration.token"),
                interval: _.get(sdm, "configuration.sdm.converge.github.interval", 1000 * 60 * 10),
                ...options,
            };

            const converge = async (l: any) => {
                for (const workspaceId of sdm.configuration.workspaceIds) {
                    await convergeWorkspace(workspaceId, sdm);
                }
            };

            sdm.addTriggeredListener({
                listener: converge,
                trigger: {
                    interval: optsToUse.interval,
                },
            });
            sdm.addStartupListener(converge);

            sdm.addEvent(onScmProviderHandler(optsToUse));
        },
    };
}

async function convergeWorkspace(workspaceId: string,
                                 sdm: SoftwareDeliveryMachine): Promise<void> {

    // Look for SCMProviders of type github_com
    const graphClient = new ApolloGraphClient(
        `${sdm.configuration.endpoints.graphql}/${workspaceId}`,
        { Authorization: `Bearer ${sdm.configuration.apiKey}` });

    const providers = await graphClient.query<ScmProvider.Query, ScmProvider.Variables>({
        name: "ScmProvider",
        variables: {
            type: ProviderType.github_com,
        },
        options: QueryNoCacheOptions,
    });

    if (providers && providers.SCMProvider && providers.SCMProvider.length > 0) {
        const provider = providers.SCMProvider[0];

        await graphClient.mutate<SetScmProviderConfiguration.Mutation, SetScmProviderConfiguration.Variables>({
            name: "SetScmProviderConfiguration",
            variables: {
                id: provider.id,
                description: "Last convergence run",
                name: "last_convergence",
                value: new Date().toISOString(),
            },
        });
    }
}

function onScmProviderHandler(options: ConvergenceOptions): EventHandlerRegistration<OnScmProvider.Subscription> {
    return {
        name: "OnGitHubScmProvider",
        subscription: GraphQL.subscription({
            name: "OnScmProvider",
            variables: {
                type: GraphQL.enumValue([ProviderType.github_com, ProviderType.ghe]),
            },
        }),
        description: "Converge on GitHub ScmProvider events",
        listener: async (e, ctx) => {
            const providers = e.data;

            const githubOrgs = await (gitHub(options.token, providers.SCMProvider[0]) as any).paginate(
                "GET /user/orgs",
                {},
                (response: any) => response.data.map((org: any) => org.login));

            const orgsValue = providers.SCMProvider[0].configuration.find(c => c.name === "orgs").value;
            const orgs = orgsValue ? orgsValue.split(",") : [];

            for (const githubOrg of githubOrgs) {
                for (const org of orgs) {
                    try {
                        if (minimatch(githubOrg, org.trim())) {
                            logger.info(`Converging GitHub org '${githubOrg}'`);
                            await convergeOrg(org.trim(), providers.SCMProvider[0], options.token, ctx.graphClient);
                        }
                    } catch (e) {
                        logger.error(`Error converging GitHub org '${githubOrg}': `, e);
                    }
                }
            }

            return Success;
        },
    };
}

async function createOrgWebhook(org: any,
                                provider: ScmProvider.ScmProvider,
                                token: string,
                                graphClient: GraphClient): Promise<void> {

    const secret = nonce(50);
    const result = await graphClient.mutate<CreateWebhook.Mutation, CreateWebhook.Variables>({
        name: "CreateWebhook",
        variables: {
            header: "X-Hub-Signature",
            providerId: provider.id,
            name: `Atomist`,
            secret,
            tags: [{
                name: "org",
                value: org.trim(),
            }],
        },
    });

    const webhook = await gitHub(token, provider).orgs.createHook({
        active: true,
        name: "web",
        events: ["*"],
        org: org.trim(),
        config: {
            content_type: "json",
            secret,
            url: result.createWebhook.url,
        },
    });

    const hookId = webhook.data.id;
    await graphClient.mutate<AddWebhookTag.Mutation, AddWebhookTag.Variables>({
        name: "AddWebhookTag",
        variables: {
            id: result.createWebhook.id,
            name: "hook_id",
            value: hookId.toString(),
        },
    });
    logger.debug(`Created new webhook for GitHub org ${org} with hook_id '${hookId}' and url '${result.createWebhook.url}'`);
}

async function deleteWebhook(id: string,
                             graphClient: GraphClient): Promise<void> {
    await graphClient.mutate<DeleteWebhook.Mutation, DeleteWebhook.Variables>({
        name: "DeleteWebhook",
        variables: {
            id,
        },
    });
}

async function convergeOrg(org: string,
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
                    await deleteWebhook(webhook.id, graphClient);
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
                await deleteWebhook(webhook.id, graphClient);
                createWebbook = true;
            }
        } else {
            logger.info(`Webhook found for GitHub org '${org}' on SCM provider but no hook_id. Deleting and creating new webhook`);
            await deleteWebhook(webhook.id, graphClient);
            createWebbook = true;
        }
    }

    if (createWebbook) {
        await createOrgWebhook(org, provider, token, graphClient);
    }
}

function gitHub(token: string, provider: ScmProvider.ScmProvider): github {
    const api = new github({
        baseUrl: provider.apiUrl,
    });
    api.authenticate({
        type: "token",
        token,
    });
    return api;
}
