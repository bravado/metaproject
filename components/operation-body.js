export function operationBodyFromResource(operation, resource) {
  if (!operation?.requestBody) return undefined;
  if (resource == null || typeof resource !== 'object' || Array.isArray(resource)) return resource;

  const parameterNames = new Set(
    (operation.parameters || [])
      .map(parameter => parameter?.name)
      .filter(Boolean)
  );

  return Object.fromEntries(
    Object.entries(resource).filter(([name]) => !parameterNames.has(name))
  );
}
