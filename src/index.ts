import {
    AutojoinRoomsMixin,
    MatrixAuth,
    MatrixClient,
    MatrixEvent, Permalinks, RustSdkCryptoStorageProvider,
    SimpleFsStorageProvider, TextualMessageEventContent
} from "@vector-im/matrix-bot-sdk";
import * as path from "node:path";
import {CommunityConfig, ConfigDescriptions, PolicyservApi} from "./policyserv_api";

const escapeHtml = require("escape-html");

const userId = process.env.USER_ID;
const password = process.env.PASSWORD;
const homeserverUrl = process.env.HOMESERVER_URL;
const safetyTeamRoomId = process.env.SAFETY_TEAM_ROOM_ID;
const storagePath = process.env.STORAGE_PATH || "bot";
const policyservBaseUrl = process.env.POLICYSERV_BASE_URL;
const policyservApiKey = process.env.POLICYSERV_API_KEY;
const policyservServerName = process.env.POLICYSERV_SERVER_NAME;
const appealDirections = process.env.APPEAL_DIRECTIONS || "To appeal this decision, please email abuse@matrix.org";

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
requireVariable(policyservServerName, "POLICYSERV_SERVER_NAME");

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
        const joinRules = await client.getRoomStateEventContent(roomId, "m.room.join_rules", "");
        if (joinRules["join_rule"] === "public") {
            return; // don't send welcome messages to public rooms
        }
        await client.sendHtmlNotice(roomId, "Hello! To get started using policyserv, say <code>!policyserv community &lt;community name&gt;</code>. For more information, say <code>!policyserv help</code>.<br/><br/><b>Note</b>: This bot will be replaced with a web interface in the future. Monitor the <a href='https://matrix.org/blog/'>matrix.org blog</a> for updates.");
    });

    client.on("room.event", async (roomId: string, event: any) => {
        if (event.sender === await client.getUserId()) {
            return; // ignore ourselves
        }
        if (event.type !== "m.reaction" || roomId !== safetyTeamRoomId) {
            return;
        }
        if (!["✅", "❌"].includes(event.content["m.relates_to"]["key"])) {
            return;
        }

        // Note: technically, it's possible for an application to be accepted twice, or denied then accepted, or other
        // similar variations. We don't really handle this because it may be useful to have a way to correct mistakes.
        // Though, it'll be confusing for the community receiving notifications of this happening.

        const originalEvent = (await client.getEvent(roomId, event.content["m.relates_to"]["event_id"])) as any; // XXX: the bot-sdk types are wrong
        const policyservData = originalEvent.content["org.matrix.policyserv"];
        if (!policyservData) {
            return;
        }

        // Note: we don't remove the application from the storageProvider because:
        // 1. The storage provider doesn't have a delete function
        // 2. For denials, we don't want to immediately get a new application
        // Appeals are handled by humans who can override the bot's stored state

        const approved = event.content["m.relates_to"]["key"] === "✅";
        if (!approved) {
            await client.sendHtmlNotice(policyservData["community_room_id"], `The application for the room <code>${escapeHtml(policyservData["room_id"])}</code> to join this community has been <b>denied</b>. ${appealDirections}`);
        } else {
            // Try to set the policy server state event ourselves, but warn the community if it went poorly
            try {
                await client.sendStateEvent(policyservData["room_id"], "org.matrix.msc4284.policy", "", {
                    "via": policyservServerName,
                    // TODO: Also include signing key (if applicable)
                });
            } catch (e) {
                console.error(e);
                await client.sendHtmlNotice(policyservData["community_room_id"], `⚠️ The bot was unable to set the policy server configuration in <code>${escapeHtml(policyservData["room_id"])}</code>. It will have to be done manually. The server name for this room should be <code>${policyservServerName}</code>`);
            }

            try {
                // Actually approve the room
                await policyservApi.addRoom(policyservData["room_id"], policyservData["community_id"]);

                // Send the notice
                await client.sendHtmlNotice(policyservData["community_room_id"], `The application for the room <code>${escapeHtml(policyservData["room_id"])}</code> to join this community has been <b>approved</b>! The room will now be protected by policyserv.`);
            } catch (e) {
                const ref = Date.now();
                console.error("REF:" + ref, e);
                await client.sendHtmlNotice(roomId, `There was an error while trying to approve the application for the room <code>${escapeHtml(policyservData["room_id"])}</code> to join the community. Search the logs for ${ref} to see the error.`);
            }
        }

        // Add a reaction to the original event to indicate that we've processed the application
        // Ideally we'd also remove our other reactions, but those seem weirdly difficult to get at, so we just leave them there
        try {
            await client.unstableApis.addReactionToEvent(roomId, originalEvent.event_id, approved ? "🚀" : "🙈"); // a different emoji to indicate 'done'
        } catch (e) {
            // non-fatal, just log it
            console.error(e);
        }
    });

    const commandPrefixes = ["!policyserv", "!ps"];
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

        try {
            const prefixUsed = commandPrefixes.find(p => textEvent.content.body.toLowerCase().startsWith(p));
            if (!!prefixUsed) {
                const args = textEvent.content.body.substring(prefixUsed.length).trim().split(" ");
                if (args[0] === "help") {
                    await client.replyHtmlNotice(roomId, event,
                        "This bot is used to manage a community's policyserv settings. <br/>" +
                        "All commands require a community to exist first. To do so, say <code>!policyserv community &lt;community name&gt;</code>.<br/>" +
                        "Afterwards, the following commands will be available:<br/><ul>" +
                        "<li><code>!policyserv apply &lt;room ID or alias&gt;</code> - Sends an application to the safety team to add the room to the community.</li>" +
                        "<li><code>!policyserv config</code> - Get the current configuration for the community.</li>" +
                        "<li><code>!policyserv get &lt;config key&gt;</code> - Get a specific configuration value.</li>" +
                        "<li><code>!policyserv set &lt;config key&gt; &lt;value&gt;</code> - Set a configuration value.</li>" +
                        "</ul>"
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
                        // Verify the room is private
                        const joinRules = await client.getRoomStateEventContent(roomId, "m.room.join_rules", "");
                        if (joinRules["join_rule"] === "public") {
                            // noinspection ES6MissingAwait - we aren't concerned if this fails
                            client.redactEvent(roomId, reactionEventId);
                            await client.replyHtmlNotice(roomId, event, "❌ This room is public and cannot be used as a community management room.");
                            return;
                        }

                        const communityId = await policyservApi.createCommunity(communityName);
                        storageProvider.storeValue(`room:${roomId}`, JSON.stringify({id: communityId}));
                        // noinspection ES6MissingAwait - we aren't concerned if this fails
                        client.redactEvent(roomId, reactionEventId);
                        await client.replyHtmlNotice(roomId, event, "✅ Community created! Anyone in this room will now be able to manage this community, including applying to add rooms and adjusting filters. To add your first room, say <code>!policyserv apply &lt;room ID or alias&gt;</code>.");
                        await client.sendHtmlNotice(safetyTeamRoomId, `A new community has been created by <code>${event.sender}</code>: <code>${escapeHtml(communityName)}</code> (<code>${communityId}</code> | <code>${roomId}</code>).`);
                    } catch (e) {
                        console.error(e);
                        // noinspection ES6MissingAwait - we aren't concerned if this fails
                        client.redactEvent(roomId, reactionEventId);
                        await client.replyHtmlNotice(roomId, event, "❌ Failed to create community. This could be because the name is too short or long, or because there is a temporary server error. Please try again later.");
                    }
                } else {
                    // We just assume that all other commands require a community to exist first
                    const communityConfig = JSON.parse(storageProvider.readValue(`room:${roomId}`) ?? "{}");
                    if (!communityConfig.id) {
                        await client.replyHtmlNotice(roomId, event, "❌ This room is not associated with a community. Create a community first with <code>!policyserv community &lt;community name&gt;</code>.");
                        return;
                    }

                    if (args[0] === "apply") {
                        if (args.length < 2) {
                            await client.replyHtmlNotice(roomId, event, "Please specify a room ID or alias.");
                            return;
                        }

                        const reactionEventId = await client.unstableApis.addReactionToEvent(roomId, event.event_id, "👀");

                        try {
                            // Resolve and join the room to inspect details of it (name, power levels, etc)
                            let roomIdOrAlias = args[1];
                            let vias = args.slice(2);
                            if (roomIdOrAlias.startsWith("https://matrix.to") || roomIdOrAlias.startsWith("matrix:")) {
                                const parsed = Permalinks.parseUrl(roomIdOrAlias);
                                roomIdOrAlias = parsed.roomIdOrAlias;
                                vias = parsed.viaServers;
                            }
                            const joinRoomId = await client.resolveRoom(roomIdOrAlias);
                            await client.joinRoom(joinRoomId, ["matrix.org", ...vias]); // always append matrix.org to have a higher chance at joining

                            // Verify the room is public
                            const state = await client.getRoomState(joinRoomId);
                            const joinRules = state.find(e => e.type === "m.room.join_rules" && e.state_key === "");
                            if (joinRules?.content?.["join_rule"] !== "public") {
                                // noinspection ES6MissingAwait - we aren't concerned if this fails
                                client.redactEvent(roomId, reactionEventId);
                                // await client.leaveRoom(joinRoomId); // we should probably leave the room, but then we might get tricked into leaving rooms we're not supposed to
                                await client.replyHtmlNotice(roomId, event, "❌ That room is not public and cannot be added to a community.");
                                return;
                            }

                            // Check to see if policyserv already knows about the room, or if we already have an application pending for it
                            const room = await policyservApi.getRoom(joinRoomId);
                            const application = storageProvider.readValue(`application:${joinRoomId}`);
                            if (!!room || !!application) {
                                // noinspection ES6MissingAwait - we aren't concerned if this fails
                                client.redactEvent(roomId, reactionEventId);
                                await client.replyHtmlNotice(roomId, event, "❌ That room is already protected by policyserv or has a pending application.");
                                return;
                            }

                            // Prepare an application
                            const community = await policyservApi.getCommunity(communityConfig.id);
                            const roomName = state.find(e => e.type === "m.room.name" && e.state_key === "")?.content?.name ?? "__UNNAMED ROOM__";
                            const roomTopic = state.find(e => e.type === "m.room.topic" && e.state_key === "")?.content?.topic ?? "__NO TOPIC__";
                            const noticeEventId = await client.sendMessage(safetyTeamRoomId, {
                                msgtype: "m.notice",
                                body: `A new application has been submitted by \`${event.sender}\` for the room \`${joinRoomId}\` to join the community "${community.name}" (\`${communityConfig.id}\`). React with ✅ to approve and ❌ to deny.\n\nDetails:\n* Name: ${roomName}\n* Topic: ${roomTopic}`,
                                format: "org.matrix.custom.html",
                                formatted_body: `A new application has been submitted by <code>${escapeHtml(event.sender)}</code> for the room <code>${escapeHtml(joinRoomId)}</code> to join the community "${escapeHtml(community.name)}" (<code>${escapeHtml(communityConfig.id)}</code>). React with ✅ to approve and ❌ to deny.<br/><br/>Details:<ul><li>Name: ${escapeHtml(roomName)}</li><li>Topic: ${escapeHtml(roomTopic)}</li></ul>`,

                                // We'll pick up these details later when the application is approved or denied
                                "org.matrix.policyserv": {
                                    community_id: communityConfig.id,
                                    community_room_id: roomId,
                                    room_id: joinRoomId,
                                },
                            });
                            // add the template reactions for ease of use
                            await client.unstableApis.addReactionToEvent(safetyTeamRoomId, noticeEventId, "✅");
                            await client.unstableApis.addReactionToEvent(safetyTeamRoomId, noticeEventId, "❌");
                            storageProvider.storeValue(`application:${joinRoomId}`, communityConfig.id);

                            // Notify the community that the application has been submitted
                            // noinspection ES6MissingAwait - we aren't concerned if this fails
                            client.redactEvent(roomId, reactionEventId);
                            await client.replyNotice(roomId, event, `An application has been submitted and will be reviewed by the safety team. You will be notified when the application is approved or denied. Please ensure this bot has permission to send state events in the room to make setup easier if approved.`);
                        } catch (e) {
                            console.error(e);
                            // noinspection ES6MissingAwait - we aren't concerned if this fails
                            client.redactEvent(roomId, reactionEventId);
                            await client.replyHtmlNotice(roomId, event, "❌ Failed to submit application for the room to join the community. Ensure the bot can join and try again later.");
                        }
                    } else if (args[0] === "config" || args[0] === "get") {
                        const reactionEventId = await client.unstableApis.addReactionToEvent(roomId, event.event_id, "👀");
                        const community = await policyservApi.getCommunity(communityConfig.id);
                        const instanceConfig = await policyservApi.getInstanceCommunityConfig();
                        let keys = Object.keys(instanceConfig); // we use the instance config to ensure we show all available options to the user
                        if (args[0] === "get") {
                            if (!ConfigDescriptions[args[1]]) {
                                // noinspection ES6MissingAwait - we aren't concerned if this fails
                                client.redactEvent(roomId, reactionEventId);
                                await client.replyHtmlNotice(roomId, event, "❌ Unknown configuration key. Say <code>!policyserv config</code> for a list of available keys and their values.");
                                return;
                            }
                            keys = [ConfigDescriptions[args[1]].property];
                        }
                        let html = `<b>Note:</b> Instance defaults may change at any time without notice. Set specific values to override these defaults.<br/><br/>`;
                        for (const key of keys) {
                            html += renderConfigVal(key as keyof CommunityConfig, community.config, instanceConfig);
                        }
                        // noinspection ES6MissingAwait - we aren't concerned if this fails
                        client.redactEvent(roomId, reactionEventId);
                        await client.replyHtmlNotice(roomId, event, html);
                    } else if (args[0] === "set") {
                        const key = args[1];
                        let val: any = args.slice(2).join(" ");
                        const desc = ConfigDescriptions[key];
                        if (!desc) {
                            await client.replyHtmlNotice(roomId, event, "❌ Unknown configuration key. Say <code>!policyserv config</code> for a list of available keys and their values.");
                            return;
                        }
                        const reactionEventId = await client.unstableApis.addReactionToEvent(roomId, event.event_id, "👀");
                        try {
                            if (!!desc.transformFn) {
                                val = desc.transformFn(val);
                            }
                            const currentConfig = (await policyservApi.getCommunity(communityConfig.id)).config;
                            // @ts-ignore - TS doesn't know that the key exists
                            currentConfig[desc.property] = val;
                            await policyservApi.setCommunityConfig(communityConfig.id, currentConfig)
                        } catch (e) {
                            console.error(e);
                            // noinspection ES6MissingAwait - we aren't concerned if this fails
                            client.redactEvent(roomId, reactionEventId);
                            await client.replyHtmlNotice(roomId, event, "❌ There was an error saving your configuration. Please verify that the value is of the correct type or try again later.");
                            return;
                        }
                        // noinspection ES6MissingAwait - we aren't concerned if this fails
                        client.redactEvent(roomId, reactionEventId);
                        await client.replyHtmlNotice(roomId, event, "✅ Configuration saved! It may take a few minutes for the changes to take effect.");
                    } else {
                        await client.replyHtmlNotice(roomId, event, "❌ Unknown command. Say <code>!policyserv help</code> for a list of available commands.");
                        return;
                    }
                }
            }
        } catch (e) {
            console.error(e);
            await client.replyHtmlNotice(roomId, event, "❌ There was an error processing your command. Please try again later.");
            return;
        }
    });

    await client.start();
    console.log("Started!");
})();

function renderConfigVal(key: keyof CommunityConfig, vals: CommunityConfig, defaults: CommunityConfig): string {
    const [name, description] = Object.entries(ConfigDescriptions).find(([name, desc]) => desc.property === key) ?? [null, null];
    if (!name) {
        return ""; // unrenderable, or at least not something we expect to show to the user
    }

    // Ideally we'd use a table, but not all clients support that :(
    return `<b><code>${name}</code></b>: ${vals[key] != undefined ? `<code>${escapeHtml(vals[key])}</code>` : "use instance default"}<br/>Instance default: ${defaults[key] != undefined ? `<code>${escapeHtml(defaults[key])}</code>` : "not set (disabled)"}<br/><i>${description.description}</i><br/><br/>`;
}
