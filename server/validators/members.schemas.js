'use strict';

const { z } = require('zod');

const requiredText = (label, max = 200) =>
  z.string()
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be at most ${max} characters.`);

const optionalText = (label, max = 500) =>
  z.union([
    z.string().trim().max(max, `${label} must be at most ${max} characters.`),
    z.null()
  ]).optional();

const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must use YYYY-MM-DD format.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value;
  }, 'Date of birth must be a valid calendar date.')
  .refine((value) => value <= new Date().toISOString().slice(0, 10),
    'Date of birth cannot be in the future.');

const emailSchema = z.union([
  z.string()
    .trim()
    .max(254, 'Email must be at most 254 characters.')
    .email('Enter a valid email address.')
    .transform((value) => value.toLowerCase()),
  z.literal(''),
  z.null()
]).optional();

const memberFields = {
  first: requiredText('First name', 100),
  last: requiredText('Last name', 100),
  dob: dateSchema,
  addr: requiredText('Address', 500),
  nin: requiredText('National ID number', 100),
  tel: requiredText('Telephone number', 40),
  email: emailSchema,
  photo: optionalText('Photo', 2_000_000)
};

const createMemberSchema = z.object(memberFields).strict();

const updateMemberSchema = z.object({
  first: requiredText('First name', 100).optional(),
  last: requiredText('Last name', 100).optional(),
  dob: dateSchema.optional(),
  addr: requiredText('Address', 500).optional(),
  nin: requiredText('National ID number', 100).optional(),
  tel: requiredText('Telephone number', 40).optional(),
  email: emailSchema,
  photo: optionalText('Photo', 2_000_000)
})
  .strict()
  .refine((fields) => Object.keys(fields).length > 0, {
    message: 'Provide at least one member field to update.'
  });

const memberIdParamsSchema = z.object({
  id: z.string().trim().min(1, 'Member ID is required.').max(128)
}).strict();

const listMembersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
}).strict();

module.exports = {
  createMemberSchema,
  updateMemberSchema,
  memberIdParamsSchema,
  listMembersQuerySchema
};