import {
  parseAsanaStoryComments,
  type AsanaComment,
  type AsanaTask,
} from './parser.js';

const ASANA_API_BASE = 'https://app.asana.com/api/1.0';
const COMMENT_FETCH_CONCURRENCY = 5;
const MAX_STORY_PAGES_PER_TASK = 100;

type AsanaStoriesResponse = {
  data?: unknown[];
  next_page?: {
    offset?: string | null;
  } | null;
};

function mergeComments(existing: AsanaComment[], fetched: AsanaComment[]) {
  const seen = new Set<string>();
  return [...existing, ...fetched].filter(comment => {
    const key = comment.gid || `${comment.createdAt || ''}\n${comment.authorName}\n${comment.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchTaskComments(taskId: string, accessToken: string) {
  const comments: AsanaComment[] = [];
  let offset = '';

  for (let page = 0; page < MAX_STORY_PAGES_PER_TASK; page += 1) {
    const url = new URL(`${ASANA_API_BASE}/tasks/${encodeURIComponent(taskId)}/stories`);
    url.searchParams.set('limit', '100');
    url.searchParams.set(
      'opt_fields',
      'gid,resource_subtype,text,created_at,created_by.name',
    );
    if (offset) url.searchParams.set('offset', offset);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch {
      throw new Error('ASANA_COMMENTS_FETCH_FAILED');
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error('ASANA_TOKEN_INVALID');
    }
    if (response.status === 429) {
      throw new Error('ASANA_COMMENTS_RATE_LIMITED');
    }
    if (!response.ok) {
      throw new Error('ASANA_COMMENTS_FETCH_FAILED');
    }

    let payload: AsanaStoriesResponse;
    try {
      payload = await response.json() as AsanaStoriesResponse;
    } catch {
      throw new Error('ASANA_COMMENTS_FETCH_FAILED');
    }
    comments.push(...parseAsanaStoryComments(Array.isArray(payload.data) ? payload.data : []));
    offset = typeof payload.next_page?.offset === 'string' ? payload.next_page.offset : '';
    if (!offset) return comments;
  }

  throw new Error('ASANA_COMMENTS_FETCH_FAILED');
}

function flattenTasks(tasks: AsanaTask[]): AsanaTask[] {
  return tasks.flatMap(task => [task, ...flattenTasks(task.subtasks)]);
}

export async function enrichAsanaTasksWithComments(tasks: AsanaTask[], accessToken: string) {
  const allTasks = flattenTasks(tasks);
  let cursor = 0;

  async function worker() {
    while (cursor < allTasks.length) {
      const task = allTasks[cursor];
      cursor += 1;
      const fetched = await fetchTaskComments(task.gid, accessToken);
      task.comments = mergeComments(task.comments, fetched);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(COMMENT_FETCH_CONCURRENCY, allTasks.length) },
      () => worker(),
    ),
  );
}
