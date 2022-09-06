// Please see the setup guide on how to find the following credentials.

import { Collection } from "discord.js";
import { CalendarQueueExtension } from "./calendar-queue-extension";
/**
 * This manages the state of the calendar extension
 * Calendar extension only need to worry about calendar switches, 
 * so I didn't set up different event listeners.
 * 
 * If your extension is more sophisticated, you should set up different event listeners.
 * Make sure to use hashmaps. O(n) is very slow for a network heavy application.
 * */
const calendarExtensionStates = {
    // key is the name on the calendar, value is user.id, used for ping
    calendarNameDiscordIdMap: new Collection<string, string>(),
    listeners: new Collection<string, CalendarQueueExtension>()
};

export { calendarExtensionStates };
