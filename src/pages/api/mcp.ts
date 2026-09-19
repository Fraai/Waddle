import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import * as db from '../../lib/db';
import { getUserByEmail, type User } from '../../lib/users';
import { todayISO, splitOverdueAndToday, groupUpcoming } from '../../lib/dates';
import { descriptionField, hrefField, repeatRuleField } from '../../lib/validation';

// A single token maps to a single account (env.MCP_USER_EMAIL) — this is a
// personal-automation tool, not a multi-tenant API. Using the same token
// from more than one Claude install (e.g. a personal one and a client's)
// still just authenticates as that one person.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function authenticate(request: Request): Promise<User | null> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token || !timingSafeEqual(token, env.MCP_TOKEN)) return null;
  return getUserByEmail(env.DB, env.MCP_USER_EMAIL);
}

function toolResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}

function toolError(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

// A task shaped for a tool response — the DB row plus nothing the caller
// can't use (no user_id, no position).
function taskView(task: db.Task) {
  return {
    id: task.id,
    title: task.title,
    projectId: task.project_id,
    sectionId: task.section_id,
    parentTaskId: task.parent_task_id,
    description: task.description,
    href: task.href,
    dueDate: task.due_date,
    priority: task.priority,
    repeatRule: task.repeat_rule,
    done: task.done_at !== null,
  };
}

function projectView(project: db.Project) {
  return { id: project.id, name: project.name, type: project.type, isInbox: project.is_inbox === 1 };
}

function sectionView(section: db.Section) {
  return { id: section.id, projectId: section.project_id, name: section.name };
}

/** Resolves a project by id or (case-insensitive) name; omitted means Inbox. */
async function resolveProject(userId: number, ref: string | undefined): Promise<db.Project | null> {
  const projects = await db.listProjects(env.DB, userId);
  if (!ref) return projects.find((p) => p.is_inbox === 1) ?? null;
  const trimmed = ref.trim();
  return (
    projects.find((p) => String(p.id) === trimmed) ??
    projects.find((p) => p.name.toLowerCase() === trimmed.toLowerCase()) ??
    null
  );
}

function buildServer(user: User): McpServer {
  const server = new McpServer({ name: 'todo-fraai-agency', version: '1.0.0' });

  server.registerTool(
    'list_projects',
    { title: 'List projects', description: 'Lists every project, including the Inbox, with its id, name, and private/work type.' },
    async () => {
      const projects = await db.listProjects(env.DB, user.id);
      return toolResult(projects.map(projectView));
    },
  );

  server.registerTool(
    'list_today',
    { title: "List today's tasks", description: 'Lists open tasks that are overdue or due today.' },
    async () => {
      const tasks = await db.listOpenDatedTasks(env.DB, user.id);
      const today = todayISO();
      const { overdue, today: dueToday } = splitOverdueAndToday(tasks, today);
      return toolResult({ today, overdue: overdue.map(taskView), dueToday: dueToday.map(taskView) });
    },
  );

  server.registerTool(
    'list_upcoming',
    {
      title: 'List upcoming tasks',
      description: 'Lists open tasks due after today, grouped by date, up to a number of days ahead (default 7).',
      inputSchema: { days: z.number().int().positive().max(90).optional().describe('How many days ahead to include (default 7)') },
    },
    async ({ days = 7 }) => {
      const tasks = await db.listOpenDatedTasks(env.DB, user.id);
      const today = todayISO();
      const cutoff = new Date(`${today}T00:00:00`);
      cutoff.setDate(cutoff.getDate() + days);
      const cutoffISO = cutoff.toISOString().slice(0, 10);
      const groups = groupUpcoming(tasks, today).filter((g) => g.date <= cutoffISO);
      return toolResult(groups.map((g) => ({ date: g.date, tasks: g.tasks.map(taskView) })));
    },
  );

  server.registerTool(
    'list_project_tasks',
    {
      title: 'List a project\'s tasks',
      description: 'Lists all tasks (open and done, top-level and subtasks) in one project, matched by id or name (e.g. "Inbox").',
      inputSchema: { project: z.string().describe('Project id or name') },
    },
    async ({ project }) => {
      const resolved = await resolveProject(user.id, project);
      if (!resolved) return toolError(`No project matches "${project}".`);
      const tasks = await db.listTasksByProject(env.DB, user.id, resolved.id);
      return toolResult({ project: projectView(resolved), tasks: tasks.map(taskView) });
    },
  );

  server.registerTool(
    'create_project',
    {
      title: 'Create a project',
      description: 'Creates a new project. Defaults to type "work" if not given.',
      inputSchema: {
        name: z.string().min(1).describe('Project name'),
        type: z.enum(['private', 'work']).optional().describe('Defaults to "work"'),
      },
    },
    async ({ name, type }) => {
      const project = await db.createProject(env.DB, user.id, name, type);
      return toolResult(projectView(project));
    },
  );

  server.registerTool(
    'create_section',
    {
      title: 'Create a section',
      description: 'Creates a section inside a project, matched by id or name (e.g. "Inbox") — tasks can then be filed into it from the app.',
      inputSchema: {
        project: z.string().describe('Project id or name'),
        name: z.string().min(1).describe('Section name'),
      },
    },
    async ({ project, name }) => {
      const resolved = await resolveProject(user.id, project);
      if (!resolved) return toolError(`No project matches "${project}".`);
      const section = await db.createSection(env.DB, user.id, resolved.id, name);
      return toolResult(sectionView(section));
    },
  );

  server.registerTool(
    'create_task',
    {
      title: 'Create a task',
      description: 'Creates a task. Defaults to the Inbox project and priority 4 (lowest) if not given.',
      inputSchema: {
        title: z.string().min(1).describe('Task title'),
        project: z.string().optional().describe('Project id or name — defaults to Inbox'),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD'),
        priority: z.number().int().min(1).max(4).optional().describe('1 (urgent) to 4 (lowest, default)'),
        description: descriptionField,
        href: hrefField.describe('A link — a bare domain like "example.com" is fine, https:// is assumed'),
        parentTaskId: z.number().int().positive().optional().describe('Set to create this as a subtask'),
        repeatRule: repeatRuleField.describe(
          'Repeat on completion: "daily", "weekly", "monthly", or "every:N:days". Only takes effect if dueDate is set — completing the task then creates its next occurrence.',
        ),
      },
    },
    async ({ title, project, dueDate, priority, description, href, parentTaskId, repeatRule }) => {
      const resolved = await resolveProject(user.id, project);
      if (!resolved) return toolError(`No project matches "${project}".`);
      try {
        const task = await db.createTask(env.DB, user.id, {
          projectId: resolved.id,
          parentTaskId: parentTaskId ?? null,
          title,
          description: description ?? null,
          href: href ?? null,
          dueDate: dueDate ?? null,
          priority,
          repeatRule: repeatRule ?? null,
        });
        return toolResult(taskView(task));
      } catch (err) {
        if (err instanceof db.NotFoundError) return toolError(err.message);
        throw err;
      }
    },
  );

  server.registerTool(
    'toggle_task_done',
    {
      title: 'Toggle a task done/open',
      description: 'Flips a task between done and open — check its current "done" state first if that matters.',
      inputSchema: { taskId: z.number().int().positive() },
    },
    async ({ taskId }) => {
      try {
        const { nextOccurrenceCreated } = await db.toggleTaskDone(env.DB, user.id, taskId);
        return toolResult({ taskId, toggled: true, nextOccurrenceCreated });
      } catch (err) {
        if (err instanceof db.NotFoundError) return toolError(err.message);
        throw err;
      }
    },
  );

  server.registerTool(
    'delete_task',
    {
      title: 'Delete a task',
      description: 'Permanently deletes a task and any of its subtasks.',
      inputSchema: { taskId: z.number().int().positive() },
    },
    async ({ taskId }) => {
      try {
        await db.deleteTask(env.DB, user.id, taskId);
        return toolResult({ taskId, deleted: true });
      } catch (err) {
        if (err instanceof db.NotFoundError) return toolError(err.message);
        throw err;
      }
    },
  );

  return server;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, mcp-session-id, mcp-protocol-version',
};

export const OPTIONS: APIRoute = async () => new Response(null, { status: 204, headers: CORS_HEADERS });

// A single handler for GET/POST/DELETE — WebStandardStreamableHTTPServerTransport
// dispatches on request.method itself, so there's nothing method-specific to do here.
export const ALL: APIRoute = async ({ request }) => {
  if (!env.MCP_TOKEN || !env.MCP_USER_EMAIL) {
    return new Response('MCP is not configured on this deployment (missing MCP_TOKEN/MCP_USER_EMAIL).', { status: 503 });
  }

  const user = await authenticate(request);
  if (!user) {
    return new Response('Unauthorized', { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } });
  }

  // Stateless: a fresh server + transport per request. No session to keep,
  // since every tool call re-authenticates and re-queries the DB anyway.
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  const server = buildServer(user);
  await server.connect(transport);
  const response = await transport.handleRequest(request);
  for (const [key, value] of Object.entries(CORS_HEADERS)) response.headers.set(key, value);
  return response;
};
