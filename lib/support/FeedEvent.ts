/**
 * Activity Feed
 * Modeled on GitHub activity feed, but not SCM specific
 */
import { RepoId } from "@atomist/automation-client";

export interface FeedEvent {
    type: "PushEvent" | string;
    id: string;
}

export interface RepoEvent extends FeedEvent {

    repo: RepoId;
}

/**
 * Push
 */
export interface PushEvent extends RepoEvent {

    type: "PushEvent";

    /**
     * Branch
     */
    ref: string;

    /**
     * After sha
     */
    head: string;

    actor: {
        login: string;
    };
}

export function isPushEvent(a: any): a is PushEvent {
    const maybe = a as PushEvent;
    return maybe.type === "PushEvent";
}

// TODO how many events do we get?

/**
 * Typically used in creating a FeedEventReader
 */
export interface ScmFeedCriteria {
    readonly scheme?: string;
    readonly apiBase?: string;
    readonly owner: string;
    readonly user?: boolean;
}

export interface FeedEventReader {

    /**
     * Window of events we've seen, to allow deduping
     */
    readonly eventWindow: FeedEvent[];

    /**
     * Get all the latest feed events.
     * The implementation is responsible for not delivering
     * events already seen.
     * @return {Promise<FeedEvent[]>}
     */
    readNewEvents(): Promise<FeedEvent[]>;

    /**
     * Perform whatever startup is necessary, such as ignoring previous events
     * @return {Promise<void>}
     */
    start(): Promise<void>;

}
