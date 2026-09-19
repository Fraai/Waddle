import { z } from 'zod';

export const requiredText = (message: string) => z.string().trim().min(1, message);
export const idParam = z.coerce.number().int().positive();
// ponytail: a blank <input type="date"> submits "" via FormData, not absence
// of the field — preprocess maps "" to undefined, and .optional() has to be
// on the wrapped schema itself (not just chained outside the preprocess) or
// z.string() rejects that undefined with invalid_type.
//
// Also maps null: Astro's accept:'form' parser decides whether a missing
// field becomes `undefined` or `null` by checking `instanceof ZodOptional`
// on the schema as written in the object shape — but z.preprocess() wraps
// this schema in a ZodPipe, so that check misses it and every blank/missing
// due-date field arrives here as `null`, not `undefined` or "". Without this,
// z.string().optional() rejects null with "invalid_type", and creating a
// task with no due date fails outright (confirmed: this shipped broken).
export const dateString = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a valid date (YYYY-MM-DD)').optional(),
);

export const projectType = z.enum(['private', 'work']);

export const createProjectSchema = z.object({
  name: requiredText('Name is required'),
  type: projectType.optional(),
});
export const renameProjectSchema = z.object({
  projectId: idParam,
  name: requiredText('Name is required'),
});
export const deleteProjectSchema = z.object({ projectId: idParam });
export const reorderProjectsSchema = z.object({ orderedIds: z.array(idParam).min(1) });
export const setProjectTypeSchema = z.object({ projectId: idParam, type: projectType });

// Fixed palette rather than a free-form colour picker — keeps the input
// small enough to validate with an enum (a raw string would flow into a
// style attribute). 64 evenly-spaced hues (same HSL spacing idea as
// projectHue()'s fallback, just fixed into a pickable set) shown as a grid
// popover in sidebar.ts, not a click-to-cycle (64 clicks would be unusable).
export const PROJECT_COLORS = [
  '#d74242', '#d75042', '#d75e42', '#d76c42', '#d77a42', '#d78842', '#d79642', '#d7a442',
  '#d7b242', '#d7c042', '#d7ce42', '#d2d742', '#c4d742', '#b6d742', '#a8d742', '#9ad742',
  '#8cd742', '#7ed742', '#70d742', '#62d742', '#54d742', '#46d742', '#42d74b', '#42d759',
  '#42d767', '#42d775', '#42d783', '#42d791', '#42d79f', '#42d7ad', '#42d7bb', '#42d7c9',
  '#42d7d7', '#42c9d7', '#42bbd7', '#42add7', '#429fd7', '#4291d7', '#4283d7', '#4275d7',
  '#4267d7', '#4259d7', '#424bd7', '#4642d7', '#5442d7', '#6242d7', '#7042d7', '#7e42d7',
  '#8c42d7', '#9a42d7', '#a842d7', '#b642d7', '#c442d7', '#d242d7', '#d742ce', '#d742c0',
  '#d742b2', '#d742a4', '#d74296', '#d74288', '#d7427a', '#d7426c', '#d7425e', '#d74250',
] as const;
export const setProjectColorSchema = z.object({ projectId: idParam, color: z.enum(PROJECT_COLORS) });

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

// updateTask takes a plain JS object (no accept:'form'), so unlike
// dateString above there's no FormData null/undefined quirk to work around
// here — the caller decides null (clear it) vs undefined (leave it alone).
export const descriptionField = z.preprocess((v) => {
  if (v == null) return v;
  const trimmed = String(v).trim();
  return trimmed === '' ? null : trimmed;
}, z.string().max(2000).nullable().optional());

// A bare "example.com" is a reasonable thing to type into a link field —
// assume https:// rather than reject it.
export const hrefField = z.preprocess((v) => {
  if (v == null) return v;
  const trimmed = String(v).trim();
  if (trimmed === '') return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}, z.string().url('Must be a valid URL').max(2000).nullable().optional());

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
  description: descriptionField,
  href: hrefField,
});
export const toggleTaskDoneSchema = z.object({ taskId: idParam });
export const deleteTaskSchema = z.object({ taskId: idParam });
export const reorderTasksSchema = z.object({
  projectId: idParam,
  sectionId: idParam.nullable().optional(),
  orderedIds: z.array(idParam).min(1),
});
