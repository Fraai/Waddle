import { z } from 'zod';

export const requiredText = (message: string) => z.string().trim().min(1, message);
export const idParam = z.coerce.number().int().positive();
export const dateString = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a valid date (YYYY-MM-DD)');

export const createProjectSchema = z.object({
  name: requiredText('Name is required'),
});
export const renameProjectSchema = z.object({
  projectId: idParam,
  name: requiredText('Name is required'),
});
export const deleteProjectSchema = z.object({ projectId: idParam });
export const reorderProjectsSchema = z.object({ orderedIds: z.array(idParam).min(1) });
