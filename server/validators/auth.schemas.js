'use strict';

const { z } = require('zod');

const identifierSchema = z
  .string()
  .trim()
  .min(1, 'Email is required.')
  .max(254, 'Email is too long.')
  .email('Enter a valid email address.')
  .transform((value) => value.toLowerCase());

const passwordSchema = z
  .string()
  .min(1, 'Password is required.')
  .max(1024, 'Password is too long.');

const newPasswordSchema = z
  .string()
  .min(12, 'New password must be at least 12 characters.')
  .max(1024, 'New password is too long.');

const loginSchema = z.object({
  identifier: identifierSchema,
  password: passwordSchema
}).strict();

const updateCredentialsSchema = z.object({
  email: identifierSchema.optional(),
  password: newPasswordSchema.optional()
})
  .strict()
  .refine(
    (credentials) => credentials.email !== undefined || credentials.password !== undefined,
    { message: 'Provide a new email, password, or both.' }
  );

const changePasswordSchema = z.object({
  currentPassword: passwordSchema,
  newPassword: newPasswordSchema
}).strict();

module.exports = {
  loginSchema,
  updateCredentialsSchema,
  changePasswordSchema
};