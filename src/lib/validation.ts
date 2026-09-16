import { z } from 'zod';

export const requiredText = (message: string) => z.string().trim().min(1, message);
export const idParam = z.coerce.number().int().positive();
// ponytail: a blank <input type="date"> submits "" via FormData, not absence
// of the field — preprocess maps "" to undefined, and .optional() has to be
// on the wrapped schema itself (not just chained outside the preprocess) or
// z.string() rejects that undefined with invalid_type.
export const dateString = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a valid date (YYYY-MM-DD)').optional(),
);

export const createProjectSchema = z.object({
  name: requiredText('Name is required'),
});
export const renameProjectSchema = z.object({
  projectId: idParam,
  name: requiredText('Name is required'),
});
export const deleteProjectSchema = z.object({ projectId: idParam });
export const reorderProjectsSchema = z.object({ orderedIds: z.array(idParam).min(1) });

export const createSectionSchema = z.object({
  projectId: idParam,
  name: requiredText('Name is required'),
});
export const renameSectionSchema = z.object({
  sectionId: idParam,
  name: requiredText('Name is required'),
});
export const deleteSectionSchema = z.object({ sectionId: idParam });
export const reorderSectionsSchema = z.object({
  projectId: idParam,
  orderedIds: z.array(idParam).min(1),
});

export const createTaskSchema = z.object({
  projectId: idParam,
  sectionId: idParam.optional(),
  parentTaskId: idParam.optional(),
  title: requiredText('Title is required'),
  dueDate: dateString,
  priority: z.coerce.number().int().min(1).max(4).optional().default(4),
});
export const updateTaskSchema = z.object({
  taskId: idParam,
  title: requiredText('Title is required').optional(),
  dueDate: dateString.nullable(),
  priority: z.coerce.number().int().min(1).max(4).optional(),
  projectId: idParam.optional(),
  sectionId: idParam.nullable().optional(),
});
export const toggleTaskDoneSchema = z.object({ taskId: idParam });
export const deleteTaskSchema = z.object({ taskId: idParam });
export const reorderTasksSchema = z.object({
  projectId: idParam,
  sectionId: idParam.nullable().optional(),
  orderedIds: z.array(idParam).min(1),
});
