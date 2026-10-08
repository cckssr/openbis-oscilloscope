/** German UI strings shared by all pages: generic actions, status labels, error fallbacks, input validation. */
export const common = {
  appName: "Oszilloskop-Steuerung",
  actions: {
    back: "Zurück",
    retry: "Erneut versuchen",
    reload: "Seite neu laden",
    refresh: "Aktualisieren",
    logout: "Abmelden",
    help: "Hilfe",
  },
  /** Root error boundary (whole app crashed). */
  errorBoundary: {
    title: "Etwas ist schiefgelaufen",
    hint: "Die Seite konnte nicht angezeigt werden. Nicht gespeicherte Eingaben können verloren gehen.",
    reload: "Seite neu laden",
  },
  /** Per-region error boundary (one panel crashed, rest of the page keeps working). */
  region: {
    title: "Dieser Bereich konnte nicht angezeigt werden",
    retry: "Erneut versuchen",
    named: (name: string) => `Bereich: ${name}`,
  },
  /** NumericInput validation and stepper labels. */
  numeric: {
    invalid: "Keine gültige Zahl",
    max: (bound: string) => `max. ${bound}`,
    min: (bound: string) => `min. ${bound}`,
    increase: "erhöhen",
    decrease: "verringern",
  },
  /** StatusBadge labels (always icon + text). */
  status: {
    ONLINE: "Verfügbar",
    LOCKED: "Belegt",
    LOCKED_MINE: "Du steuerst",
    BUSY: "Beschäftigt",
    OFFLINE: "Offline",
    ERROR: "Fehler",
  },
} as const;
