import { CommandInteraction, GuildMember, GuildChannel, TextChannel, ButtonInteraction } from "discord.js";
import { QueueChannel } from "../attending-server/base-attending-server";
import { CommandParseError } from "../utils/error-types";

/**
 * Checks if the triggerer has the required roles
 * ----
 * @param commandName the command used
 * @param requiredRoles the roles to check, roles have OR relationship
 * @returns GuildMember: object of the triggerer
*/
async function isTriggeredByUserWithRoles(
    interaction: CommandInteraction | ButtonInteraction,
    commandName: string,
    requiredRoles: string[]
): Promise<GuildMember> {
    const userRoles = (await (interaction.member as GuildMember)?.fetch())
        .roles.cache.map(role => role.name);
    if (!(interaction.member instanceof GuildMember &&
        (userRoles.some(role => requiredRoles.includes(role))))) {
        return Promise.reject(new CommandParseError(
            `You need to have: [${requiredRoles.join(' or ')}] to use \`/${commandName}\`.`));
    }
    return interaction.member as GuildMember;
}

/**
 * Checks if the queue_name argument is given
 * If not, use the parent of the channel where the command was used
 * ----
 * @param required if true, check if the command arg is a valid queue category
 * @returns QueueChannel: the complete QueueChannel that AttendingServerV2 accepts
 * */
async function hasValidQueueArgument(
    interaction: CommandInteraction,
    required = false
): Promise<QueueChannel> {
    const parentCategory = interaction.options.getChannel("queue_name", required) ??
        (interaction.channel as GuildChannel).parent;
    // null check is done here by optional property access
    if (parentCategory?.type !== 'GUILD_CATEGORY' || parentCategory === null) {
        return Promise.reject(new CommandParseError(
            `\`${parentCategory?.name}\` is not a valid queue category.`));
    }
    const queueTextChannel = parentCategory.children
        .find(child =>
            child.name === 'queue' &&
            child.type === 'GUILD_TEXT');
    if (queueTextChannel === undefined) {
        return Promise.reject(new CommandParseError(
            `This category does not have a \`#queue\` text channel.\n` +
            `If you are an admin, you can use \`/queue add ${parentCategory.name}\` ` +
            `to generate one.`));
    }
    const queueChannel: QueueChannel = {
        channelObj: queueTextChannel as TextChannel,
        queueName: parentCategory.name,
        parentCategoryId: parentCategory.id
    };
    return queueChannel;
}

/**
 * Checks if the user has the Valid Email role
 * ----
 * @param commandName the command used
 * @returns GuildMember: object of the triggerer
*/
async function isTriggeredByUserWithValidEmail(
    interaction: CommandInteraction | ButtonInteraction,
    commandName: string
): Promise<GuildMember> {
    const roles = (await (interaction.member as GuildMember)?.fetch())
        .roles.cache.map(role => role.name);
    if (!(interaction.member instanceof GuildMember &&
        roles.includes('Verified Email'))) {
        return Promise.reject(new CommandParseError(
            `You need to have a verified email to use \`/${commandName}\`.`));
    }
    return interaction.member as GuildMember;
}

/**
 *  Checks if the queue channel has a parent folder
 * ----
 */
async function isFromQueueChannelWithParent(
    interaction: ButtonInteraction | CommandInteraction,
    queueName: string
): Promise<QueueChannel> {
    if (interaction.channel?.type !== 'GUILD_TEXT' ||
        interaction.channel.parent === null) {
        return Promise.reject(new CommandParseError(
            'Invalid button press / Command. ' +
            'Make sure this channel has a parent category.'
        ));
    }

    const queueChannel: QueueChannel = {
        channelObj: interaction.channel as TextChannel,
        queueName: queueName,
        parentCategoryId: interaction.channel.parent.id
    };
    return Promise.resolve(queueChannel);
}

async function isFromGuildMember(
    interaction: ButtonInteraction | CommandInteraction
): Promise<GuildMember> {
    if (interaction.member) {
        return interaction.member as GuildMember;
    }
    return Promise.reject(new CommandParseError(
        'Sorry, I only accept server base interactions.'
    ));
}

export {
    isTriggeredByUserWithRoles,
    hasValidQueueArgument,
    isFromQueueChannelWithParent,
    isFromGuildMember,
    isTriggeredByUserWithValidEmail
};