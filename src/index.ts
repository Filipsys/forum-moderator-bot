/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { verifyKey } from "discord-interactions";
import { INVITE_COMMAND } from "./commands";

import { InteractionResponseType, InteractionType } from "discord-interactions";

class JSONResponse extends Response {
	constructor(body, init = { headers: { "content-type": "application/json;charset=utf-8" }}) {
		const JSONBody = JSON.stringify(body);

		super(JSONBody, init);
	}
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const signature = request.headers.get("x-signature-ed25519") as string;
		const timestamp = request.headers.get("x-signature-timestamp") as string;
		const body = await request.clone().arrayBuffer();

		const isValidRequest = verifyKey(body, signature, timestamp, process.env.DISCORD_PUBLIC_KEY as string);
		if (!isValidRequest) return new Response("The request signature is not valid", { status: 401 });

		const message = (await request.json());

		if (message.type === InteractionType.PING) return new JSONResponse({ type: InteractionResponseType.PONG });

		if (message.type !== InteractionType.APPLICATION_COMMAND) {
			switch (message.data.name.toLowerCase()) {
				case INVITE_COMMAND.name.toLowerCase():
					return new JSONResponse({ type: 4, data: { content: "Invite link!" }});
			}
		}
		return new Response("Not found!");
	},
} satisfies ExportedHandler<Env>;
