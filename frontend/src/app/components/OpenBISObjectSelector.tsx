/**
 * Cascading upload-target picker: Gruppe (openBIS project) → Versuch (openBIS
 * collection) → Probe/Objekt (optional). Controlled: the parent owns the
 * selection, which makes it restorable from remembered values.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  listCollections,
  listObjects,
  listProjects,
  type CollectionOption,
  type ObjectOption,
  type ProjectOption,
} from "../../api/openbis_structure";
import { de } from "../../i18n/de";
import { notifyError } from "../../lib/notify";
import { Field } from "./upload/Field";
import { NativeSelect } from "./upload/NativeSelect";

const t = de.archive.wizard.target;

/** What the student picked, plus everything the commit needs (identifiers, group, semester). */
export interface ObjectSelection {
  projectCode: string;
  projectLabel: string;
  /** Group and semester are properties of the project, sent along with the upload. */
  groupName: string;
  semester: string;
  collectionCode: string;
  collectionLabel: string;
  /** Full identifier `/SPACE/PROJECT/EXPERIMENT`, empty until resolved. */
  collectionIdentifier: string;
  objectIdentifier: string;
  objectLabel: string;
}

export const EMPTY_SELECTION: ObjectSelection = {
  projectCode: "",
  projectLabel: "",
  groupName: "",
  semester: "",
  collectionCode: "",
  collectionLabel: "",
  collectionIdentifier: "",
  objectIdentifier: "",
  objectLabel: "",
};

// German weekday prefix → sort order (0–4 = Mon–Fri, 10 = other)
const WEEKDAY_ORDER: Record<string, number> = {
  montag: 0,
  dienstag: 1,
  mittwoch: 2,
  donnerstag: 3,
  freitag: 4,
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  mo: 0,
  di: 1,
  mi: 2,
  do: 3,
  fr: 4,
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
};

function weekdayRank(name: string): number {
  const lower = name.toLowerCase();
  for (const [day, order] of Object.entries(WEEKDAY_ORDER)) {
    if (lower.startsWith(day)) return order;
  }
  return 10;
}

/**
 * Sorts projects by weekday (Mo–Fr first), then alphabetically.
 * @param list - Projects as returned by the backend
 * @returns A sorted copy
 */
export function sortedProjects(list: ProjectOption[]): ProjectOption[] {
  return [...list].sort((a, b) => {
    const da = weekdayRank(a.display_name);
    const db = weekdayRank(b.display_name);
    return da !== db ? da - db : a.display_name.localeCompare(b.display_name);
  });
}

export interface Loaded<T> {
  /** Key (project/collection code) the items belong to. */
  key: string;
  items: T[];
}

/**
 * Fills in labels and identifiers of a selection that only carries codes (as
 * restored from storage) from the loaded lists, and drops entries that no longer
 * exist in openBIS. Resolves all levels in one pass so nothing is overwritten.
 * @param value - Current selection
 * @param projects - Loaded projects, null while loading
 * @param collections - Loaded collections of one project, or null
 * @param objects - Loaded objects of one collection, or null
 * @returns `value` itself when nothing changes, else a resolved copy
 */
export function resolveSelection(
  value: ObjectSelection,
  projects: ProjectOption[] | null,
  collections: Loaded<CollectionOption> | null,
  objects: Loaded<ObjectOption> | null,
): ObjectSelection {
  let next = value;
  if (projects && next.projectCode) {
    const proj = projects.find((p) => p.code === next.projectCode);
    if (!proj) return EMPTY_SELECTION;
    if (next.projectLabel !== proj.display_name) {
      next = {
        ...next,
        projectLabel: proj.display_name,
        groupName: proj.group_name ?? "",
        semester: proj.semester ?? "",
      };
    }
  }
  if (
    next.projectLabel &&
    next.collectionCode &&
    collections?.key === next.projectCode
  ) {
    const col = collections.items.find((c) => c.code === next.collectionCode);
    next = col
      ? next.collectionIdentifier === col.identifier &&
        next.collectionLabel === col.display_name
        ? next
        : {
            ...next,
            collectionLabel: col.display_name,
            collectionIdentifier: col.identifier,
          }
      : {
          ...next,
          collectionCode: "",
          collectionLabel: "",
          collectionIdentifier: "",
          objectIdentifier: "",
          objectLabel: "",
        };
  }
  if (
    next.collectionIdentifier &&
    next.objectIdentifier &&
    objects?.key === next.collectionCode
  ) {
    const obj = objects.items.find(
      (o) => o.identifier === next.objectIdentifier,
    );
    const label = obj ? `${obj.code} (${obj.type})` : "";
    if (!obj) next = { ...next, objectIdentifier: "", objectLabel: "" };
    else if (next.objectLabel !== label) next = { ...next, objectLabel: label };
  }
  return next;
}

interface Props {
  token: string;
  value: ObjectSelection;
  onChange: (next: ObjectSelection) => void;
  /** "merken" pin shown at the group field; the pin covers the whole target. */
  remember?: { pinned: boolean; onToggle: () => void };
  /** Called when a list fails to load, so the parent can point to manual entry. */
  onLoadError?: () => void;
}

/**
 * Three dependent dropdowns for the upload target.
 * @param props - Controlled value, change handler, optional "merken" pin
 * @returns The selector
 */
