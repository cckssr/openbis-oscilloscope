/**
 * German UI strings: archive ("Messdaten"), upload wizard and "Meine Messdaten".
 * Glossary: Aufnahme (all channels), Kanalspur (one channel), Serie (run group),
 * Hochladen (upload to openBIS).
 */

/** Singular/plural helper for counts: `plural(3, "Aufnahme", "Aufnahmen")`. */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

const page = {
  title: "Messdaten",
  sessionFallback: "Sitzung",
  back: {
    toDevice: "Zurück zur Steuerung",
    toSessions: "Zurück zu Meine Messdaten",
  },
  refresh: "Aktualisieren",
  loadError: "Messdaten konnten nicht geladen werden",
  empty: {
    title: "Noch keine Aufnahmen",
    text: "Auf der Steuerungsseite „Aufnahme speichern“ verwenden.",
  },
  summary: {
    captures: (n: number) => plural(n, "Aufnahme", "Aufnahmen"),
    selected: (n: number) => `${plural(n, "Aufnahme", "Aufnahmen")} ausgewählt`,
    uploaded: (n: number) => `${n} hochgeladen`,
    none: "Keine Aufnahme ausgewählt",
  },
  select: {
    all: "Alle auswählen",
    withNote: "Alle mit Notiz auswählen",
    withNoteTitle:
      "Alle noch nicht hochgeladenen Aufnahmen mit Notiz zum Hochladen auswählen",
    clear: "Auswahl aufheben",
    allAria: "Alle noch nicht hochgeladenen Aufnahmen zum Hochladen auswählen",
    flagError: "Auswahl fehlgeschlagen",
    flagErrorText: "Die Auswahl konnte nicht gespeichert werden.",
  },
  upload: {
    button: (n: number) => `Hochladen (${n})`,
    reasonNone:
      "Wähle zuerst mindestens eine Aufnahme in der Spalte „Hochladen“ aus.",
  },
  table: {
    upload: "Hochladen",
    time: "Zeit",
    channels: "Kanäle",
    note: "Notiz",
    status: "Status",
    actions: "Aktionen",
    series: (n: number) => `Serie ${n}`,
    seriesCount: (n: number) => plural(n, "Aufnahme", "Aufnahmen"),
    seriesToggle: "Serie auf- oder zuklappen",
    screenshot: "Bildschirmfoto",
    rowUploadAria: (time: string) =>
      `Aufnahme von ${time} zum Hochladen auswählen`,
    seriesUploadAria: (n: number) =>
      `Alle Aufnahmen der Serie ${n} zum Hochladen auswählen`,
    uploadedReason:
      "Bereits hochgeladen. Über das Menü „Erneut hochladen“ kann sie noch einmal ausgewählt werden.",
  },
  note: {
    placeholder: "Notiz hinzufügen…",
    edit: "Notiz bearbeiten",
    aria: "Notiz zur Aufnahme",
    saveError: "Notiz nicht gespeichert",
    saveErrorText: "Die Notiz konnte nicht gespeichert werden.",
    unavailable: "Für diese Aufnahme kann keine Notiz gespeichert werden.",
  },
  status: {
    local: "Lokal",
    selected: "Zum Hochladen ausgewählt",
    uploaded: "Hochgeladen ✓",
  },
  actions: {
    preview: "Vorschau",
    more: "Weitere Aktionen",
    reupload: "Erneut hochladen",
    editNote: "Notiz bearbeiten",
  },
  preview: {
    title: "Vorschau",
    close: "Vorschau schließen",
    prev: "Vorherige Aufnahme (←)",
    next: "Nächste Aufnahme (→)",
    position: (i: number, n: number) => `${i} von ${n}`,
    placeholder: "Wähle eine Aufnahme aus, um die Vorschau zu sehen.",
    loadError: "Vorschau konnte nicht geladen werden",
    retry: "Erneut laden",
    noData: "Diese Aufnahme enthält keine Kanalspuren.",
    noNote: "Keine Notiz",
    screenshotAlt: "Bildschirmfoto des Oszilloskops",
    keyHint: "Mit ← → zwischen Aufnahmen wechseln, Esc schließt.",
    measurements: "Messwerte",
  },
  export: {
    allZip: "Alle als ZIP",
    error: "Download fehlgeschlagen",
  },
} as const;

