import {
    GraphClient,
    logger,
} from "@atomist/automation-client";
import * as github from "@octokit/rest";
import { ScmProvider } from "../typings/types";
import {
    addWebhookTag,
    createWebhook,
} from "./api";

export async function createOrgWebhook(org: string,
                                       provider: ScmProvider.ScmProvider,
                                       token: string,
                                       graphClient: GraphClient): Promise<void> {

    const cw = await createWebhook(graphClient, provider, { name: "org", value: org });

    const webhook = await gitHub(token, provider).orgs.createHook({
        active: true,
        name: "web",
        events: ["*"],
        org,
        config: {
            content_type: "json",
            secret: cw.secret,
            url: cw.webhook.url,
        },
    });

    const hookId = webhook.data.id;
    await addWebhookTag(graphClient, cw.webhook, { name: "hook_id", value: hookId.toString() });

    logger.debug(`Created new webhook for GitHub org ${org} with hook_id '${hookId}' and url '${cw.webhook.url}'`);
}

export async function createRepoWebhook(owner: string,
                                        repo: string,
                                        provider: ScmProvider.ScmProvider,
                                        token: string,
                                        graphClient: GraphClient): Promise<void> {

    const slug = `${owner}/${repo}`;
    const cw = await createWebhook(graphClient, provider, { name: "repo", value: slug });

    const webhook = await gitHub(token, provider).repos.createHook({
        active: true,
        name: "web",
        events: ["*"],
        owner,
        repo,
        config: {
            content_type: "json",
            secret: cw.secret,
            url: cw.webhook.url,
        },
    });

    const hookId = webhook.data.id;
    await addWebhookTag(graphClient, cw.webhook, { name: "hook_id", value: hookId.toString() });

    logger.debug(`Created new webhook for GitHub repo ${slug} with hook_id '${hookId}' and url '${cw.webhook.url}'`);
}

export function gitHub(token: string, provider: ScmProvider.ScmProvider): github {
    const apiUrl = new URL(provider.apiUrl);
    const api = new github({
        protocol: apiUrl.protocol,
        host: apiUrl.host,
        port: +apiUrl.port,
        pathPrefix: apiUrl.pathname,
    });
    api.authenticate({
        type: "token",
        token,
    });
    return api;
}

export function isAuthError(error: any): boolean {
    if (!!error && !!error.status && error.status === 401) {
        return true;
    } else {
        return false;
    }
}

export function printError(error: any): string {
    return error.message;
}
