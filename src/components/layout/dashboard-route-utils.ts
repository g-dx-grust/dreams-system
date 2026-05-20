export function isTemplateMappingWorkspace(pathname: string) {
  return /^\/templates\/\d+\/mapping\/?$/.test(pathname);
}
