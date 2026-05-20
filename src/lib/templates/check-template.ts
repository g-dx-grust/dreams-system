export const TEMPLATE_DEBUG_MARKER = "[toyohashi-mapping-check]";

export function isDebugTemplateDescription(
  description: string | null | undefined,
): boolean {
  return String(description ?? "").includes(TEMPLATE_DEBUG_MARKER);
}
