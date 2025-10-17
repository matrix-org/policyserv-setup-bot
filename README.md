# policyserv-setup-bot

A bot to set up communities with policyserv.

> [!NOTE] 
> This bot is intended to be replaced by a web interface in policyserv eventually. Watch the [matrix.org blog](https://matrix.org/blog/) for updates.

## Usage

To set up your community on the Foundation's instance:

1. Create a **private** (preferably **encrypted**) room. This will become your community's management room - anyone in the room can run commands.
2. Invite `@policyserv:matrix.org` to that room.
3. Say `!policyserv community YOUR_COMMUNITY_NAME` in that room.
4. For each of the rooms you want to have protected under this community, say `!policyserv apply <room ID or alias>`
5. The Foundation's T&S team will review the request and either approve or deny it. At this stage, it's recommended to give `@policyserv:matrix.org` "Moderator" permissions in the room so it can set up the policy server for you, if/when approved.
6. At any time, you can say `!policyserv config` to see the community's configuration, and `!policyserv set <config key> <value>` to change it.

For further information, say `!policyserv help` in your community's management room.

<!-- dev note: we don't link to specific emails here to avoid (further) spam from internet crawlers -->
Issues with `@policyserv:matrix.org` should be reported to the abuse contact at https://matrix.org/contact/ - please *do not* email support.

## Install

*This is intended for development only.*

1. Clone the repo and install the latest NodeJS LTS if you haven't already.
2. `npm install`
3. `npm start` (with the appropriate environment variables set - see Docker below for examples)

## Docker

If you're running your own policyserv instance and want to use this bot, the following Docker Compose file will get you started:

```yaml
services:
  policyserv-setup-bot:
    # It's best to use the latest tagged version rather than main.
    image: ghcr.io/matrix-org/policyserv-setup-bot:main
    ports:
      # This is for healthz and is optional if you don't need it.
      - "127.0.0.1:8080:8080"
    restart: unless-stopped
    environment:
      - USER_ID=@bot:example.org
      - PASSWORD=password_for_above_user_id_goes_here
      - HOMESERVER_URL=https://matrix-client.matrix.org
      # The safety team room must already exist, and have a pending invite for the bot. This
      # will be the room where the bot posts activity and room application requests.
      - SAFETY_TEAM_ROOM_ID=!room:example.org
      - STORAGE_PATH=/data
      - POLICYSERV_BASE_URL=https://your_policyserv.example.org
      - POLICYSERV_API_KEY=your_policyserv_api_key_goes_here
      - POLICYSERV_SERVER_NAME=policyserv.example.org
      # policyserv prints its public event signing key on startup. Look for the line starting
      # with "Public event key:" and copy the base64 value after "ed25519:policy_server".
      - POLICYSERV_EVENT_SIGNING_KEY=unpadded_base64_encoded_PUBLIC_key
      - APPEAL_DIRECTIONS=To appeal this decision, please contact abuse@example.org
      - COMMUNITY_RATE_LIMIT_WINDOW_MS=600000
      - COMMUNITY_RATE_LIMIT_MAX=10
      - USER_RATE_LIMIT_WINDOW_MS=600000
      - USER_RATE_LIMIT_MAX=10
      - HEALTHZ_BIND=0.0.0.0:8080
    volumes:
      - ./data:/data
```
