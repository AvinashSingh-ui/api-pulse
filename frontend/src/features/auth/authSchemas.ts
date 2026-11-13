import { z } from 'zod';

/**
 * Zod validation schemas for API Pulse Authentication.
 * Reusable, lightweight, and directly connected with Ant Design Form validation.
 */

// ── Atomic Field Schemas ─────────────────────────────────────────────────────

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email address is required')
  .email('Please enter a valid email address (e.g. you@example.com)');

export const loginPasswordSchema = z
  .string()
  .min(1, 'Password is required');

export const registerNameSchema = z
  .string()
  .trim()
  .min(1, 'Full name is required')
  .min(2, 'Full name must be at least 2 characters')
  .max(50, 'Full name cannot exceed 50 characters');

export const registerPasswordSchema = z
  .string()
  .min(1, 'Password is required')
  .min(8, 'Password must be at least 8 characters long')
  .regex(/[A-Za-z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

// ── Complete Form Schemas ───────────────────────────────────────────────────

export const loginSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
  remember: z.boolean().optional().default(true),
});

export const registerSchema = z
  .object({
    name: registerNameSchema,
    email: emailSchema,
    password: registerPasswordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    role: z.enum(['admin', 'developer', 'viewer']).default('developer'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type LoginFormData = z.infer<typeof loginSchema>;
export type RegisterFormData = z.infer<typeof registerSchema>;

/**
 * Ant Design Form validator adapter for a single Zod schema rule.
 * Rejects with a formatted error message that Ant Design displays
 * directly below the input field.
 */
export function createZodRule(schema: z.ZodTypeAny) {
  return {
    validator: async (_: unknown, value: unknown) => {
      const res = schema.safeParse(value);
      if (!res.success) {
        const firstIssue = res.error.issues?.[0];
        return Promise.reject(new Error(firstIssue?.message || 'Invalid field'));
      }
      return Promise.resolve();
    },
  };
}
