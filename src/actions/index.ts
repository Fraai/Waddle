import { defineAction, ActionError } from 'astro:actions';
import { env } from 'cloudflare:workers';
import * as db from '../lib/db';
import { withSlugs } from '../lib/slug';
import {
  createProjectSchema, renameProjectSchema, deleteProjectSchema, reorderProjectsSchema, setProjectTypeSchema,
  setProjectColorSchema,
  createSectionSchema, renameSectionSchema, deleteSectionSchema, reorderSectionsSchema,
  createTaskSchema, updateTaskSchema, toggleTaskDoneSchema, deleteTaskSchema, reorderTasksSchema,
} from '../lib/validation';

// Slugs aren't stored (see lib/slug.ts) — recomputed from the full project
// list so a rename immediately gets its new, correctly-disambiguated slug.
async function projectWithSlug(userId: number, projectId: number) {
  const projects = await db.listProjects(env.DB, userId);
  const withSlug = withSlugs(projects).find((p) => p.id === projectId);
  if (!withSlug) throw new ActionError({ code: 'NOT_FOUND', message: 'Project not found' });
  return withSlug;
}

function requireUser(context: { locals: App.Locals }) {
  if (!context.locals.user) throw new ActionError({ code: 'UNAUTHORIZED', message: 'Sign in required' });
  return context.locals.user;
}

async function wrapNotFound<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof db.NotFoundError) {
      throw new ActionError({ code: 'NOT_FOUND', message: err.message });
    }
    throw err;
  }
}

export const server = {
  createProject: defineAction({
    accept: 'form',
    input: createProjectSchema,
    handler: async (input, context) => {
      const user = requireUser(context);
      const project = await db.createProject(env.DB, user.id, input.name, input.type);
      return projectWithSlug(user.id, project.id);
    },
  }),
  setProjectType: defineAction({
    input: setProjectTypeSchema,
    handler: async (input, context) => {
      const user = requireUser(context);
      await wrapNotFound(() => db.setProjectType(env.DB, user.id, input.projectId, input.type));
      return { success: true };
    },
  }),
  setProjectColor: defineAction({
    input: setProjectColorSchema,
    handler: async (input, context) => {
      const user = requireUser(context);
      await wrapNotFound(() => db.setProjectColor(env.DB, user.id, input.projectId, input.color));
      return { success: true };
    },
  }),
  renameProject: defineAction({
    input: renameProjectSchema,
    handler: async (input, context) => {
      const user = requireUser(context);
      await wrapNotFound(() => db.renameProject(env.DB, user.id, input.projectId, input.name));
      return projectWithSlug(user.id, input.projectId);
    },
  }),
  deleteProject: defineAction({
    input: deleteProjectSchema,
    handler: async (input, context) => {
      const user = requireUser(context);
      await wrapNotFound(() => db.deleteProject(env.DB, user.id, input.projectId));
      return { success: true };
    },
  }),
  reorderProjects: defineAction({
    input: reorderProjectsSchema,
    handler: async (input, context) => {
      const user = requireUser(context);
      await wrapNotFound(() => db.reorderProjects(env.DB, user.id, input.orderedIds));
      return { success: true };
    },
  }),
  createSection: defineAction({
    accept: 'form',
    input: createSectionSchema,
    handler: async (input, context) => {
      const user = requireUser(context);
      return wrapNotFound(() => db.createSection(env.DB, user.id, input.projectId, input.name));
    },
  }),
  renameSection: defineAction({
    input: renameSectionSchema,
    handler: async (input, context) => {
      const user = requireUser(context);
      await wrapNotFound(() => db.renameSection(env.DB, user.id, input.sectionId, input.name));
      return { success: true };
    },
  }),
  deleteSection: defineAction({
    input: deleteSectionSchema,
    handler: async (input, context) => {
      const user = requireUser(context);
      await wrapNotFound(() => db.deleteSection(env.DB, user.id, input.sectionId));
      return { success: true };
    },
  }),
  reorderSections: defineAction({
    input: reorderSectionsSchema,
    handler: async (input, context) => {
      const user = requireUser(context);
      await wrapNotFound(() => db.reorderSections(env.DB, user.id, input.projectId, input.orderedIds));
      return { success: true };
    },
  }),
  createTask: defineAction({
    accept: 'form',
    input: createTaskSchema,
    handler: async (input, context) => {
      const user = requireUser(context);
      return wrapNotFound(() => db.createTask(env.DB, user.id, {
        projectId: input.projectId,
        sectionId: input.sectionId ?? null,
        parentTaskId: input.parentTaskId ?? null,
        title: input.title,
        dueDate: input.dueDate ?? null,
        priority: input.priority,
      }));
    },
  }),
  updateTask: defineAction({
    input: updateTaskSchema,
    handler: async (input, context) => {
      const user = requireUser(context);
      const { taskId, ...rest } = input;
      await wrapNotFound(() => db.updateTask(env.DB, user.id, taskId, rest));
      return { success: true };
    },
  }),
  toggleTaskDone: defineAction({
    input: toggleTaskDoneSchema,
    handler: async (input, context) => {
      const user = requireUser(context);
      return wrapNotFound(() => db.toggleTaskDone(env.DB, user.id, input.taskId));
    },
  }),
  deleteTask: defineAction({
    input: deleteTaskSchema,
    handler: async (input, context) => {
      const user = requireUser(context);
      await wrapNotFound(() => db.deleteTask(env.DB, user.id, input.taskId));
      return { success: true };
    },
  }),
  reorderTasks: defineAction({
    input: reorderTasksSchema,
    handler: async (input, context) => {
      const user = requireUser(context);
      await wrapNotFound(() => db.reorderTasks(env.DB, user.id, input.projectId, input.sectionId ?? null, input.orderedIds));
      return { success: true };
    },
  }),
};
