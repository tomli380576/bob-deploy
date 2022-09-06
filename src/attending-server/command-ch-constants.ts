import { adminCommandsEmbed } from '../../help-channel-messages/AdminCommands';
import { studentCommandsEmbed } from '../../help-channel-messages/StudentCommands';

export const commandChConfigs = [
    {
        channelName: 'staff-commands',
        file: adminCommandsEmbed,
        visibility: ['Bot Admin', 'Staff']
    },
    {
        channelName: 'student-commands',
        file: studentCommandsEmbed,
        visibility: ['Bot Admin', 'Staff', 'Student']
    }
];