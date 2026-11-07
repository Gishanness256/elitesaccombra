'use strict';

const { z } = require('zod');

const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value;
  }, 'Date must be a valid calendar date.');

const optionalText = (field, maxLength) => z.union([
  z.string().trim().max(maxLength, `${field} must be at most ${maxLength} characters.`),
  z.null()
]).optional();

const requiredText = (field, maxLength) => z.string()
  .trim()
  .min(1, `${field} is required.`)
  .max(maxLength, `${field} must be at most ${maxLength} characters.`);

const accountIdSchema = z.string()
  .trim()
  .min(1, 'Member account is required.')
  .max(64, 'Member account is too long.');

const amountSchema = z.coerce.number()
  .finite('Amount must be a valid number.')
  .positive('Amount must be greater than zero.')
  .max(1_000_000_000_000, 'Amount is too large.')
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7, {
    message: 'Amount can have no more than two decimal places.'
  });

const monthlyRateSchema = z.coerce.number()
  .finite('Monthly interest rate must be a valid number.')
  .gt(0, 'Monthly interest rate must be greater than zero.')
  .max(30, 'Monthly interest rate cannot exceed 30%.')
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7, {
    message: 'Monthly interest rate can have no more than two decimal places.'
  });

const createLoanRequestSchema = z.object({
  applicantType: z.enum(['member', 'non-member']),
  accountId: accountIdSchema.optional(),
  applicantName: requiredText('Applicant name', 200),
  telephone: requiredText('Telephone number', 40),
  email: z.union([
    z.string().trim().max(254).email('Enter a valid email address.').transform((value) => value.toLowerCase()),
    z.literal(''),
    z.null()
  ]).optional(),
  address: optionalText('Address', 500),
  nin: optionalText('National ID number', 100),
  category: requiredText('Loan category', 100),
  termMonths: z.coerce.number().int().min(1).max(60),
  amount: amountSchema,
  monthlyRate: monthlyRateSchema,
  date: dateSchema
})
  .strict()
  .superRefine((request, context) => {
    if (request.applicantType === 'member' && !request.accountId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['accountId'],
        message: 'A member account is required for member loan requests.'
      });
    }

    if (request.applicantType === 'non-member' && request.accountId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['accountId'],
        message: 'Non-member loan requests must not include a member account.'
      });
    }
  });

const decideLoanRequestSchema = z.object({
  status: z.enum(['Approved', 'Rejected', 'On Hold']),
  remark: optionalText('Remark', 2_000)
}).strict();

const listLoanRequestsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['Pending', 'Approved', 'Rejected', 'On Hold']).optional()
}).strict();

const listLoansQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['Active', 'Paid', 'Closed', 'Defaulted']).optional(),
  accountId: accountIdSchema.optional()
}).strict();

const createRepaymentSchema = z.object({
  date: dateSchema,
  amount: amountSchema,
  type: z.string().trim().min(1).max(100).default('Installment')
}).strict();

const loanIdParamsSchema = z.object({
  loanId: z.string().trim().min(1).max(128)
}).strict();

const requestIdParamsSchema = z.object({
  requestId: z.string().trim().min(1).max(128)
}).strict();

module.exports = {
  createLoanRequestSchema,
  decideLoanRequestSchema,
  listLoanRequestsQuerySchema,
  listLoansQuerySchema,
  createRepaymentSchema,
  loanIdParamsSchema,
  requestIdParamsSchema
};