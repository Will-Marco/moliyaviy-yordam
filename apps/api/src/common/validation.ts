import { BadRequestException, ConflictException, ValidationError, ValidationPipe } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { ValidateIf } from 'class-validator';

/** Trims string input; leaves other values untouched. */
export const Trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** Field may be omitted (PATCH), but if present it must be valid — `null` is not allowed. */
export const OptionalNonNull = () => ValidateIf((_, value) => value !== undefined);

function collect(errors: ValidationError[], prefix = ''): Record<string, string[]> {
  return errors.reduce<Record<string, string[]>>((acc, error) => {
    const key = prefix ? `${prefix}.${error.property}` : error.property;
    if (error.constraints) acc[key] = Object.values(error.constraints);
    if (error.children?.length) Object.assign(acc, collect(error.children, key));
    return acc;
  }, {});
}

/** Responds with `{ message, errors: { field: [messages] } }` so the UI can mark fields. */
export const validationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  exceptionFactory: (errors) =>
    new BadRequestException({
      statusCode: 400,
      message: "Ma'lumotlar noto'g'ri",
      errors: collect(errors),
    }),
});

/** Field-level error with the same shape as the validation pipe, for rules that need the database. */
export function fieldErrors(errors: Record<string, string>, status: 400 | 409 = 400) {
  const body = {
    statusCode: status,
    message: status === 409 ? Object.values(errors)[0] : "Ma'lumotlar noto'g'ri",
    errors: Object.fromEntries(Object.entries(errors).map(([field, message]) => [field, [message]])),
  };
  return status === 409 ? new ConflictException(body) : new BadRequestException(body);
}
