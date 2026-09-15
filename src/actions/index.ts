import { defineAction, ActionError } from 'astro:actions';
import { env } from 'cloudflare:workers';
import * as db from '../lib/db';
import {
  createProjectSchema, renameProjectSchema, deleteProjectSchema, reorderProjectsSchema,
  createSectionSchema, renameSectionSchema, deleteSectionSchema, reorderSectionsSchema,
} from '../lib/validation';

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
      return db.createProject(env.DB, user.id, input.name);
    },
  }),
  renameProject: defineAction({
    input: renameProjectSchema,
    handler: async (input, context) => {
      const user = requireUser(context);
      await wrapNotFound(() => db.renameProject(env.DB, user.id, input.projectId, input.name));
      return { success: true };
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
};
