/** aria-describedby for an input rendered inside <FormField>: the error wins over the hint. */
export const describedBy = (id: string, error?: string, hint?: string) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined

