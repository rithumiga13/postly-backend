import { ValidationError } from '../lib/errors.js';

/**
 * Returns an Express middleware that validates `req[source]` against `schema`.
 * On failure, forwards a ValidationError with the zod issue list attached.
 *
 * @param {import('zod').ZodTypeAny} schema
 * @param {'body' | 'query' | 'params'} [source='body']
 */
export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(new ValidationError('Validation failed', result.error.issues));
    }
    // Replace with the coerced/stripped value so downstream code can trust the type.
    req[source] = result.data;
    return next();
  };
}
