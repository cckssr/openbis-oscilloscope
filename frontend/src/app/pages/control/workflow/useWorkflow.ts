import { useDeviceSessionSelector, selectWorkflow, type Workflow } from "../../../state/deviceSession";

const sameWorkflow = (a: Workflow, b: Workflow) =>
  a.next === b.next && a.steps.length === b.steps.length && a.steps.every((s, i) => s.id === b.steps[i].id && s.state === b.steps[i].state);

/**
 * Workflow steps and the "Als Nächstes" hint of a device session.
 * @param deviceId - The device
 * @returns The workflow (stable while nothing visible changes)
 */
export function useWorkflow(deviceId: string): Workflow {
  return useDeviceSessionSelector(deviceId, selectWorkflow, sameWorkflow);
}