const wizard = {
  title: "Hochladen nach openBIS",
  description:
    "Die ausgewählten Aufnahmen werden mit deinen Angaben in openBIS gespeichert.",
  stepOf: (i: number, n: number) => `Schritt ${i} von ${n}`,
  steps: {
    review: "Auswahl",
    target: "Ziel",
    details: "Angaben",
    confirm: "Bestätigen",
    result: "Ergebnis",
  },
  nav: {
    back: "Zurück",
    next: "Weiter",
    cancel: "Abbrechen",
    close: "Schließen",
    done: "Fertig",
    submit: "Jetzt hochladen",
    retry: "Erneut versuchen",
    backToConfirm: "Zurück zur Bestätigung",
  },
  review: {
    heading: "Was wird hochgeladen?",
    intro:
      "Entferne das Häkchen bei Aufnahmen, die du jetzt nicht hochladen möchtest.",
    count: (n: number, total: number) =>
      `${plural(n, "Aufnahme", "Aufnahmen")} von ${total} ausgewählt`,
    empty: "Keine Aufnahme ausgewählt.",
    noNote: "Keine Notiz",
    rowAria: (time: string) => `Aufnahme von ${time} hochladen`,
    reasonNone: "Wähle mindestens eine Aufnahme aus.",
  },
  target: {
    heading: "Wohin soll hochgeladen werden?",
    intro:
      "Wähle deine Praktikumsgruppe und den Versuch, zu dem die Messdaten gehören.",
    group: "Gruppe",
    groupHelp:
      "In openBIS entspricht die Gruppe dem Projekt deiner Praktikumsgruppe (z. B. „Mittwoch – Gruppe 4“).",
    groupPlaceholder: "Gruppe auswählen…",
    experiment: "Versuch",
    experimentHelp:
      "Der Versuch ist in openBIS eine Sammlung (Experiment) innerhalb deiner Gruppe. Die Aufnahmen werden dort als Datensatz abgelegt.",
    experimentPlaceholder: "Versuch auswählen…",
    object: "Probe / Objekt",
    optional: "optional",
    objectHelp:
      "Wenn die Messdaten zu einer bestimmten Probe oder einem Bauteil gehören, kann der Datensatz direkt daran gehängt werden. Ohne Auswahl landet er beim Versuch.",
    objectPlaceholder: "(optional) Probe auswählen…",
    loading: "Lade…",
    loadError: "Die openBIS-Struktur konnte nicht geladen werden",
    loadErrorTitle: "openBIS nicht erreichbar",
    noGroups:
      "Keine Gruppen gefunden. Nutze „Erweitert“, um die Kennung deines Versuchs einzugeben.",
    advanced: "Erweitert: Kennung manuell eingeben",
    advancedHint:
      "Nur nötig, wenn dein Versuch in der Liste fehlt. Die Kennung bekommst du von deiner Betreuung.",
    manualExperiment: "Kennung des Versuchs",
    manualExperimentHelp:
      "Pfad der openBIS-Sammlung, z. B. /RAUM/PROJEKT/EXPERIMENT-1.",
    manualObject: "Kennung der Probe",
    manualObjectHelp: "Optional, z. B. /RAUM/PROBE-1.",
    manualInvalid: "Bitte als /RAUM/PROJEKT/EXPERIMENT eingeben.",
    manualObjectInvalid: "Bitte als /RAUM/PROBE eingeben.",
    useList: "Stattdessen aus der Liste wählen",
    reasonGroup: "Wähle zuerst eine Gruppe.",
    reasonExperiment: "Wähle den Versuch.",
    rememberTarget: "Ziel merken",
  },
  details: {
    heading: "Angaben zum Versuch",
    intro:
      "Pflichtfelder sind mit * markiert. Mit der Stecknadel merkst du dir ein Feld für den nächsten Upload.",
    labCourse: "Praktikum",
    labCourseHelp:
      "Wird in openBIS als Eigenschaft DSO_LAB_COURSE am Datensatz gespeichert.",
    labCoursePlaceholder: "Praktikum auswählen…",
    expTitle: "Versuchstitel",
    expTitleHelp:
      "Kurzer Titel des Versuchs. openBIS-Eigenschaft: DSO_EXP_TITLE.",
    expTitlePlaceholder: "z. B. RC-Schaltung Frequenzgang",
    expDescription: "Beschreibung",
    expDescriptionHelp:
      "Ausführlichere Beschreibung des Versuchs. openBIS-Eigenschaft: DSO_EXP_DESCRIPTION.",
    expDescriptionPlaceholder: "Was wurde gemessen und wie?",
    deviceUnderTest: "Messobjekt",
    deviceUnderTestHelp:
      "Bauteil oder Schaltung, die gemessen wurde. openBIS-Eigenschaft: DSO_DEVICE_UNDER_TEST.",
    deviceUnderTestPlaceholder: "z. B. RC-Filter, Op-Amp LM741",
    notes: "Notizen",
    notesHelp: "Freitext zu dieser Messung. openBIS-Eigenschaft: DSO_NOTES.",
    notesPlaceholder: "Auffälligkeiten, Einstellungen, …",
    required: "Pflichtfeld",
    reasonCourse: "Wähle das Praktikum.",
    reasonTitle: "Gib einen Versuchstitel ein.",
  },
  remember: {
    label: "merken",
    on: "Wird für den nächsten Upload gemerkt",
    off: "Nicht merken",
    aria: (field: string) => `${field} für den nächsten Upload merken`,
  },
  confirm: {
    heading: "Alles richtig?",
    intro:
      "Prüfe die Zusammenfassung. Hochgeladene Aufnahmen können nicht zurückgenommen werden.",
    captures: "Aufnahmen",
    target: "Ziel",
    group: "Gruppe",
    experiment: "Versuch",
    object: "Probe / Objekt",
    none: "—",
    details: "Angaben",
  },
  result: {
    uploading: (n: number) =>
      `${plural(n, "Aufnahme wird", "Aufnahmen werden")} hochgeladen…`,
    uploadingHint: "Bitte dieses Fenster geöffnet lassen.",
    success: (n: number) =>
      `✓ ${plural(n, "Aufnahme", "Aufnahmen")} hochgeladen`,
    successDataset: (permId: string) => `Datensatz ${permId}`,
    openInOpenbis: "In openBIS öffnen",
    dropbox:
      "Die Daten wurden an die openBIS-Dropbox übergeben. Die Registrierung läuft automatisch und kann einige Minuten dauern.",
    failed: "Hochladen fehlgeschlagen",
    failedHint:
      "Deine Aufnahmen sind noch lokal vorhanden und nichts ging verloren.",
    toastSuccess: "Hochgeladen",
    toastError: "Hochladen fehlgeschlagen",
  },
} as const;

