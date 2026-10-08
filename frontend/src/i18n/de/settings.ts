/** German UI strings: settings inspector (channels, timebase, trigger). */
export const settings = {
  inspector: {
    ariaLabel: "Geräteeinstellungen",
    loading: "Einstellungen werden geladen…",
    notLoaded: "Die Einstellungen des Geräts sind noch nicht geladen.",
    notLoadedReadOnly: "Die Einstellungen werden angezeigt, sobald du das Gerät übernommen hast.",
    noGroups: "Für dieses Gerät sind keine Einstellungen verfügbar.",
    readOnlyBanner: "Gerät übernehmen, um Einstellungen zu ändern",
    takeControl: "Gerät übernehmen",
    readOnlyTitle: "Nur lesbar – Gerät übernehmen, um Einstellungen zu ändern",
  },
  /** Per-control apply status (settings are applied immediately). */
  status: {
    applying: "wird übernommen …",
    applied: "✓ übernommen",
    errorPrefix: "⚠",
    errorFallback: "Einstellung konnte nicht übernommen werden.",
  },
  help: (label: string) => `Hilfe zu ${label}`,
  /** Per-channel section. */
  channel: {
    on: "an",
    off: "aus",
    toggleAria: (label: string) => `${label} ein- oder ausschalten`,
    expand: (label: string) => `${label} ein- oder ausklappen`,
    probe: (factor: number) => `${factor}×`,
    countOn: (on: number, total: number) => `${on} von ${total} an`,
  },
  groups: {
    channels: {
      label: "Kanäle",
      enabled: {
        label: "Kanal an/aus",
        help: "Nur eingeschaltete Kanäle werden angezeigt und bei „Aufnahme speichern“ gespeichert.",
      },
      scale: {
        label: "Vertikale Skalierung",
        help: "Volt pro Division (V/div): Wie viele Volt ein Kästchen der Anzeige in der Höhe entspricht. Kleinere Werte vergrößern das Signal.",
      },
      offset: {
        label: "Vertikaler Offset",
        help: "Verschiebt die Kurve nach oben oder unten. Die Schrittweite beträgt ein Zehntel von V/div.",
      },
      coupling: {
        label: "Kopplung",
        help: "Wie das Signal an den Eingang gekoppelt wird: AC blockiert den Gleichanteil, DC zeigt alles, GND zeigt die Nulllinie.",
        options: {
          AC: { label: "AC", help: "AC: Gleichanteil wird blockiert, nur Wechselspannung sichtbar." },
          DC: { label: "DC", help: "DC: Das Signal wird vollständig angezeigt." },
          GND: { label: "GND", help: "GND: Eingang an Masse, zeigt die Nulllinie." },
        },
      },
      probe: {
        label: "Tastkopf",
        help: "Dämpfungsfaktor der Tastleitung. Muss mit dem Schalter am Tastkopf übereinstimmen, sonst stimmen die Spannungswerte nicht.",
      },
    },
    timebase: {
      label: "Zeitbasis",
      scale: {
        label: "Zeitbasis",
        help: "Zeit pro Division (s/div): 10 Divisionen entsprechen der vollen Bildbreite.",
      },
      offset: {
        label: "Zeitlicher Offset",
        help: "Horizontale Verschiebung des Trigger-Referenzpunkts. Die Schrittweite beträgt ein Zehntel von s/div.",
      },
      summaryOffset: (offset: string) => `Versatz ${offset}`,
    },
    trigger: {
      label: "Trigger",
      mode: {
        label: "Triggermodus",
        help: "Legt fest, wann das Oszilloskop ein Bild aufnimmt.",
        options: {
          AUTO: { label: "Auto", help: "Auto: zeigt auch ohne Trigger an." },
          NORMAL: {
            label: "Normal",
            help: "Normal: wartet auf einen Trigger und zeigt sonst das letzte Bild.",
          },
          SINGLE: { label: "Single", help: "Single: nimmt genau ein Bild auf und stoppt." },
        },
      },
      source: {
        label: "Triggerquelle",
        help: "Kanal, auf den das Triggersystem reagiert.",
      },
      slope: {
        label: "Triggerflanke",
        help: "Bei welcher Flanke des Signals der Trigger auslöst.",
        options: {
          RISE: {
            label: "↑ steigend",
            help: "Der Trigger löst aus, wenn das Signal die Schwelle von unten nach oben durchläuft.",
          },
          FALL: {
            label: "↓ fallend",
            help: "Der Trigger löst aus, wenn das Signal die Schwelle von oben nach unten durchläuft.",
          },
          EITHER: {
            label: "↕ beide",
            help: "Der Trigger löst bei steigender und fallender Flanke aus.",
          },
        },
      },
      level: {
        label: "Triggerpegel",
        help: "Spannungsschwelle, bei der der Trigger auslöst. Die Schrittweite beträgt ein Zehntel von V/div der Triggerquelle.",
      },
      slopeSymbol: { RISE: "↑", FALL: "↓", EITHER: "↕" },
    },
  },
} as const;
