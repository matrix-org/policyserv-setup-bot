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
    untrusted_media_filter_media_types?: string[];
    untrusted_media_filter_use_muninn?: boolean;
    untrusted_media_filter_use_power_levels?: boolean;
    untrusted_media_filter_allowed_user_globs?: string[];
    untrusted_media_filter_denied_user_globs?: string[];
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
    webhook_url?: string;
    openai_filter_fail_secure?: boolean;
    sticky_events_filter_allow_sticky_events?: boolean;
    hma_filter_enabled_banks?: string[];
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
    "untrusted_media_types": {
        property: "untrusted_media_filter_media_types",
        description: "The event and message types to consider spam if the sender is not trusted. Multiple types can be specified by separating them with commas. Trust uses a deny-wins model, where the first trust source to deny a user will cause them to be untrusted. If no trust sources deny the user, then the first to allow them will cause them to be trusted. This filter assumes no trust by default (and therefore denies after all trust sources are consulted).",
        transformFn: toArray,
    },
    "enable_muninn_hall_trust_source": {
        property: "untrusted_media_filter_use_muninn",
        description: "Trusts users from servers which are members of Muninn Hall.",
        transformFn: toBoolean,
    },
    "enable_power_levels_trust_source": {
        property: "untrusted_media_filter_use_power_levels",
        description: "Trusts users if they have above-default power levels in the room.",
        transformFn: toBoolean,
    },
    "allowed_globs_trust_source": {
        property: "untrusted_media_filter_allowed_user_globs",
        description: "The globs of users to trust. Multiple globs can be specified by separating them with commas.",
        transformFn: toArray,
    },
    "denied_globs_trust_source": {
        property: "untrusted_media_filter_denied_user_globs",
        description: "The globs of users to explicitly not trust. Multiple globs can be specified by separating them with commas. Overrides any source which trusts a user.",
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
    // Note: we don't currently allow this to be set because we don't have a good way to indicate whether the URL domain is allowed.
    // "webhook_url": {
    //     property: "webhook_url",
    //     description: "The (preferably Hookshot) URL to send notifications of spammy events to. If not set, no notifications will be sent.",
    // },
    "fail_secure_for_openai": {
        property: "openai_filter_fail_secure",
        description: "If the OpenAI filter is enabled for your community or room, this determines whether it considers an event spam when the filter cannot reach OpenAI. Set to false to allow events to pass during errors.",
        transformFn: toBoolean,
    },
    "allow_sticky_events": {
        property: "sticky_events_filter_allow_sticky_events",
        description: "Whether to enable the use of MSC4354-style Sticky Events in rooms.",
        transformFn: toBoolean,
    },
    // Note: we don't currently allow this to be changed because we want to ensure that illegal content is always blocked. We'll need to find a way to make this additive rather than replace the instance's values.
    // "enabled_hma_banks": {
    //     property: "hma_filter_enabled_banks",
    //     description: "If the HMA filter is enabled for your community, these are the bank names to scan media against. Multiple banks can be specified by separating them with commas.",
    //     transformFn: toArray,
    // },
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
