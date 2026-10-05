import type { Formats } from "next-intl";

/** Named formats shared by server and client (`fmt.dateTime(d, "date")`). Dates are UTC on purpose: server and client output never differ. */
export const formats = {
  dateTime: {
    date: { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" },
    dateTime: { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" },
  },
} satisfies Formats;
