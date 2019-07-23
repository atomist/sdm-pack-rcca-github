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
    HandlerContext,
    logger,
    TokenCredentials,
} from "@atomist/automation-client";
import {
    GoalCompletionListener,
    GoalCompletionListenerInvocation,
    GoalsSetListener,
    GoalsSetListenerInvocation,
    SdmGoalEvent,
    SoftwareDeliveryMachine,
} from "@atomist/sdm";
import { gitHub } from "../converge/github";
import { SdmGoalState } from "../typings/types";

export function createPendingChecksOnGoalSet(sdm: SoftwareDeliveryMachine): GoalsSetListener {
    return async (inv: GoalsSetListenerInvocation) => {
        const { id, push, credentials } = inv;
        if (inv.goalSet && inv.goalSet.goals && inv.goalSet.goals.length > 0) {
            await gitHub((credentials as TokenCredentials).token, push.repo.org.provider.apiUrl).checks.create({
                repo: id.repo,
                owner: id.owner,
                head_sha: push.after.sha,
                name: name(sdm, inv.goalSetName),
                external_id: inv.goalSetId,
                details_url: link(inv, inv.context),
                started_at: new Date().toISOString(),
                status: "in_progress",
                output: {
                    title: prefix(sdm),
                    summary: inv.goalSet.goals.map(g => `![planned](http://images.atomist.com/rug/atomist_sdm_requested.png) ${g.plannedDescription}`).join("\n"),
                },
            });
        } else {
            return Promise.resolve();
        }
    };
}

export function setChecksOnGoalCompletion(sdm: SoftwareDeliveryMachine): GoalCompletionListener {
    return async (inv: GoalCompletionListenerInvocation): Promise<any> => {
        const { id, completedGoal, allGoals, credentials } = inv;

        const checks = await gitHub((credentials as TokenCredentials).token, completedGoal.push.repo.org.provider.apiUrl).checks.listForRef({
            check_name: name(sdm, completedGoal.goalSet),
            repo: completedGoal.repo.name,
            owner: completedGoal.repo.owner,
            ref: completedGoal.sha,
        });

        if (checks.data.total_count > 0) {
            const checkId = checks.data.check_runs[0].id;

            if (completedGoal.state === "failure") {
                logger.info("Setting GitHub check run to failed on %s", id.sha);
                await gitHub((credentials as TokenCredentials).token, completedGoal.push.repo.org.provider.apiUrl).checks.update({
                    check_run_id: checkId,
                    repo: completedGoal.repo.name,
                    owner: completedGoal.repo.owner,
                    status: "completed",
                    completed_at: new Date().toISOString(),
                    conclusion: "failure",
                    output: {
                        title: prefix(sdm),
                        summary: inv.allGoals.map(formatGoal).join("\n"),
                    },
                });
            } else if (allSuccessful(allGoals)) {
                logger.info("Setting GitHub check run to success on %s", id.sha);
                await gitHub((credentials as TokenCredentials).token, completedGoal.push.repo.org.provider.apiUrl).checks.update({
                    check_run_id: checkId,
                    repo: completedGoal.repo.name,
                    owner: completedGoal.repo.owner,
                    status: "completed",
                    completed_at: new Date().toISOString(),
                    conclusion: "success",
                    output: {
                        title: prefix(sdm),
                        summary: inv.allGoals.map(formatGoal).join("\n"),
                    },
                });
            } else {
                await gitHub((credentials as TokenCredentials).token, completedGoal.push.repo.org.provider.apiUrl).checks.update({
                    check_run_id: checkId,
                    repo: completedGoal.repo.name,
                    owner: completedGoal.repo.owner,
                    status: "in_progress",
                    output: {
                        title: prefix(sdm),
                        summary: inv.allGoals.map(formatGoal).join("\n"),
                    },
                });
            }
        }
        return;
    };
}

function formatGoal(goal: SdmGoalEvent): string {
    let details = "";
    if ((goal.state === SdmGoalState.in_process || goal.state === SdmGoalState.failure ||
        goal.state === SdmGoalState.stopped) && goal.phase) {
        details += ` \u00B7 ${goal.phase}`;
    } else {
        if (goal.externalUrls) {
            details += goal.externalUrls.map(eu => ` \u00B7 [${eu.label || "Link"}](${eu.url}})`).join("");
        }
    }
    if (goal.preApproval && goal.preApproval.userId) {
        if (goal.state === SdmGoalState.pre_approved) {
            details += ` \u00B7 start requested by @${goal.preApproval.userId}`;
        } else {
            details += ` \u00B7 started by @${goal.preApproval.userId}`;
        }
    }
    if (goal.approval && goal.approval.userId) {
        if (goal.state === SdmGoalState.approved) {
            details += ` \u00B7 approval requested by @${goal.approval.userId}`;
        } else {
            details += ` \u00B7 approved by @${goal.approval.userId}`;
        }
    }

    if (!!goal.url && goal.url.length > 0) {
        return `${sdmGoalStateToLink(goal.state)} [${goal.description}](${goal.url})${details}`;
    } else {
        return `${sdmGoalStateToLink(goal.state)} ${goal.description}${details}`;
    }
}

function allSuccessful(goals: SdmGoalEvent[]): boolean {
    return !goals.some(g => g.state !== "success");
}

function sdmGoalStateToLink(goalState: SdmGoalState): string {
    switch (goalState) {
        case SdmGoalState.planned:
            return "![planned](http://images.atomist.com/rug/atomist_sdm_requested.png)";
        case SdmGoalState.requested:
            return "![requested](http://images.atomist.com/rug/atomist_sdm_requested.png)";
        case SdmGoalState.in_process:
            return "![in process](http://images.atomist.com/rug/atomist_sdm_started.gif)";
        case SdmGoalState.waiting_for_approval:
            return "![approval](http://images.atomist.com/rug/atomist_sdm_approval.png)";
        case SdmGoalState.waiting_for_pre_approval:
            return "![pre approval](http://images.atomist.com/rug/atomist_sdm_preapproval.png)";
        case SdmGoalState.approved:
            return "![approval](http://images.atomist.com/rug/atomist_sdm_approval.png)";
        case SdmGoalState.pre_approved:
            return "![pre approval](http://images.atomist.com/rug/atomist_sdm_preapproval.png)";
        case SdmGoalState.success:
            return "![success](http://images.atomist.com/rug/atomist_sdm_passed.png)";
        case SdmGoalState.failure:
            return "![failure](http://images.atomist.com/rug/atomist_sdm_failed.png)";
        case SdmGoalState.skipped:
            return "![skipped](http://images.atomist.com/rug/atomist_sdm_skipped.png)";
        case SdmGoalState.stopped:
            return "![stopped](http://images.atomist.com/rug/atomist_sdm_stopped.png)";
        case SdmGoalState.canceled:
            return "![canceled](http://images.atomist.com/rug/atomist_sdm_canceled.png)";
        default:
            throw new Error("Unknown goal state " + goalState);
    }
}

function name(sdm: SoftwareDeliveryMachine, goalSetName: string): string {
    return `${prefix(sdm)}-${goalSetName}`;
}

function prefix(sdm: SoftwareDeliveryMachine): string {
    return sdm.name && sdm.name.length > 0 ? `${sdm.name} goals` : "Atomist SDM goals";
}

function context(sdm: SoftwareDeliveryMachine): string {
    return `sdm/${sdm.configuration.name.replace("@", "")}`;
}

function link(event: { goalSetId: string }, ctx: HandlerContext): string {
    return `https://app.atomist.com/workspace/${ctx.workspaceId}/goalset/${event.goalSetId}`;
}
