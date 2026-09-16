// Mirrors the slice of `astro:actions` the middleware uses. Tests simulate an
// incoming form action by setting `__action` on the mock context.
export function getActionContext(context: any) {
  return {
    action: context.__action,
    setActionResult: (name: string, result: unknown) => {
      context.__actionResult = { name, result };
    },
    serializeActionResult: (result: unknown) => result,
  };
}
