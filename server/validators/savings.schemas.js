'use strict';

const { z } = require('zod');

const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value;
  }, 'Date must be a valid calendar date.');

const accountSchema = z.string()
  .trim()
  .min(1, 'Member account number is required.')
  .max(64, 'Member account number is too long.');

const amountSchema = z.coerce.number()
  .finite('Amount must be a valid number.')
  .positive('Amount must be greater than zero.')
  .max(1_000_000_000_000, 'Amount is too large.')
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7, {
    message: 'Amount can have no more than two decimal places.'
  });

const optionalText = (field, maxLength) => z.union([
  z.string().trim().max(maxLength, `${field} is too long.`),
  z.null()
]).optional();

const createSavingsSchema = z.object({
  acc: accountSchema,
  amt: amountSchema,
  date: dateSchema,
  w: z.boolean().default(false),
  ch: optionalText('Channel', 100),
  slip: optionalText('Slip reference', 128),
  rm: optionalText('Remarks', 1_000)
}).strict();

const listSavingsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  acc: accountSchema.optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional()
})
  .strict()
  .refine(
    ({ from, to }) => !from || !to || from <= to,
    { message: 'from must not be later than to.' }
  );

const savingsIdParamsSchema = z.object({
  id: z.string()
    .trim()
    .min(1, 'Transaction ID is required.')
    .max(128, 'Transaction ID is too long.')
}).strict();

module.exports = {
  createSavingsSchema,
  listSavingsQuerySchema,
  savingsIdParamsSchema
};