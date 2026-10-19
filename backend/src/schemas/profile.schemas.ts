import { z } from 'zod';
import { sanitizedString } from './validation.schemas';

export const updateProfileBody = z
  .object({
    displayName: sanitizedString(1, 50).optional(),
    bio: sanitizedString(0, 500).optional(),
    avatarUrl: z.string().url('avatarUrl must be a valid URL').optional(),
    socialLinks: z
      .object({
        twitter: z.string().url().optional().or(z.literal('')),
        instagram: z.string().url().optional().or(z.literal('')),
        website: z.string().url().optional().or(z.literal('')),
      })
      .optional(),
  })
  .refine(
    (d) =>
      d.displayName !== undefined ||
      d.bio !== undefined ||
      d.avatarUrl !== undefined ||
      d.socialLinks !== undefined,
    { message: 'At least one field must be provided' },
  );
