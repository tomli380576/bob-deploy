/** @module BuiltInHandlers */

import {
    ChannelType,
    ChatInputCommandInteraction,
    GuildMember,
    TextChannel
} from 'discord.js';
import {
    EmbedColor,
    SimpleEmbed,
    ErrorEmbed,
    SlashCommandLogEmbed,
    ErrorLogEmbed
} from '../utils/embed-helper';
import { CommandParseError } from '../utils/error-types';
import {
    isTriggeredByUserWithRoles,
    hasValidQueueArgument,
    isFromGuildMember,
    isTriggeredByUserWithRolesSync,
    isServerInteraction
} from './common-validations';
import { convertMsToTime, logSlashCommand } from '../utils/util-functions';
// @ts-expect-error the ascii table lib has no type
import { AsciiTable3, AlignmentEnum } from 'ascii-table3';
import { CommandCallback, Optional } from '../utils/type-aliases';
import { adminCommandHelpMessages } from '../../help-channel-messages/AdminCommands';
import { helperCommandHelpMessages } from '../../help-channel-messages/HelperCommands';
import { studentCommandHelpMessages } from '../../help-channel-messages/StudentCommands';
import { afterSessionMessageModal, queueAutoClearModal } from './modal-objects';
import { ExpectedParseErrors } from './expected-interaction-errors';
import { SuccessMessages } from './builtin-success-messages';

/**
 * Responsible for preprocessing commands and dispatching them to servers
 * ----
 * Each YABOB instance should only have 1 BuiltInCommandHandler
 * All the functions below follows this convention:
 * - private async <corresponding command name>(interaction): Promise<string>
 * @category Handler Classes
 * @param interaction the raw interaction
 * @throws CommandParseError: if command doesn't satify the checks in Promise.all
 * @throws QueueError or ServerError: if the target HelpQueueV2 or AttendingServer rejects
 */
class BuiltInCommandHandler {
    /**
     * The map of available commands
     * Key is what the user will see, value is the arrow function
     * - arrow function wrapper is required because of the closure of 'this'
     * - undefined return values is when the method wants to reply to the interaction directly
     * - If a call returns undefined, processCommand won't edit the reply
     */
    private methodMap: { [commandName: string]: CommandCallback } = {
        announce: this.announce,
        cleanup_queue: this.cleanup,
        cleanup_all: this.cleanupAllQueues,
        cleanup_help_channels: this.cleanupHelpChannel,
        clear: this.clear,
        clear_all: this.clearAll,
        enqueue: this.enqueue,
        leave: this.leave,
        list_helpers: this.listHelpers,
        next: this.next,
        queue: this.queue,
        start: this.start,
        stop: this.stop,
        help: this.help,
        set_logging_channel: this.setLoggingChannel,
        stop_logging: this.stopLogging,
        set_after_session_msg: this.showAfterSessionMessageModal,
        set_queue_auto_clear: this.showQueueAutoClearModal,
        serious_mode: this.setSeriousMode
    } as const;

    /**
     * Commands in this set only shows a modal on ChatInputCommandInteraction
     * Actual changes to attendingServers happens on modal submit
     * - See modal-handler.ts
     */
    private showModalOnlyCommands = new Set<string>([
        'set_after_session_msg',
        'set_queue_auto_clear'
    ] as const);

    canHandle(interaction: ChatInputCommandInteraction): boolean {
        return interaction.commandName in this.methodMap;
    }

    /**
     * Main processor for command interactions
     * @param interaction the raw interaction from discord js
     */
    async process(interaction: ChatInputCommandInteraction): Promise<void> {
        const server = isServerInteraction(interaction);
        const commandMethod = this.methodMap[interaction.commandName];
        if (!this.showModalOnlyCommands.has(interaction.commandName)) {
            // Immediately reply to show that YABOB has received the interaction
            // non modal commands only
            await interaction.reply({
                ...SimpleEmbed(
                    `Processing command \`${interaction.commandName}\` ...`,
                    EmbedColor.Neutral
                ),
                ephemeral: true
            });
        }
        logSlashCommand(interaction);
        await commandMethod?.(interaction)
            // shorthand syntax, if successMsg is undefined, don't run the rhs
            .then(async successMsg => {
                await Promise.all<unknown>([
                    successMsg &&
                        interaction.editReply(
                            SimpleEmbed(successMsg, EmbedColor.Success)
                        ),
                    server.sendLogMessage(SlashCommandLogEmbed(interaction))
                ]);
            })
            .catch(async err => {
                // Central error handling, reply to user with the error
                await Promise.all([
                    // if not replied (when using modals), reply
                    interaction.replied
                        ? interaction.editReply(ErrorEmbed(err))
                        : interaction.reply({ ...ErrorEmbed(err), ephemeral: true }),
                    server.sendLogMessage(ErrorLogEmbed(err, interaction))
                ]);
            });
    }

