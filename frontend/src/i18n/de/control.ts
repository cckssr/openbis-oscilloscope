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
      settingsLoadFailed:
        "Die Einstellungen des Geräts konnten nicht gelesen werden.",
      noteFailedTitle: "Notiz nicht gespeichert",
      noteFailed: "Die Notiz konnte nicht gespeichert werden.",
      flagFailedTitle: "Auswahl nicht gespeichert",
      flagFailed: "Die Auswahl zum Hochladen konnte nicht gespeichert werden.",
      countsFailedTitle: "Aufnahmen konnten nicht gezählt werden",
      countsFailed: "Der Stand des Archivs konnte nicht geladen werden.",
      noCapture:
        "Es gibt noch keine Aufnahme, zu der du etwas notieren kannst.",
    },
  },
  /**
   * Strings of the control page's actions, capture and status components
   * (`pages/control/actions`, `capture`, `status`).
   */
  actions: {
    /** Why a control is disabled (shown as tooltip and, on touch, as visible text). */
    reasons: {
      needControl: "Zuerst Gerät übernehmen",
      acquiring: "Gerät wird übernommen…",
      releasing: "Gerät wird freigegeben…",
      passive: "Dieses Gerät wird in einem anderen Tab gesteuert",
      lost: "Verbindung zum Gerät verloren – übernimm das Gerät erneut",
      notConnected: "Das Gerät ist nicht verbunden",
      fullResolution: "Volle Auflösung wird gelesen…",
      seriesRunning: "Serienaufnahme läuft – zuerst stoppen",
      liveStarting: "Live wird gestartet…",
    },
    live: {
      start: "Live starten",
      stop: "Live stoppen",
      starting: "Live startet…",
      railStart: "Live an",
      railStop: "Live aus",
      railStarting: "Startet…",
      startHint:
        "Zeigt das Signal laufend an. Dabei wird nichts gespeichert. Das Gerät selbst wird nicht angehalten.",
      stopHint:
        "Beendet nur die Live-Anzeige in diesem Fenster. Das Gerät misst weiter – zum Anhalten „Scope stopp“ drücken.",
    },
    stopScope: {
      label: "Scope stopp",
      rail: "Scope stopp",
      hint: "Hält die Messung am Gerät an (wie die STOP-Taste am Oszilloskop). Die Anzeige friert ein. Etwas anderes als „Live aus“.",
    },
    more: {
      label: "Mehr",
      ariaLabel: "Weitere Messaktionen",
    },
    autoscale: {
      label: "Auto-Setup",
      rail: "Auto",
      hint: "Stellt Zeitbasis, V/div und Trigger automatisch passend zum Signal ein.",
      helpLabel: "Hilfe zu Auto-Setup",
      helpTitle: "Auto-Setup",
      help: "Stellt Zeitbasis, V/div und Trigger automatisch passend zum Signal ein. Ideal als erster Schritt, wenn du nichts oder nur eine Linie siehst.",
    },
    single: {
      label: "Einzeltrigger",
      rail: "Einzel",
      hint: "Wartet auf genau einen Trigger und hält dann an.",
    },
    forceTrigger: {
      label: "Trigger erzwingen",
      rail: "Erzwingen",
      hint: "Löst sofort einen Trigger aus, auch wenn das Signal die Triggerbedingung nicht erfüllt.",
    },
    series: {
      start: "Serienaufnahme starten",
      stop: "Serienaufnahme stoppen",
      rail: "Serie",
      railStop: "Serie ■",
      hint: "Speichert etwa jede Sekunde eine Aufnahme, bis du stoppst.",
      count: (n: number) => (n === 1 ? "1 Aufnahme" : `${n} Aufnahmen`),
    },
    /** Shortcut key labels shown in tooltips (`SHORTCUTS`). */
    shortcuts: {
      title: "Tastenkürzel",
      live: "Live starten/stoppen",
      capture: "Aufnahme speichern",
      note: "Zur Notiz springen",
      fullResolution: "Volle Auflösung",
      space: "Leertaste",
      withKey: (label: string, key: string) => `${label} (${key})`,
    },
    capture: {
      save: "Aufnahme speichern",
      saveRail: "Speichern",
      saving: "Wird gespeichert…",
      savingRail: "Speichert…",
      more: "Weitere Aufnahmearten",
      helper:
        "Speichert das aktuelle Bild als Aufnahme. Live wird dabei angehalten.",
      fullResolution: "Volle Auflösung (langsam)…",
      fullResolutionHint: "Liest den ganzen Gerätespeicher",
      screenshot: "Bildschirmfoto des Oszilloskops",
      screenshotHint: "Speichert das Bild des Geräte-Displays",
      screenshotSaving: "Bildschirmfoto wird gespeichert…",
    },
    screenshot: {
      saved: "Bildschirmfoto gespeichert",
      download: "Herunterladen",
      close: "Schließen",
      alt: "Vorschau des Bildschirmfotos",
      thumbnailFailed: "Vorschau nicht verfügbar",
      downloadFailedTitle: "Herunterladen fehlgeschlagen",
      downloadFailed: "Das Bildschirmfoto konnte nicht geladen werden.",
      filename: (device: string, stamp: string) =>
        `bildschirmfoto_${device}_${stamp}.png`,
    },
    /** Full-resolution dialog: four steps. */
    fullResolution: {
      title: "Volle Auflösung lesen",
      description:
        "Liest den gesamten Gerätespeicher statt nur das Bild vom Bildschirm.",
      steps: {
        explain: "Was passiert?",
        check: "Einstellungen prüfen",
        read: "Lesen",
        done: "Fertig",
      },
      explain: {
        lead: "Das Oszilloskop liest seinen gesamten Speicher aus – bis zu mehreren Millionen Punkte pro Kanal, statt der wenigen hundert Punkte, die auf dem Bildschirm zu sehen sind.",
        stopped:
          "Das Gerät wird dabei angehalten. Während des Lesens sind alle anderen Aktionen gesperrt.",
        useful:
          "Sinnvoll, wenn du in Details hineinzoomen willst oder eine Frequenzanalyse (FFT) machen möchtest.",
      },
      check: {
        depth: "Speichertiefe",
        depthUnknown: "unbekannt",
        channels: "Aktive Kanäle",
        noChannels: "Kein Kanal aktiv",
        duration: "Geschätzte Dauer",
        durationUnknown: "etwa 5–60 s",
        durationRange: (from: string, to: string) => `etwa ${from} bis ${to}`,
        change: "Anpassen am Gerät",
        changeHow:
          "Am Oszilloskop unter „Acquire → Mem Depth“ stellst du die Speichertiefe ein.",
        changeWhy:
          "Warum? Eine größere Speichertiefe liefert mehr Details und eine feinere Frequenzauflösung, dauert aber länger. Weniger aktive Kanäle verkürzen das Lesen.",
      },
      read: {
        reading: "Speicher wird gelesen…",
        waiting: "Das Gerät bereitet das Lesen vor…",
        elapsed: (t: string) => `Vergangene Zeit: ${t}`,
        percent: (p: number) => `${p} %`,
        closeHint:
          "Du kannst dieses Fenster schließen. Der Fortschritt bleibt unten in der Statusleiste sichtbar.",
        cancelling: "Wird abgebrochen…",
      },
      done: {
        title: "Fertig",
        points: (formatted: string) => `${formatted} pro Kanal gelesen`,
        saved: (n: number) => `Gespeichert als Aufnahme #${n}.`,
        cancelledTitle: "Abgebrochen",
        cancelled: "Das Lesen wurde abgebrochen. Es wurde nichts gespeichert.",
        errorTitle: "Lesen fehlgeschlagen",
        errorFallback: "Der Speicher konnte nicht gelesen werden.",
      },
      buttons: {
        next: "Weiter",
        back: "Zurück",
        start: "Lesen starten",
        cancel: "Abbrechen",
        close: "Schließen",
        showInPlot: "Im Plot anzeigen",
        retry: "Erneut versuchen",
      },
      stepOf: (n: number, total: number) => `Schritt ${n} von ${total}`,
    },
    lastCapture: {
      title: "Letzte Aufnahme",
      empty: "Noch keine Aufnahme gespeichert.",
      summary: (n: number, time: string) => `Aufnahme #${n} · ${time}`,
      fullResolutionBadge: "Volle Auflösung",
      noteLabel: "Notiz",
      notePlaceholder: "Notiz zur Aufnahme …",
      noteHint: "Enter speichert, Umschalt+Enter macht eine neue Zeile.",
      saveNote: "Notiz speichern",
      noteSaving: "Speichert…",
      noteSaved: "Notiz gespeichert",
      noteFailed: "Notiz nicht gespeichert",
      flag: "Zum Hochladen auswählen",
      readOnly: "Zum Bearbeiten zuerst Gerät übernehmen.",
    },
    liveBadge: {
      live: "LIVE",
      paused: "pausiert",
      starting: "startet…",
      stale: "veraltet",
      waiting: "wartet auf Signal…",
      age: (formatted: string) => `aktualisiert vor ${formatted}`,
      staleAge: (formatted: string) => `letztes Bild vor ${formatted}`,
    },
    statusBar: {
      ready: "Bereit",
      cancel: "Abbrechen",
      cancelling: "Wird abgebrochen…",
      dismiss: "Meldung schließen",
      elapsed: (t: string) => `seit ${t}`,
      done: {
        capture: (n: number | null) =>
          n ? `Aufnahme #${n} gespeichert` : "Aufnahme gespeichert",
        "full-resolution": (n: number | null) =>
          n
            ? `Volle Auflösung gespeichert (Aufnahme #${n})`
            : "Volle Auflösung gespeichert",
        screenshot: () => "Bildschirmfoto gespeichert",
        autoscale: () => "Auto-Setup abgeschlossen",
        series: () => "Serienaufnahme beendet",
        "take-control": () => "Gerät übernommen",
        command: () => "Befehl ausgeführt",
      },
      failed: {
        capture: "Aufnahme fehlgeschlagen",
        "full-resolution": "Volle Auflösung fehlgeschlagen",
        screenshot: "Bildschirmfoto fehlgeschlagen",
        autoscale: "Auto-Setup fehlgeschlagen",
        series: "Serienaufnahme fehlgeschlagen",
        "take-control": "Gerät konnte nicht übernommen werden",
        command: "Befehl fehlgeschlagen",
      },
      cancelled: "Abgebrochen",
    },
  },
  /**
   * Control page shell (`app/pages/control`): header, release guard, workflow
   * stepper, banners, layout chrome and plot region.
   */
  page: {
    documentTitle: (label: string) => `${label} – Oszilloskop`,
    loading: "Gerät wird geladen…",
    header: {
      back: "Zurück zu den Geräten",
      take: "Gerät übernehmen",
      taking: "Übernehme…",
      retake: "Erneut übernehmen",
      release: "Gerät freigeben",
      releasing: "Gebe frei…",
      held: (time: string) => `Du steuerst dieses Gerät · aktiv seit ${time}`,
      heldNoTime: "Du steuerst dieses Gerät",
      passive: "Wird in einem anderen Tab gesteuert",
      lost: "Verbindung verloren",
      free: "Frei – noch nicht übernommen",
      offline: "Gerät nicht erreichbar",
      error: "Gerät meldet einen Fehler",
      lockedBy: (owner: string) => `Belegt von ${owner}`,
      takeDisabledBusy: "Das Gerät ist belegt oder nicht erreichbar.",
      data: (n: number) => `Messdaten (${n})`,
      dataTitle: "Gespeicherte Aufnahmen dieser Sitzung ansehen und hochladen",
      dataTitleNone: "Alle deine Sitzungen ansehen",
    },
    /** Asked when taking a device while another one is still locked by the same user. */
    otherLock: {
      title: "Du steuerst bereits ein anderes Gerät",
      description: (names: string[]) =>
        names.length === 1
          ? `Du hast „${names[0]}“ bereits übernommen.`
          : `Du hast bereits ${names.length} andere Geräte übernommen: ${names.map((n) => `„${n}“`).join(", ")}.`,
      hint: "Gib das andere Gerät frei, damit andere es nutzen können, oder behalte beide Geräte gleichzeitig.",
      cancel: "Abbrechen",
      both: "Beide behalten",
      switch: (n: number) =>
        n === 1
          ? "Anderes freigeben und übernehmen"
          : "Andere freigeben und übernehmen",
      checking: "Prüfe Sperren…",
    },
    level: {
      ariaLabel: "Bedienung",
      basic: "Einfach",
      expert: "Erweitert",
      helpLabel: "Hilfe zur Bedienung",
      helpTitle: "Einfach oder Erweitert",
      helpBasic:
        "Einfach: Kanäle ein- und ausschalten und Auto-Setup – genug für die meisten Messungen.",
      helpExpert:
        "Erweitert: zusätzlich Zeitbasis, Trigger, Kopplung, Tastkopf und Offset einstellen.",
    },
    release: {
      title: "Gerät freigeben?",
      description: (n: number) =>
        n === 1
          ? "1 Aufnahme ist noch nicht hochgeladen."
          : `${n} Aufnahmen sind noch nicht hochgeladen.`,
      hint: "Nach dem Freigeben kann jemand anderes das Gerät übernehmen. Deine Aufnahmen bleiben unter „Messdaten“ erhalten, werden aber bei der täglichen Bereinigung gelöscht.",
      upload: "Jetzt hochladen",
      anyway: "Trotzdem freigeben",
      cancel: "Abbrechen",
    },
    leave: {
      title: "Seite verlassen?",
      description: "Eine Aufnahme läuft noch. Seite trotzdem verlassen?",
      stay: "Bleiben",
      leave: "Verlassen",
    },
    stepper: {
      ariaLabel: "Ablauf der Messung",
      optional: "optional",
      state: {
        todo: "offen",
        active: "als Nächstes",
        done: "erledigt",
        blocked: "noch nicht möglich",
      },
      next: "Als Nächstes",
      archiveTitle: "Zum Hochladen ins Archiv",
    },
    banners: {
      lostTitle: "Verbindung zum Gerät verloren",
      lostText: "Sperre abgelaufen.",
      retake: "Erneut übernehmen",
      passiveText: "Dieses Gerät ist bereits in einem anderen Tab geöffnet.",
      passiveAction: "Hier übernehmen",
      eod: (time: string) =>
        `Um ${time} werden alle Geräte freigegeben – lade deine Aufnahmen vorher hoch.`,
      eodIn: (minutes: number) =>
        minutes <= 0
          ? "gleich"
          : minutes === 1
            ? "in 1 Minute"
            : `in ${minutes} Minuten`,
      eodUpload: "Zum Hochladen",
      offline: "Das Gerät ist offline.",
      error: "Das Gerät meldet einen Fehler.",
      lastError: (message: string) => `Letzte Meldung: ${message}`,
      loadFailedTitle: "Gerät konnte nicht geladen werden",
      loadFailedHint:
        "Prüfe, ob die Adresse stimmt und das Backend erreichbar ist.",
    },
    plot: {
      saving: "Wird gespeichert…",
      measurements: "Messwerte",
      showMeasurements: "Messwerte einblenden",
      hideMeasurements: "Messwerte ausblenden",
      region: "Kurvenanzeige",
      actionsRegion: "Aktionen",
      inspectorRegion: "Einstellungen",
      exportName: (deviceId: string, capture: number | null) =>
        capture === null
          ? `${deviceId}_Live`
          : `${deviceId}_Aufnahme-${capture}`,
    },
    layout: {
      collapseActions: "Aktionen einklappen",
      expandActions: "Aktionen ausklappen",
      collapseInspector: "Einstellungen einklappen",
      expandInspector: "Einstellungen ausklappen",
      actionsTitle: "Aktionen",
      settings: "Einstellungen",
      settingsSheetTitle: "Einstellungen",
      settingsSheetDescription: "Änderungen werden sofort am Gerät übernommen.",
      inspectorRail: "Einstellungsbereiche",
      note: "Notiz",
      noteSheetTitle: "Letzte Aufnahme",
      noteSheetDescription: "Notiz schreiben und zum Hochladen auswählen.",
      actionBar: "Messaktionen",
      close: "Schließen",
    },
    /** Reasons shown in the read-only settings banner. */
    inspector: {
      passive:
        "Dieses Gerät wird in einem anderen Tab gesteuert. Übernimm es hier, um Einstellungen zu ändern.",
      lost: "Die Verbindung zum Gerät ist verloren. Übernimm es erneut, um Einstellungen zu ändern.",
    },
  },
} as const;
