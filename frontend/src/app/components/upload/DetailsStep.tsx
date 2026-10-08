import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { de } from "../../../i18n/de";
import { useAppConfig } from "../../hooks/useAppConfig";
import { Field, inputClass } from "./Field";
import { NativeSelect } from "./NativeSelect";
import type { MetaField, RememberKey, WizardState } from "./types";
import type { WizardAction } from "./wizardReducer";

const t = de.archive.wizard.details;

/** Used until `GET /config` answers or when it is unreachable. */
export const FALLBACK_LAB_COURSES = [
  { value: "GP1", label: "GP1 – Grundpraktikum 1" },
  { value: "GP2", label: "GP2 – Grundpraktikum 2" },
  { value: "GP3", label: "GP3 – Grundpraktikum 3" },
  { value: "Projektlabor", label: "Projektlabor" },
];

interface DetailsStepProps {
  state: WizardState;
  dispatch: (action: WizardAction) => void;
}

/**
 * Step ③: Praktikum, Versuchstitel, Beschreibung, Messobjekt, Notizen — each with a "merken" pin.
 * @param props - See {@link DetailsStepProps}
 * @returns The details form
 */
export function DetailsStep({ state, dispatch }: DetailsStepProps) {
  const config = useAppConfig();
  const configured = config?.lab_courses;
  const courses =
    configured && configured.length > 0 ? configured : FALLBACK_LAB_COURSES;
  // A remembered course that is no longer offered stays selectable instead of silently vanishing.
  const options =
    state.meta.labCourse &&
    !courses.some((c) => c.value === state.meta.labCourse)
      ? [
          ...courses,
          { value: state.meta.labCourse, label: state.meta.labCourse },
        ]
      : courses;

  const set = (field: MetaField) => (value: string) =>
    dispatch({ type: "setMeta", field, value });
  const pin = (key: RememberKey) => ({
    pinned: state.pinned[key],
    onToggle: () => dispatch({ type: "togglePin", key }),
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-base font-semibold">{t.heading}</h3>
        <p className="help-text">{t.intro}</p>
      </div>

      <Field
        htmlFor="meta-course"
        label={t.labCourse}
        required
        help={t.labCourseHelp}
        remember={pin("labCourse")}
      >
        <NativeSelect
          id="meta-course"
          value={state.meta.labCourse}
          onChange={(e) => set("labCourse")(e.target.value)}
        >
          <option value="">{t.labCoursePlaceholder}</option>
          {options.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <Field
        htmlFor="meta-title"
        label={t.expTitle}
        required
        help={t.expTitleHelp}
        remember={pin("expTitle")}
      >
        <Input
          id="meta-title"
          className={inputClass}
          value={state.meta.expTitle}
          placeholder={t.expTitlePlaceholder}
          onChange={(e) => set("expTitle")(e.target.value)}
        />
      </Field>

      <Field
        htmlFor="meta-description"
        label={t.expDescription}
        optional
        help={t.expDescriptionHelp}
        remember={pin("expDescription")}
      >
        <Textarea
          id="meta-description"
          rows={2}
          className={inputClass}
          value={state.meta.expDescription}
          placeholder={t.expDescriptionPlaceholder}
          onChange={(e) => set("expDescription")(e.target.value)}
        />
      </Field>

      <Field
        htmlFor="meta-dut"
        label={t.deviceUnderTest}
        optional
        help={t.deviceUnderTestHelp}
        remember={pin("deviceUnderTest")}
      >
        <Input
          id="meta-dut"
          className={inputClass}
          value={state.meta.deviceUnderTest}
          placeholder={t.deviceUnderTestPlaceholder}
          onChange={(e) => set("deviceUnderTest")(e.target.value)}
        />
      </Field>

      <Field
        htmlFor="meta-notes"
        label={t.notes}
        optional
        help={t.notesHelp}
        remember={pin("notes")}
      >
        <Textarea
          id="meta-notes"
          rows={2}
          className={inputClass}
          value={state.meta.notes}
          placeholder={t.notesPlaceholder}
          onChange={(e) => set("notes")(e.target.value)}
        />
      </Field>
    </div>
  );
}
