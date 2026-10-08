/** German UI strings: control. */
export const control = {
  /**
   * Strings of the device session store (`app/state/deviceSession`): job and
   * busy labels, workflow steps and hints, lock messages and toasts.
   */
  session: {
    steps: {
      take: "Gerät übernehmen",
      setup: "Signal einstellen",
      capture: "Aufnehmen",
      annotate: "Notieren & auswählen",
      upload: "Hochladen",
    },
    next: {
      take: "Drücke „Gerät übernehmen“, um zu beginnen.",
      takeAgain: "Drücke „Gerät übernehmen“, um weiter zu messen.",
      passive:
        "Dieses Gerät wird in einem anderen Tab gesteuert. Drücke „Gerät übernehmen“, um hier weiterzumachen.",
      lost: "Die Verbindung zum Gerät ist verloren. Drücke „Gerät übernehmen“, um dich erneut zu verbinden.",
      live: "Drücke „Live starten“, um das Signal zu sehen.",
      capture: "Speichere eine Aufnahme mit „Aufnahme speichern“.",
      annotate:
        "Schreibe eine Notiz zur Aufnahme und wähle sie zum Hochladen aus.",
      upload: "Lade deine ausgewählten Aufnahmen im Archiv hoch.",
      allUploaded:
        "Alle Aufnahmen sind hochgeladen. Du kannst weitere Aufnahmen speichern.",
    },
    /** Titles of running or finished jobs (status bar). */
    jobs: {
      takeControl: "Gerät wird übernommen…",
      capture: "Aufnahme wird gespeichert…",
      fullResolution: "Volle Auflösung wird gelesen…",
      screenshot: "Bildschirmfoto wird gespeichert…",
      autoscale: "Auto-Setup läuft…",
      series: "Serienaufnahme läuft…",
      cancelling: "Wird abgebrochen…",
      seriesCount: (n: number) =>
        n === 1 ? "1 Aufnahme gespeichert" : `${n} Aufnahmen gespeichert`,
    },
    /** `busy` labels of the serialized command queue (reason for disabled buttons). */
    busy: {
      applySettings: "Einstellung wird übernommen…",
      readSettings: "Einstellungen werden gelesen…",
      run: "Gerät wird gestartet…",
      stop: "Gerät wird angehalten…",
      single: "Einzelaufnahme wird ausgelöst…",
      forceTrigger: "Trigger wird erzwungen…",
      autoscale: "Auto-Setup läuft…",
      capture: "Aufnahme wird gespeichert…",
      fullResolution: "Volle Auflösung wird gelesen…",
      screenshot: "Bildschirmfoto wird gespeichert…",
    },
    lock: {
      lost: "Die Sperre auf das Gerät ist abgelaufen oder wurde aufgehoben. Alle laufenden Vorgänge wurden gestoppt. Übernimm das Gerät erneut, um weiterzumachen.",
      lostTitle: "Verbindung zum Gerät verloren",
      takeFailedTitle: "Gerät konnte nicht übernommen werden",
      takeFailed: "Das Gerät konnte nicht übernommen werden.",
      releaseFailedTitle: "Gerät konnte nicht freigegeben werden",
      releaseFailed: "Das Gerät konnte nicht freigegeben werden.",
      releaseBusy:
        "Das Gerät ist noch beschäftigt. Warte, bis der laufende Vorgang beendet ist.",
      notControlling:
        "Du steuerst dieses Gerät gerade nicht. Übernimm es zuerst.",
      deviceLoadFailed: "Gerät konnte nicht geladen werden.",
    },
    toast: {
      captureSaved: (n: number) => `Aufnahme #${n} gespeichert`,
      points: (formatted: string) => `${formatted} pro Kanal`,
      captureFailedTitle: "Aufnahme fehlgeschlagen",
      captureFailed: "Die Aufnahme konnte nicht gespeichert werden.",
      noChannel:
        "Kein Kanal ist aktiv. Schalte mindestens einen Kanal ein, bevor du aufnimmst.",
      cancelFailedTitle: "Abbrechen fehlgeschlagen",
      cancelFailed: "Der Vorgang konnte nicht abgebrochen werden.",
      screenshotSaved: "Bildschirmfoto gespeichert",
      screenshotFailedTitle: "Bildschirmfoto fehlgeschlagen",
      screenshotFailed: "Das Bildschirmfoto konnte nicht gespeichert werden.",
      liveFailedTitle: "Live-Ansicht gestoppt",
      liveFailed: "Das Signal konnte mehrfach nicht gelesen werden.",
      liveStartFailedTitle: "Live konnte nicht gestartet werden",
      liveStartFailed: "Das Gerät konnte nicht gestartet werden.",
      commandFailedTitle: "Befehl fehlgeschlagen",
      commandFailed: "Der Befehl konnte nicht an das Gerät gesendet werden.",
      autoscaleFailedTitle: "Auto-Setup fehlgeschlagen",
      autoscaleFailed: "Das Auto-Setup konnte nicht ausgeführt werden.",
      settingFailedTitle: "Einstellung nicht übernommen",
      settingFailed: "Das Gerät hat die Einstellung nicht übernommen.",
      settingsLoadFailedTitle: "Einstellungen konnten nicht geladen werden",
      settingsLoadFailed: "Die Einstellungen des Geräts konnten nicht gelesen werden.",
      noteFailedTitle: "Notiz nicht gespeichert",
      noteFailed: "Die Notiz konnte nicht gespeichert werden.",
      flagFailedTitle: "Auswahl nicht gespeichert",
      flagFailed: "Die Auswahl zum Hochladen konnte nicht gespeichert werden.",
      countsFailedTitle: "Aufnahmen konnten nicht gezählt werden",
      countsFailed: "Der Stand des Archivs konnte nicht geladen werden.",
      noCapture: "Es gibt noch keine Aufnahme, zu der du etwas notieren kannst.",
    },
  },
} as const;