export function OpenBISObjectSelector({
  token,
  value,
  onChange,
  remember,
  onLoadError,
}: Props) {
  const [projects, setProjects] = useState<ProjectOption[] | null>(null);
  const [collections, setCollections] =
    useState<Loaded<CollectionOption> | null>(null);
  const [objects, setObjects] = useState<Loaded<ObjectOption> | null>(null);

  // Latest callbacks for the async effects (avoids stale closures).
  const onChangeRef = useRef(onChange);
  const onErrorRef = useRef(onLoadError);
  useEffect(() => {
    onChangeRef.current = onChange;
    onErrorRef.current = onLoadError;
  });

  const fail = useCallback((err: unknown, fallback: string) => {
    notifyError(err, fallback, t.loadErrorTitle);
    onErrorRef.current?.();
  }, []);

  useEffect(() => {
    let alive = true;
    listProjects(token)
      .then((list) => alive && setProjects(sortedProjects(list)))
      .catch((err) => {
        if (!alive) return;
        setProjects([]);
        fail(err, t.loadError);
      });
    return () => {
      alive = false;
    };
  }, [token, fail]);

  useEffect(() => {
    const code = value.projectCode;
    if (!code) return;
    let alive = true;
    listCollections(token, code)
      .then(
        (items) =>
          alive &&
          setCollections({
            key: code,
            items: items.sort((a, b) =>
              a.display_name.localeCompare(b.display_name),
            ),
          }),
      )
      .catch((err) => {
        if (!alive) return;
        setCollections({ key: code, items: [] });
        fail(err, t.loadError);
      });
    return () => {
      alive = false;
    };
  }, [token, value.projectCode, fail]);

  useEffect(() => {
    const code = value.collectionCode;
    if (!code) return;
    let alive = true;
    listObjects(token, code)
      .then((items) => alive && setObjects({ key: code, items }))
      .catch((err) => {
        if (!alive) return;
        setObjects({ key: code, items: [] });
        fail(err, t.loadError);
      });
    return () => {
      alive = false;
    };
  }, [token, value.collectionCode, fail]);

  // Resolve remembered codes into labels/identifiers once the lists are in.
  useEffect(() => {
    const next = resolveSelection(value, projects, collections, objects);
    if (next !== value) onChangeRef.current(next);
  }, [value, projects, collections, objects]);

  const collectionItems =
    collections?.key === value.projectCode ? collections.items : null;
  const objectItems =
    objects?.key === value.collectionCode ? objects.items : null;

  const pickProject = (code: string) => {
    const proj = projects?.find((p) => p.code === code);
    onChange(
      proj
        ? {
            ...EMPTY_SELECTION,
            projectCode: code,
            projectLabel: proj.display_name,
            groupName: proj.group_name ?? "",
            semester: proj.semester ?? "",
          }
        : EMPTY_SELECTION,
    );
  };

  const pickCollection = (code: string) => {
    const col = collectionItems?.find((c) => c.code === code);
    onChange({
      ...value,
      collectionCode: col ? code : "",
      collectionLabel: col?.display_name ?? "",
      collectionIdentifier: col?.identifier ?? "",
      objectIdentifier: "",
      objectLabel: "",
    });
  };

  const pickObject = (identifier: string) => {
    const obj = objectItems?.find((o) => o.identifier === identifier);
    onChange({
      ...value,
      objectIdentifier: obj ? identifier : "",
      objectLabel: obj ? `${obj.code} (${obj.type})` : "",
    });
  };

  const loading = (text: string, isLoading: boolean) =>
    isLoading ? t.loading : text;

  return (
    <div className="flex flex-col gap-4">
      <Field
        htmlFor="target-group"
        label={t.group}
        required
        help={t.groupHelp}
        remember={remember}
      >
        <NativeSelect
          id="target-group"
          value={value.projectCode}
          disabled={projects === null}
          onChange={(e) => pickProject(e.target.value)}
        >
          <option value="">
            {loading(t.groupPlaceholder, projects === null)}
          </option>
          {projects?.map((p) => (
            <option key={p.code} value={p.code}>
              {p.display_name}
            </option>
          ))}
        </NativeSelect>
      </Field>

      {projects?.length === 0 && <p className="help-text">{t.noGroups}</p>}

      <Field
        htmlFor="target-experiment"
        label={t.experiment}
        required
        help={t.experimentHelp}
      >
        <NativeSelect
          id="target-experiment"
          value={value.collectionCode}
          disabled={!value.projectCode || collectionItems === null}
          onChange={(e) => pickCollection(e.target.value)}
        >
          <option value="">
            {loading(
              t.experimentPlaceholder,
              !!value.projectCode && collectionItems === null,
            )}
          </option>
          {collectionItems?.map((c) => (
            <option key={c.code} value={c.code}>
              {c.display_name}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <Field
        htmlFor="target-object"
        label={t.object}
        optional
        help={t.objectHelp}
      >
        <NativeSelect
          id="target-object"
          value={value.objectIdentifier}
          disabled={!value.collectionCode || objectItems === null}
          onChange={(e) => pickObject(e.target.value)}
        >
          <option value="">
            {loading(
              t.objectPlaceholder,
              !!value.collectionCode && objectItems === null,
            )}
          </option>
          {objectItems?.map((o) => (
            <option key={o.identifier} value={o.identifier}>
              {o.code} ({o.type})
            </option>
          ))}
        </NativeSelect>
      </Field>
    </div>
  );
}
