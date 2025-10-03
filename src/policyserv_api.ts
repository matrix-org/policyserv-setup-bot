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
}

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
