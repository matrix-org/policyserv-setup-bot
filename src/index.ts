import {
    AutojoinRoomsMixin,
    MatrixAuth,
    MatrixClient,
    MatrixEvent, RustSdkCryptoStorageProvider, RustSdkCryptoStoreType,
    SimpleFsStorageProvider, TextualMessageEventContent
} from "@vector-im/matrix-bot-sdk";
import * as path from "node:path";
import {PolicyservApi} from "./policyserv_api";

const escapeHtml = require("escape-html");

const userId = process.env.USER_ID;
const password = process.env.PASSWORD;
const homeserverUrl = process.env.HOMESERVER_URL;
const safetyTeamRoomId = process.env.SAFETY_TEAM_ROOM_ID;
const storagePath = process.env.STORAGE_PATH || "bot";
const policyservBaseUrl = process.env.POLICYSERV_BASE_URL;
const policyservApiKey = process.env.POLICYSERV_API_KEY;

function requireVariable(v: string | undefined, name: string): void {
    if (!v) {
        console.error(`Missing environment variable ${name}`);
        process.exit(1);
    }
}

requireVariable(userId, "USER_ID");
requireVariable(password, "PASSWORD");
requireVariable(homeserverUrl, "HOMESERVER_URL");
requireVariable(safetyTeamRoomId, "SAFETY_TEAM_ROOM_ID");
requireVariable(policyservBaseUrl, "POLICYSERV_BASE_URL");
requireVariable(policyservApiKey, "POLICYSERV_API_KEY");

const policyservApi = new PolicyservApi(policyservBaseUrl, policyservApiKey);

(async () => {
    // Log in to get a fresh access token/device ID if we haven't already
    const storageProvider = new SimpleFsStorageProvider(path.join(storagePath, "bot.json"));
    let accessToken = storageProvider.readValue("accessToken");
    if (!accessToken) {
        console.log("Logging in...");
        const tempClient = await new MatrixAuth(homeserverUrl).passwordLogin(userId, password, "policyserv-bot");
        storageProvider.storeValue("accessToken", tempClient.accessToken);
        accessToken = tempClient.accessToken;
    }
    const cryptoStorage = new RustSdkCryptoStorageProvider(storagePath, 0); // 0 == sqlite

    // Create the client and attach all of the listeners
    const client = new MatrixClient(homeserverUrl, accessToken, storageProvider, cryptoStorage);
    AutojoinRoomsMixin.setupOnClient(client);

    // Ensure we're joined to the safety team room
    await client.joinRoom(safetyTeamRoomId);

    client.on("room.join", async (roomId: string, event: MatrixEvent) => {
        console.log(`Joined ${roomId}`);
        await client.sendHtmlNotice(roomId, "Hello! To get started using policyserv, say <code>!policyserv community &lt;community name&gt;</code>. For more information, say <code>!policyserv help</code>.<br/><br/><b>Note</b>: This bot will be replaced with a web interface in the future. Monitor the <a href='https://matrix.org/blog/'>matrix.org blog</a> for updates.");
    });

    client.on("room.message", async (roomId: string, event: any) => {
        if (event.sender === await client.getUserId()) {
            return; // ignore ourselves
        }
        if (event.type !== "m.room.message") {
            return;
        }
        const textEvent = new MatrixEvent<TextualMessageEventContent>(event);
        if (textEvent.content.msgtype !== "m.text" || !textEvent.content.body) {
            return;
        }

        if (textEvent.content.body.toLowerCase().startsWith("!policyserv ")) {
            const args = textEvent.content.body.substring("!policyserv ".length).split(" ");
            if (args[0] === "help") {
                await client.replyHtmlNotice(roomId, event,
                    "This bot is used to manage a community's policyserv settings. <br/>" +
                    "All commands require a community to exist first. To do so, say <code>!policyserv community &lt;community name&gt;</code>.<br/>" +
                    "Afterwards, the following commands will be available:<br/>" +
                    "TODO" // TODO: Specify commands as they exist in future PRs
                );
            } else if (args[0] === "community") {
                if (!!storageProvider.readValue(`room:${roomId}`)) {
                    await client.replyHtmlNotice(roomId, event, "❌ This room is already associated with a community.");
                    return;
                }

                if (args.length < 2) {
                    await client.replyHtmlNotice(roomId, event, "Please specify a community name.");
                    return
                }
                const communityName = args.slice(1).join(" ");

                // Give some indication that the bot saw the command ahead of doing the work
                const reactionEventId = await client.unstableApis.addReactionToEvent(roomId, event.event_id, "👀");
                try {
                    const communityId = await policyservApi.createCommunity(communityName);
                    storageProvider.storeValue(`room:${roomId}`, JSON.stringify({id: communityId}));
                    // noinspection ES6MissingAwait - we aren't concerned if this fails
                    client.redactEvent(roomId, reactionEventId);
                    await client.replyHtmlNotice(roomId, event, "✅ Community created! Anyone in this room will now be able to manage this community, including applying to add rooms and adjusting filters. To add your first room, say <code>TODO: The Command</code>.");
                    await client.sendHtmlNotice(safetyTeamRoomId, `A new community has been created by <code>${event.sender}</code>: <code>${escapeHtml(communityName)}</code> (<code>${communityId}</code> | <code>${roomId}</code>).`);
                } catch (e) {
                    console.error(e);
                    // noinspection ES6MissingAwait - we aren't concerned if this fails
                    client.redactEvent(roomId, reactionEventId);
                    await client.replyHtmlNotice(roomId, event, "❌ Failed to create community. This could be because the name is too short or long, or because there is a temporary server error. Please try again later.");
                }

            }
        }
    });

    await client.start();
    console.log("Started!");
})();



