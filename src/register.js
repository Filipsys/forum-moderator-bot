// import { INVITE_COMMAND } from "./commands.js";
import fetch from "node-fetch";

const INVITE_COMMAND = {
  name: "invite",
  description: "Get an invite link to add the bot to your server",
};

/**
 * This file is meant to be run from the command line, and is not used by the
 * application server. It's allowed to use node.js primitives, and only needs
 * to be run once.
 */

const token = process.env.DISCORD_TOKEN;
const applicationId = process.env.DISCORD_APPLICATION_ID;

if (!token) {
  throw new Error("The DISCORD_TOKEN environment variable is required.");
}

if (!applicationId) {
  throw new Error(
    "The DISCORD_APPLICATION_ID environment variable is required."
  );
}

async function registerCommands() {
  const url = `https://discord.com/api/v10/applications/${applicationId}/commands`;

  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${token}`,
    },
    method: "PUT",
    body: JSON.stringify([INVITE_COMMAND]),
  });

  if (response.ok) {
    console.log("Registered all commands");
  } else {
    console.error("Error registering commands");

    const text = await response.text();
    console.error(text);
  }
  return response;
}

await registerCommands();
