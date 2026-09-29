import { tz } from "@date-fns/tz";

/**
 * Every appointment is a UK wall-clock time, so dates and times are always
 * shown in UK time, whatever timezone the viewer's device is set to. Pass
 * as the `in` option to date-fns: format(date, "h:mm a", { in: UK_TIME }).
 */
export const UK_TIME = tz("Europe/London");