    private async queue(interaction: ChatInputCommandInteraction): Promise<string> {
        const [server] = [
            isServerInteraction(interaction),
            await isTriggeredByUserWithRoles(
                interaction,
                `queue ${interaction.options.getSubcommand()}`,
                ['Bot Admin']
            )
        ];
        const subcommand = interaction.options.getSubcommand();
        switch (subcommand) {
            case 'add': {
                const queueName = interaction.options.getString('queue_name', true);
                await server.createQueue(queueName);
                return SuccessMessages.createdQueue(queueName);
            }
            case 'remove': {
                const targetQueue = hasValidQueueArgument(interaction, true);
                if (!interaction.channel || interaction.channel.isDMBased()) {
                    throw ExpectedParseErrors.nonServerInterction();
                }
                if (interaction.channel.parentId === targetQueue.parentCategoryId) {
                    throw ExpectedParseErrors.removeInsideQueue;
                }
                await server?.deleteQueueById(targetQueue.parentCategoryId);
                return SuccessMessages.deletedQueue(targetQueue.queueName);
            }
            default: {
                throw new CommandParseError(`Invalid /queue subcommand ${subcommand}.`);
            }
        }
    }

    private async enqueue(interaction: ChatInputCommandInteraction): Promise<string> {
        const [server, queueChannel, member] = [
            isServerInteraction(interaction),
            hasValidQueueArgument(interaction),
            isFromGuildMember(interaction)
        ];
        await server.enqueueStudent(member, queueChannel);
        return SuccessMessages.joinedQueue(queueChannel.queueName);
    }

    private async next(interaction: ChatInputCommandInteraction): Promise<string> {
        const [server, helperMember] = [
            isServerInteraction(interaction),
            isTriggeredByUserWithRolesSync(interaction, 'next', ['Bot Admin', 'Staff'])
        ];
        const targetQueue =
            interaction.options.getChannel('queue_name', false) === null
                ? undefined
                : hasValidQueueArgument(interaction, true);
        const targetStudent = (interaction.options.getMember('user') ??
            undefined) as Optional<GuildMember>;
        // if either target queue or target student is specified, use dequeueWithArgs
        // otherwise use dequeueGlobalFirst
        const dequeuedStudent =
            targetQueue || targetStudent
                ? await server?.dequeueWithArgs(helperMember, targetStudent, targetQueue)
                : await server.dequeueGlobalFirst(helperMember);
        return SuccessMessages.inviteSent(dequeuedStudent?.member.displayName);
    }

    private async start(interaction: ChatInputCommandInteraction): Promise<string> {
        const [server, member] = [
            isServerInteraction(interaction),
            isTriggeredByUserWithRolesSync(interaction, 'start', ['Bot Admin', 'Staff'])
        ];
        const muteNotif = interaction.options.getBoolean('mute_notif') ?? false;
        await server.openAllOpenableQueues(member, !muteNotif);
        return SuccessMessages.startedHelping;
    }

    private async stop(interaction: ChatInputCommandInteraction): Promise<string> {
        const [server, member] = [
            isServerInteraction(interaction),
            isTriggeredByUserWithRolesSync(interaction, 'stop', ['Bot Admin', 'Staff'])
        ];
        // already checked in isServerInteraction
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const helpTimeEntry = await server.closeAllClosableQueues(member);
        return SuccessMessages.finishedHelping(helpTimeEntry);
    }

    private async leave(interaction: ChatInputCommandInteraction): Promise<string> {
        const [server, member, queue] = [
            isServerInteraction(interaction),
            isFromGuildMember(interaction),
            hasValidQueueArgument(interaction)
        ];
        await server.removeStudentFromQueue(member, queue);
        return SuccessMessages.leftQueue(queue.queueName);
    }

