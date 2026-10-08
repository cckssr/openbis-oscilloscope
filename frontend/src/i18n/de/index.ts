/**
 * German UI dictionary. Each feature area owns one module; import the area
 * you need (`import { de } from "@/i18n/de"` → `de.control.lock.take`).
 * Keeping all strings here makes an English translation a drop-in later.
 */
import { archive } from "./archive";
import { common } from "./common";
import { control } from "./control";
import { devices } from "./devices";
import { login } from "./login";
import { plot } from "./plot";

export const de = { common, devices, login, control, plot, archive } as const;
