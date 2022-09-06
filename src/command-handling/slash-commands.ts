/*************************************************************************
 * This file defines the structure of the slash commands
 * .setName is the name of the command as it appears on Discord
 * options are the arguments of the command
 * .setRequired defines where the argument is required or not
 * Adopted from original BOB v3 by Noah & Kaoushik
 *************************************************************************/

import { SlashCommandBuilder } from "@discordjs/builders";
import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v9";
import { Guild } from "discord.js";
import { FgMagenta, ResetColor } from "../utils/command-line-colors";

const queueCommand = new SlashCommandBuilder() // /queue
    .setName("queue")
    .setDescription("Add or remove queue channels to the server (admin only)")
    .addSubcommand((subcommand) =>
        subcommand // /queue add [queue_name]
            .setName("add")
            .setDescription("Create a new queue channel")
            .addStringOption((option) =>
                option
                    .setName("queue_name")
                    .setDescription("The name of the queue to create")
                    .setRequired(true)
            )
    )
    .addSubcommand((subcommand) =>
        subcommand // /queue remove [queue_name]
            .setName("remove")
            .setDescription("Remove an existing queue")
            .addChannelOption((option) =>
                option
                    .setName("queue_name")
                    .setDescription("The name of the queue to remove")
                    .setRequired(true)
            )
    );

const enqueueCommand = new SlashCommandBuilder() // /enqueue [queue_name] (user)
    .setName("enqueue")
    .setDescription("Enter a help queue")
    .addChannelOption((option) =>
        option
            .setName("queue_name")
            .setDescription("The queue you want to wait on")
            .setRequired(false)
    )
    .addUserOption((option) =>
        option
            .setName("user")
            .setDescription("The user to add to the queue (staff only).")
            .setRequired(false)
    );

const dequeueCommand = new SlashCommandBuilder() // /next (queue_name) (user)
    .setName("next")
    .setDescription(
        "Bring in the next student to help from any of your queues (FIFO)"
    )
    .addChannelOption((option) =>
        option
            .setName("queue_name")
            .setDescription("The queue to dequeue from")
            .setRequired(false)
    )
    .addUserOption((option) =>
        option
            .setName("user")
            .setDescription("A user to dequeue")
            .setRequired(false)
    );

const startCommand = new SlashCommandBuilder() // /start (mute_notif)
    .setName("start")
    .setDescription("Start helping students")
    .addBooleanOption((option) =>
        option
            .setName("mute_notif")
            .setDescription(
                "Set to true if you do not want to ping those who have enabled notifications. Default: False"
            )
            .setRequired(false)
    );

const stopCommand = new SlashCommandBuilder() // /stop
    .setName("stop")
    .setDescription("Stop helping students");

const leaveCommand = new SlashCommandBuilder() // /leave
    .setName("leave")
    .setDescription("Leave your current queue")
    .addChannelOption((option) =>
        option
            .setName("queue_name")
            .setDescription("The queue to leave from")
            .setRequired(false)
    );

const clearCommand = new SlashCommandBuilder() // /clear (queue_name) (all)
    .setName("clear")
    .setDescription("Clear all of the waiting students from a queue.")
    .addChannelOption((option) =>
        option
            .setName("queue_name")
            .setDescription("The queue to clear")
            .setRequired(true)
    )
    .addBooleanOption((option) =>
        option
            .setName("all")
            .setDescription("Clear all queues?")
            .setRequired(false)
    );

const announceCommand = new SlashCommandBuilder() // /announce [message] (queue_name)
    .setName("announce")
    .setDescription(
        "Announce a message to all of the waiting students in a queue."
    )
    .addStringOption((option) =>
        option
            .setName("message")
            .setDescription("The message to announce")
            .setRequired(true)
    )
    .addChannelOption((option) =>
        option
            .setName("queue_name")
            .setDescription(
                "The queue to announce in, or all queues if none is specified"
            )
            .setRequired(false)
    );

const listHelpersCommand = new SlashCommandBuilder() // /list_helpers
    .setName("list_helpers")
    .setDescription("See who is online and helping.");

const cleanupQueue = new SlashCommandBuilder()
    .setName("cleanup")
    .setDescription(
        "Debug feature: Forces updates of embed in all #queue channels"
    )
    .addChannelOption((option) =>
        option
            .setName("queue_name")
            .setDescription("The queue to clean")
            .setRequired(true)
    );

const cleanupHelpChannelCommand = new SlashCommandBuilder()
    .setName("cleanup_help_ch")
    .setDescription(
        "Debug feature: Force updates the command help channels"
    );

// Get the raw data that can be sent to Discord
const commandData = [
    queueCommand.toJSON(),
    enqueueCommand.toJSON(),
    dequeueCommand.toJSON(),
    startCommand.toJSON(),
    stopCommand.toJSON(),
    leaveCommand.toJSON(),
    clearCommand.toJSON(),
    listHelpersCommand.toJSON(),
    announceCommand.toJSON(),
    cleanupQueue.toJSON(),
    cleanupHelpChannelCommand.toJSON()
];

async function postSlashCommands(guild: Guild, externalCommands: CommandData = []): Promise<void> {
    if (process.env.YABOB_APP_ID === undefined) {
        throw new Error('Failed to post commands. APP_ID is undefined');
    }
    if (process.env.YABOB_BOT_TOKEN === undefined) {
        throw new Error('Failed to post commands. BOT_TOKEN is undefined');
    }
    const rest = new REST({ version: "9" }).setToken(
        process.env.YABOB_BOT_TOKEN
    );
    await rest.put(Routes.applicationGuildCommands(
        process.env.YABOB_APP_ID,
        guild.id),
        { body: commandData.concat(externalCommands) }
    ).catch(e => console.error(e));
    console.log(`${FgMagenta}✓ Updated slash commands on '${guild.name}' ✓${ResetColor}`);
}

type CommandData = typeof commandData;

export { postSlashCommands, CommandData };