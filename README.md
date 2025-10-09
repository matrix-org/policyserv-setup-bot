# policyserv-setup-bot

A bot to set up communities with policyserv.

> [!NOTE] 
> This bot is intended to be replaced by a web interface in policyserv eventually. Watch the [matrix.org blog](https://matrix.org/blog/) for updates.

## Usage

TODO: Instructions on how to use the Foundation's bot (when available).

## Install

1. Clone the repo and install the latest NodeJS LTS if you haven't already.
2. `npm install`
3. `npm start`

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
      - APPEAL_DIRECTIONS=To appeal this decision, please contact abuse@example.org
      - COMMUNITY_RATE_LIMIT_WINDOW_MS=600000
      - COMMUNITY_RATE_LIMIT_MAX=10
      - USER_RATE_LIMIT_WINDOW_MS=600000
      - USER_RATE_LIMIT_MAX=10
      - HEALTHZ_BIND=0.0.0.0:8080
    volumes:
      - ./data:/data
```
