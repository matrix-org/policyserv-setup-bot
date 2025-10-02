export class PolicyservApi {
    public constructor(private readonly baseUrl: string, private readonly apiKey: string) {
    }

    public async createCommunity(communityName: string): Promise<string> {
        const community = await this.doRequest<CommunityResponse>("POST", "/api/v1/communities/new", {
            name: communityName,
        });
        return community.community_id;
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
            throw new Error(`Request (${path}) failed with status ${req.status}: ${body}`);
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