    private async clear(interaction: ChatInputCommandInteraction): Promise<string> {
        const [server, queue, member] = [
            isServerInteraction(interaction),
            hasValidQueueArgument(interaction, true),
            await isTriggeredByUserWithRoles(interaction, 'clear', ['Bot Admin', 'Staff'])
        ];
        // if they are not admin or doesn't have the queue role, reject
        if (
            !member.roles.cache.some(
                role => role.name === queue.queueName || role.name === 'Bot Admin'
            )
        ) {
            throw ExpectedParseErrors.noPermission.clear(queue.queueName);
        }
        await server.clearQueue(queue);
        return SuccessMessages.clearedQueue(queue.queueName);
    }

    private async clearAll(interaction: ChatInputCommandInteraction): Promise<string> {
        const [server] = [
            isServerInteraction(interaction),
            await isTriggeredByUserWithRoles(interaction, 'clear_all', ['Bot Admin'])
        ];
        const allQueues = await server.getQueueChannels();
        if (allQueues.length === 0) {
            throw ExpectedParseErrors.serverHasNoQueue;
        }
        await server.clearAllQueues();
        return SuccessMessages.clearedAllQueues(server.guild.name);
    }

    private async listHelpers(
        interaction: ChatInputCommandInteraction
    ): Promise<undefined> {
        const server = isServerInteraction(interaction);
        const helpers = server.activeHelpers;
        if (helpers === undefined || helpers.size === 0) {
            await interaction.editReply(SimpleEmbed('No one is currently helping.'));
            return undefined;
        }
        const allQueues = await server.getQueueChannels();
        const table = new AsciiTable3()
            .setHeading('Tutor name', 'Availbale Queues', 'Time Elapsed', 'Status')
            .setAlign(1, AlignmentEnum.CENTER)
            .setAlign(2, AlignmentEnum.CENTER)
            .setAlign(3, AlignmentEnum.CENTER)
            .setAlign(4, AlignmentEnum.CENTER)
            .setStyle('unicode-mix')
            .addRowMatrix(
                [...helpers.values()].map(helper => [
                    helper.member.displayName, // Tutor Name
                    helper.member.roles.cache
                        .filter(
                            role =>
                                allQueues.find(queue => queue.queueName === role.name) !==
                                undefined
                        )
                        .map(role => role.name)
                        .toString(), // Available Queues
                    convertMsToTime(new Date().valueOf() - helper.helpStart.valueOf()), // Time Elapsed
                    (() => {
                        const voiceChannel = interaction.guild?.voiceStates.cache.get(
                            helper.member.id
                        )?.channel;
                        if (!voiceChannel) {
                            return 'Not in voice channel';
                        }
                        return voiceChannel.members.size > 1
                            ? `Busy in [${voiceChannel.name}]`
                            : `Idling in [${voiceChannel.name}]`;
                    })() // Status, IIFE to cram in more logic
                ])
            )
            .setWidths([10, 10, 10, 10])
            .setWrapped(1)
            .setWrapped(2)
            .setWrapped(3)
            .setWrapped(4);
        await interaction.editReply(
            SimpleEmbed(
                'Current Helpers',
                EmbedColor.Aqua,
                '```' + table.toString() + '```'
            )
        );
        return undefined;
    }

    private async announce(interaction: ChatInputCommandInteraction): Promise<string> {
        const [server, member] = [
            isServerInteraction(interaction),
            await isTriggeredByUserWithRoles(interaction, 'announce', [
                'Bot Admin',
                'Staff'
            ])
        ];
        const announcement = interaction.options.getString('message', true);
        const optionalChannel = interaction.options.getChannel('queue_name', false);
        if (optionalChannel !== null) {
            const queueChannel = hasValidQueueArgument(interaction, true);
            await server.announceToStudentsInQueue(member, announcement, queueChannel);
        } else {
            await server.announceToStudentsInQueue(member, announcement);
        }
        return SuccessMessages.announced(announcement);
    }

