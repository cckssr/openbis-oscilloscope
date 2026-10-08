/** German UI strings: login page. */
export const login = {
  title: "Oszilloskop-Steuerung",
  subtitle: "Melde dich mit deinem openBIS-Konto an, um Messgeräte zu steuern.",
  sso: {
    button: "Mit openBIS anmelden",
    returnHint: "Nach der Anmeldung in openBIS hierher zurückkehren.",
    check: "Anmeldung prüfen",
    checking: "Prüfe …",
    noSession:
      "Keine openBIS-Anmeldung gefunden. Bitte zuerst im geöffneten openBIS-Tab anmelden und dann hier erneut prüfen.",
    expired:
      "Die openBIS-Sitzung ist abgelaufen. Bitte in openBIS neu anmelden.",
  },
  advanced: {
    toggle: "Erweitert: Sitzungstoken eingeben",
    label: "Sitzungstoken",
    placeholder: "openBIS-Sitzungstoken",
    submit: "Verbinden",
    submitting: "Verbinden …",
    debugHint: "Entwicklungsmodus: Token",
  },
  errors: {
    invalidToken: "Token ungültig oder abgelaufen.",
    server: (status: number, message: string) =>
      `Serverfehler ${status}: ${message}`,
    unreachable: "Backend nicht erreichbar. Läuft der Server?",
  },
} as const;
