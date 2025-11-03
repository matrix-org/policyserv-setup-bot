export class PolicyservApi {
    public constructor(private readonly baseUrl: string, private readonly apiKey: string) {
    }

    public async createCommunity(communityName: string): Promise<string> {
        const community = await this.doRequest<CommunityResponse>("POST", "/api/v1/communities/new", {
            name: communityName,
        });
        return community.community_id;
    }

    public async getCommunity(communityId: string): Promise<CommunityResponse | null> {
        try {
            return await this.doRequest<CommunityResponse>("GET", `/api/v1/communities/${encodeURIComponent(communityId)}`);
        } catch (e) {
            if (e.status === 404) {
                return null;
            }
            throw e;
        }
    }

    public async getInstanceCommunityConfig(): Promise<CommunityConfig> {
        return await this.doRequest<CommunityConfig>("GET", "/api/v1/instance/community_config");
    }

    public async setCommunityConfig(communityId: string, config: CommunityConfig): Promise<void> {
        await this.doRequest<void>("POST", `/api/v1/communities/${encodeURIComponent(communityId)}/config`, config);
    }

    public async getRoom(roomId: string): Promise<RoomResponse | null> {
        try {
            return await this.doRequest<RoomResponse>("GET", `/api/v1/rooms/${encodeURIComponent(roomId)}`);
        } catch (e) {
            if (e.status === 404) {
                return null;
            }
            throw e;
        }
    }

    public async addRoom(roomId: string, communityId: string): Promise<void> {
        await this.doRequest<void>("POST", `/api/v1/rooms/${encodeURIComponent(roomId)}/join`, {
            community_id: communityId,
        });
    }

    private async doRequest<T>(method: string, path: string, body?: any): Promise<T> {
        const req = await fetch(this.baseUrl + path, {
            method: method,
            headers: {
                "Authorization": `Bearer ${this.apiKey}`
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        if (req.status !== 200) {
            const body = await req.text();
            throw new HttpError(`Request (${path}) failed with status ${req.status}: ${body}`, req.status);
        }
        return await req.json();
    }
}

interface CommunityResponse {
    community_id: string;
    name: string;
    config: CommunityConfig;
}

export interface CommunityConfig {
    keyword_filter_keywords?: string[];
    mention_filter_max_mentions?: number; // whole number, positive to enable
    mention_filter_min_plaintext_length?: number; // whole number
    many_ats_filter_max_ats?: number; // whole number, positive to enable
    media_filter_media_types?: string[];
    density_filter_max_density?: number; // float, positive to enable
    density_filter_min_trigger_length?: number; // whole number, positive to enable
    trim_length_filter_max_difference?: number; // float, positive to enable
    length_filter_max_length?: number; // whole number, positive to enable
    sender_prefilter_allowed_senders?: string[];
    event_type_prefilter_allowed_event_types?: string[];
    event_type_prefilter_allowed_state_event_types?: string[];
    hellban_postfilter_minutes?: number; // whole number, positive to enable
    mjolnir_filter_enabled?: boolean;
    spam_threshold?: number; // float
    sticky_events_filter_allow_sticky_events?: boolean;
}

export interface ConfigDescription {
    property: keyof CommunityConfig;
    description: string;
    transformFn?: (val: string) => CommunityConfig[keyof CommunityConfig];
}

function toArray(val: string): string[] {
    return val.split(",").map(s => s.trim());
}

function toNumber(val: string): number {
    const n = Number(val);
    if (isNaN(n)) {
        throw new Error(`Invalid number: ${val}`);
    }
    return n;
}

function toBoolean(val: string): boolean {
    val = val.toLowerCase();
    if (val === "true" || val === "t" || val === "yes" || val === "y") {
        return true;
    } else if (val === "false" || val === "f" || val === "no" || val === "n") {
        return false;
    } else {
        throw new Error(`Invalid boolean: ${val}`);
    }
}

export const ConfigDescriptions: Record<string /* user-friendly name */, ConfigDescription /* actual name and some info */> = {
    "keywords": {
        property: "keyword_filter_keywords",
        description: "The keywords to cause an event to be marked as spam for. The search will be on the message's content regardless of type. Multiple keywords can be specified by separating them with commas.",
        transformFn: toArray,
    },
    "max_mentions": {
        property: "mention_filter_max_mentions",
        description: "The maximum number of mentions allowed in a single message. Set to -1 to disable.",
        transformFn: toNumber,
    },
    "min_plaintext_mention_length": {
        property: "mention_filter_min_plaintext_length",
        description: "The minimum length a user's display name must be to be considered a mention.",
        transformFn: toNumber,
    },
    "max_ats": {
        property: "many_ats_filter_max_ats",
        description: "The maximum number of '@' symbols allowed in a single message. Set to -1 to disable.",
        transformFn: toNumber,
    },
    "media_types": {
        property: "media_filter_media_types",
        description: "The event and message types to consider spam. Multiple types can be specified by separating them with commas.",
        transformFn: toArray,
    },
    "max_density": {
        property: "density_filter_max_density",
        description: "The maximum ratio of non-whitespace to whitespace characters allowed in a message. Set to -1 to disable.",
        transformFn: toNumber,
    },
    "min_length_for_density": {
        property: "density_filter_min_trigger_length",
        description: "The minimum length a message must be before the max_density value applies.",
        transformFn: toNumber,
    },
    "max_trim_difference": {
        property: "trim_length_filter_max_difference",
        description: "The maximum difference in length between the message and its trimmed version. Set to -1 to disable.",
        transformFn: toNumber,
    },
    "max_length": {
        property: "length_filter_max_length",
        description: "The maximum length an event can be when serialized in its federation (PDU) format. Set to -1 to disable.",
        transformFn: toNumber,
    },
    "allowed_senders": {
        property: "sender_prefilter_allowed_senders",
        description: "The users to always allow to send events. Multiple users can be specified by separating them with commas.",
        transformFn: toArray,
    },
    "allowed_event_types": {
        property: "event_type_prefilter_allowed_event_types",
        description: "The event types to always allow in a room (when the sender has appropriate power level to send them). Multiple types can be specified by separating them with commas.",
        transformFn: toArray,
    },
    "allowed_state_event_types": {
        property: "event_type_prefilter_allowed_state_event_types",
        description: "The state event types to always allow in a room (when the sender has appropriate power level to send them). Multiple types can be specified by separating them with commas.",
        transformFn: toArray,
    },
    "user_timeout_minutes": {
        property: "hellban_postfilter_minutes",
        description: "After a user is flagged for sending spam, consider all of their events as spam for this long. Sending more events does not extend this ban. Set to -1 to disable.",
        transformFn: toNumber,
    },
    "enforce_foundation_code_of_conduct": {
        property: "mjolnir_filter_enabled",
        description: "Whether to use the Matrix.org Foundation's code of conduct ban list to consider senders as spam. In future it may be possible to use a custom policy room/list.",
        transformFn: toBoolean,
    },
    // Note: we don't currently allow users to set this particular config option because internally policyserv only ever resolves to a 0.0 or 1.0 currently.
    // "spam_threshold": {
    //     property: "spam_threshold",
    //     description: "How 'spammy' an event must be to be considered spam. Zero is not spammy, one is very spammy.",
    //     transformFn: toNumber,
    // },
    "allow_sticky_events": {
        property: "sticky_events_filter_allow_sticky_events",
        description: "Whether to enable the use of MSC4354-style Sticky Events in rooms.",
        transformFn: toBoolean,
    }
};

interface RoomResponse {
    room_id: string;
    room_version: string;
    community_id: string;

    // the other fields are not relevant to us
}

class HttpError extends Error {
    constructor(message: string, public readonly status: number) {
        super(message);
    }
}