    private async cleanup(interaction: ChatInputCommandInteraction): Promise<string> {
        const [server, queue] = [
            isServerInteraction(interaction),
            hasValidQueueArgument(interaction, true),
            await isTriggeredByUserWithRoles(interaction, 'cleanup', ['Bot Admin'])
        ];
        await server.cleanUpQueue(queue);
        return `Queue ${queue.queueName} has been cleaned up.`;
    }

    private async cleanupAllQueues(
        interaction: ChatInputCommandInteraction
    ): Promise<string> {
        const [server] = [
            isServerInteraction(interaction),
            await isTriggeredByUserWithRoles(interaction, 'cleanup', ['Bot Admin'])
        ];
        const allQueues = await server.getQueueChannels();
        await Promise.all(
            allQueues.map(queueChannel => server.cleanUpQueue(queueChannel)) ?? []
        );
        return `All queues have been cleaned up.`;
    }

    private async cleanupHelpChannel(
        interaction: ChatInputCommandInteraction
    ): Promise<string> {
        const [server] = [
            isServerInteraction(interaction),
            await isTriggeredByUserWithRoles(interaction, 'cleanup_help_channel', [
                'Bot Admin'
            ])
        ];
        await server.updateCommandHelpChannels();
        return `Successfully cleaned up everything under 'Bot Commands Help'.`;
    }

    private async showAfterSessionMessageModal(
        interaction: ChatInputCommandInteraction
    ): Promise<undefined> {
        const [server] = [
            isServerInteraction(interaction),
            await isTriggeredByUserWithRoles(interaction, 'set_after_session_msg', [
                'Bot Admin'
            ])
        ];
        await interaction.showModal(afterSessionMessageModal(server.guild.id));
        return undefined;
    }

    private async help(interaction: ChatInputCommandInteraction): Promise<undefined> {
        const commandName = interaction.options.getString('command', true);
        const helpMessage =
            adminCommandHelpMessages.find(
                message => message.nameValuePair.name === commandName
            ) ??
            helperCommandHelpMessages.find(
                message => message.nameValuePair.name === commandName
            ) ??
            studentCommandHelpMessages.find(
                message => message.nameValuePair.name === commandName
            );
        if (helpMessage !== undefined) {
            await interaction.editReply(helpMessage?.message);
        } else {
            throw new CommandParseError('Command not found.');
        }
        return undefined;
    }

    private async setLoggingChannel(
        interaction: ChatInputCommandInteraction
    ): Promise<string> {
        const [server] = [
            isServerInteraction(interaction),
            await isTriggeredByUserWithRoles(interaction, 'set_logging_channel', [
                'Bot Admin'
            ])
        ];
        const loggingChannel = interaction.options.getChannel(
            'channel',
            true
        ) as TextChannel;
        if (loggingChannel.type !== ChannelType.GuildText) {
            throw new CommandParseError(`${loggingChannel.name} is not a text channel.`);
        }
        await server.setLoggingChannel(loggingChannel);
        return SuccessMessages.updatedLoggingChannel(loggingChannel.name);
    }

    private async showQueueAutoClearModal(
        interaction: ChatInputCommandInteraction
    ): Promise<undefined> {
        const [server] = [
            isServerInteraction(interaction),
            await isTriggeredByUserWithRoles(interaction, 'set_queue_auto_clear', [
                'Bot Admin'
            ])
        ];
        await interaction.showModal(queueAutoClearModal(server.guild.id));
        return undefined;
    }

    private async stopLogging(interaction: ChatInputCommandInteraction): Promise<string> {
        const [server] = [
            isServerInteraction(interaction),
            await isTriggeredByUserWithRoles(interaction, 'stop_logging', ['Bot Admin'])
        ];
        await server.setLoggingChannel(undefined);
        return SuccessMessages.stoppedLogging;
    }

    private async setSeriousMode(
        interaction: ChatInputCommandInteraction
    ): Promise<string> {
        const [server] = await Promise.all([
            isServerInteraction(interaction),
            isTriggeredByUserWithRoles(interaction, 'activate_serious_mode', [
                'Bot Admin'
            ])
        ]);

        const enable = interaction.options.getBoolean('enable', true);

        await server.setSeriousServer(enable);
        if (enable) {
            return `Successfully activated serious mode.`;
        } else {
            return `Successfully deactivated serious mode.`;
        }
    }
}

export { BuiltInCommandHandler };