const sessions = {
  title: "Meine Messdaten",
  subtitle: "Deine Sitzungen am Oszilloskop",
  back: "Zur Geräteliste",
  refresh: "Aktualisieren",
  open: "Öffnen",
  loadError: "Sitzungen konnten nicht geladen werden",
  retention: (time: string | null) =>
    time
      ? `Messdaten werden nur bis zum Tagesende (${time} Uhr) auf dem Server gehalten. Lade Wichtiges bis dahin nach openBIS hoch oder als ZIP herunter.`
      : "Messdaten werden nur bis zum Tagesende auf dem Server gehalten. Lade Wichtiges bis dahin nach openBIS hoch oder als ZIP herunter.",
  empty: {
    title: "Noch keine Messdaten",
    text: "Sobald du ein Gerät übernimmst und Aufnahmen speicherst, erscheinen sie hier.",
    action: "Zur Geräteliste",
  },
  counts: {
    captures: (n: number) => plural(n, "Aufnahme", "Aufnahmen"),
    screenshots: (n: number) => plural(n, "Bildschirmfoto", "Bildschirmfotos"),
    selected: (n: number) => `${n} ausgewählt`,
    uploaded: (n: number) => `${n} hochgeladen`,
    nothing: "Noch leer",
  },
  status: {
    active: "Aktiv",
    allUploaded: "Alles hochgeladen ✓",
    pending: (n: number) => `${n} nicht hochgeladen`,
    empty: "Leer",
  },
  started: (time: string) => `gestartet ${time}`,
  today: "Heute",
  yesterday: "Gestern",
} as const;

/** Archive page strings; `wizard` = upload wizard, `sessions` = "Meine Messdaten". */
export const archive = { ...page, wizard, sessions } as const;
