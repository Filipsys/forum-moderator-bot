import { verifyKey } from "discord-interactions";
// import { Buffer } from "buffer";
// import { INVITE_COMMAND } from "./commands";
// import nacl from "tweetnacl"

import { InteractionResponseType, InteractionType } from "discord-interactions";

// class JSONResponse extends Response {
// 	constructor(body, init = { headers: { "content-type": "application/json;charset=utf-8" }}) {
// 		const JSONBody = JSON.stringify(body);

// 		super(JSONBody, init);
// 	}
// }

// export default {
// 	async fetch(request, env, ctx): Promise<Response> {
// 		// if (request.method === "POST") {
// 		// 	const req = await request.json()
	
// 		// 	const signature = request.headers.get("x-signature-ed25519") as string;
// 		// 	const timestamp = request.headers.get("x-signature-timestamp") as string;
	
// 		// 	if (signature && timestamp) {
// 		// 		const isVerified = nacl.sign.detached.verify(
// 		// 			Buffer.from(timestamp + JSON.stringify(req)),
// 		// 			Buffer.from(signature, "hex"),
// 		// 			Buffer.from(env.DISCORD_PUBLIC_KEY, "hex"),
// 		// 		);
	
// 		// 		return new Response(JSON.stringify(req), { status: isVerified ? 200 : 401 });
// 		// 	}
// 		// }

// 		const signature = request.headers.get("x-signature-ed25519") as string;
// 		const timestamp = request.headers.get("x-signature-timestamp") as string;
// 		const body = await request.clone().arrayBuffer();

// 		const isValidRequest = verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY as string);
// 		if (!isValidRequest) return new Response(JSON.stringify(request), { status: 401 });

// 		const message = (await request.json());

// 		if (message.type === InteractionType.PING)
// 			return new JSONResponse({ type: InteractionResponseType.PONG });

// 		if (message.type === InteractionType.APPLICATION_COMMAND) {
// 			return new JSONResponse({ type: InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE, data: { content: "Invite link!" }});
// 		}

// 		return new JSONResponse({ type: 4, data: { content: "Not found!" }});
// 	},
// } satisfies ExportedHandler<Env>;


export class DiscordGateway {
	constructor(state, env) {
		this.state = state;
		this.env = env;
		this.webSocket = null;
		this.heartbeatInterval = null;
		this.sequence = null;
	}

	async connect() {
		if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
			console.log("Websocket already open");
			return;
		}

		console.log("Attempting to connect to the Discord gateway");

		const gatewayBotResponse = await fetch("https://discord.com/api/v10/gateway/bot", {
			headers: { "Authorization": `Bot ${this.env.DISCORD_TOKEN}` }
		});

		if (!gatewayBotResponse.ok) {
			console.log("Failed to get gateway URL:", await gatewayBotResponse.text());
			return;
		}

		const gatewayData = await gatewayBotResponse.json();
		if (!gatewayData) {
			console.log("Gateway data not found");
			return;
		}

		const gatewayURL = `${gatewayData.url}/?v=10&encoding=json`;

		this.webSocket = new WebSocket(gatewayURL);

		this.webSocket.addEventListener("open", (event) => {
			console.log("WebSocket connection established.");
		})

		this.webSocket.addEventListener("message", (event) => {
      this.handleGatewayMessage(event.data);
    });

		this.webSocket.addEventListener("close", (event) => {
			console.warn(`WebSocket closed: Code=${event.code}, Reason=${event.reason}`);
			clearInterval(this.heartbeatInterval);
			this.webSocket = null;

			setTimeout(() => this.connect(), 5000);
		});

		this.webSocket.addEventListener("error", (event) => {
			console.error("Websocket error: ", event);
		})
	}

	async handleGatewayMessage(data) {
		const payload = JSON.parse(data);
		const { op, d, s, t } = payload; // Opcode, data, sequence, event name

		if (s) this.sequence = s;

		switch (op) {
			case 10:
				console.log("Recieved HELLO, starting heartbeat");

				const { heartbeat_interval } = d;
				this.startHeartbeat(heartbeat_interval);
				this.identify();
				break;
			
			case 11:
				console.log("Heartbeat ACK recieved");
				break;
			
			case 0:
				console.log(`Received event: ${t}`);
				this.sequence = s;

				if (t === "READY") {
					console.log(`Bot Ready! Session ID: ${d.session_id}`);

					// await this.state.storage.put("session_id", d.session_id);
					// await this.state.storage.put("resume_gateway_url", d.resume_gateway_url);
				} else if (t === "MESSAGE_CREATE") {
					console.log("Received MESSAGE_CREATE event (onmessage)");

					// d contains the message object: d.author.username, d.content, d.channel_id etc
					if (d.content === "$ping" && !d.author.bot) {
						await this.sendMessage(d.channel_id, "Pong!");
          }
				}
				break;

			case 7:
				console.log("Discord requested reconnect. Closing and reconnecting");
				this.webSocket.close(4000, "Reconnect requested by Discord");
				break;

			case 9:
				console.warn("Invalid session");
				this.webSocket.close(4000, "Invalid session");
				break;

			default:
				console.log(`Received unhandled opcode: ${op}`);
		}
	}

	identify() {
		const identifyPayload = {
			op: 2,
			d: {
				token: this.env.DISCORD_TOKEN,
				intents: 1 << 9 | 1 << 15,
				properties: {
					$os: "linux",
					$browser: "cloudflare-worker",
					$device: "cloudflare-worker",
				},
			},
		};

		console.log("Sending IDENTIFY payload.");
		this.webSocket.send(JSON.stringify(identifyPayload));
	}

	startHeartbeat(interval) {
		console.log(`Starting heartbeat every ${interval}ms`);

		if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);

		this.heartbeatInterval = setInterval(() => {
      if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
        console.log("Sending heartbeat.");

        this.webSocket.send(JSON.stringify({ op: 1, d: this.sequence }));
      } else {
         console.warn("WebSocket not open, stopping heartbeat.");

         clearInterval(this.heartbeatInterval);
         this.heartbeatInterval = null;
      }
    }, interval);

		setTimeout(() => {
			if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
				console.log("Sending initial heartbeat.");
				
				this.webSocket.send(JSON.stringify({ op: 1, d: this.sequence }));
			}
		}, interval * Math.random());
	}

	async sendMessage(channelId: number, content: string) {
		const url = `https://discord.com/api/v10/channels/${channelId}/messages`;

		try {
				const response = await fetch(url, {
					method: "POST",
					headers: {
						"Authorization": `Bot ${this.env.DISCORD_TOKEN}`,
						"Content-Type": "application/json"
					},
					body: JSON.stringify({ content: content })
				});

				if (!response.ok) {
					console.error(`Failed to send message: ${response.status}`, await response.json());
				} else {
					console.log("Message sent successfully.");
				}
		} catch (error) {
			console.error("Error sending message:", error);
		}
	}

	async fetch(request) {
		await this.connect();

		return new Response("Durable Object is running. WebSocket managed internally.", { status: 200 });
	}
}

export default {
	async fetch(request: Request, env: Env, ctx) {
		let id = env.DISCORD_GATEWAY.idFromName("discord-gateway-singleton");
		let stub = env.DISCORD_GATEWAY.get(id);

		return await stub.fetch(request);
  }
}