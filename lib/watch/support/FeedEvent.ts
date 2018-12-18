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

    /**
     * Branch
     */
    ref: string;

    actor: {
        login: string;
    };
}

/**
 * Delete
 */
export interface DeleteEvent extends RepoEvent {

    type: "DeleteEvent";

}

/**
 * Create
 */
export interface CreateEvent extends RepoEvent {

    type: "CreateEvent";

}

/**
 * Push
 */
export interface PushEvent extends RepoEvent {

    type: "PushEvent";

    /**
     * After sha
     */
    head: string;

}

export function isRelevantEvent(a: any): a is RepoEvent {
    const maybe = a as RepoEvent;
    return ["PushEvent", "CreateEvent", "DeleteEvent"].includes(maybe.type);
}

// TODO how many events do we get?

/**
 * Typically used in creating a FeedEventReader
 */
export interface ScmFeedCriteria {
    readonly apiUrl?: string;
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
