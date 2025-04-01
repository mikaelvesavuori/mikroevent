import { MikroServe } from 'mikroserve';

import { MikroEvent } from '../../src/MikroEvent.js';

interface Task {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  assignedTo?: string;
  createdAt: Date;
  updatedAt: Date;
}

const tasks: Record<string, Task> = {};

const app = new MikroServe();

const events = new MikroEvent({
  errorHandler: (error, eventName, data) => {
    console.error(`[ERROR] Event "${eventName}" failed:`, error);
    console.error('Event data:', data);
  }
});

events.addTarget([
  {
    name: 'external',
    url: 'http://localhost:3000',
    events: ['write.flushed']
  },

  {
    name: 'internal-logger',
    events: ['*']
  },

  {
    name: 'analytics-service',
    url: 'https://www.mockachino.com/9d08d723-739e-40/events',
    headers: {
      'X-API-Key': 'your-analytics-api-key'
    },
    events: ['task.created', 'task.completed', 'api.error']
  },

  {
    name: 'notification-service',
    url: 'https://www.mockachino.com/9d08d723-739e-40/notify',
    headers: {
      Authorization: 'Bearer your-notification-token'
    },
    events: ['task.assigned', 'task.due-soon']
  }
]);

////////////
// Events //
////////////

events.on('write.flushed', (data: Record<string, any>) => {
  console.log(`Write flushed: ${JSON.stringify(data)}`);
});

events.on('task.created', (task: Task) => {
  console.log(`[EVENT] Task created: ${task.title} (ID: ${task.id})`);
});

events.on('task.updated', (task: Task) => {
  console.log(`[EVENT] Task updated: ${task.title} (ID: ${task.id})`);
});

events.on('task.completed', (task: Task) => {
  console.log(`[EVENT] Task completed: ${task.title} (ID: ${task.id})`);
});

events.on('task.deleted', (taskId: string) => {
  console.log(`[EVENT] Task deleted: ${taskId}`);
});

events.on('task.assigned', (data: { taskId: string; assignedTo: string; task: Task }) => {
  console.log(`[EVENT] Task assigned: ${data.task.title} to ${data.assignedTo}`);
});

events.on('api.error', (error: any) => {
  console.error(`[EVENT] API Error: ${error}`);
});

////////////////
// API Routes //
////////////////

/**
 * @description Used for demo use-cases.
 */
app.post('/test', async (c: any) => {
  const body = c.body;

  await events.handleIncomingEvent(body);

  return c.json({ success: true }, 202);
});

/**
 * @description Home endpoint.
 */
app.get('/', (c: any) => {
  events.emit('api.home.visited', { timestamp: new Date() });

  return c.json({
    message: 'Task Management API',
    version: '1.0.0',
    endpoints: ['/tasks', '/tasks/:id']
  });
});

/**
 * @description External event webhook endpoint:
 * This allows external systems to send events to our application.
 */
app.post('/webhook/events', async (c: any) => {
  try {
    const body = c.body;
    await events.handleIncomingEvent(body);

    return c.json({ success: true }, 202);
  } catch (error) {
    console.error('Error handling webhook:', error);
    return c.json({ success: false, error: 'Invalid event format' }, 400);
  }
});

/**
 * @description List all tasks.
 */
app.get('/tasks', async (c: any) => {
  const taskList = Object.values(tasks);

  // Emit an event for analytics
  await events.emit('api.tasks.listed', {
    count: taskList.length,
    timestamp: new Date()
  });

  return c.json(taskList);
});

/**
 * @description Get a specific task.
 */
app.get('/tasks/:id', async (c: any) => {
  const id = c.params.id;
  const task = tasks[id];

  if (!task) {
    await events.emit('api.error', {
      type: 'not_found',
      resourceId: id,
      path: c.req.path
    });

    return c.json({ error: 'Task not found' }, 404);
  }

  await events.emit('api.task.viewed', {
    taskId: id,
    timestamp: new Date()
  });

  return c.json(task);
});

/**
 * @description Create a new task.
 */
app.post('/tasks', async (c: any) => {
  console.log('--->', c.req.body);
  const body = c.req.body;

  if (!body.title) {
    await events.emit('api.error', {
      type: 'validation_error',
      details: 'Title is required',
      path: c.req.path
    });

    return c.json({ error: 'Title is required' }, 400);
  }

  const id = crypto.randomUUID();
  const now = new Date();

  const newTask: Task = {
    id,
    title: body.title,
    description: body.description || '',
    completed: false,
    createdAt: now,
    updatedAt: now
  };

  tasks[id] = newTask;

  const result = await events.emit('task.created', newTask);

  if (!result.success) console.error('Failed to emit task.created event:', result.errors);

  return c.json(newTask, 201);
});

/**
 * @description Update a task.
 */
app.put('/tasks/:id', async (c: any) => {
  const id = c.params.id;
  const body = await c.body;

  if (!tasks[id]) {
    await events.emit('api.error', {
      type: 'not_found',
      resourceId: id,
      path: c.req.path
    });

    return c.json({ error: 'Task not found' }, 404);
  }

  const wasCompleted = tasks[id].completed;

  const updatedTask = {
    ...tasks[id],
    ...body,
    id,
    updatedAt: new Date()
  };

  tasks[id] = updatedTask;

  await events.emit('task.updated', updatedTask);

  if (!wasCompleted && updatedTask.completed) await events.emit('task.completed', updatedTask);

  return c.json(updatedTask);
});

/**
 * @description Delete a task.
 */
app.delete('/tasks/:id', async (c: any) => {
  const id = c.params.id;

  if (!tasks[id]) {
    await events.emit('api.error', {
      type: 'not_found',
      resourceId: id,
      path: c.req.path
    });

    return c.json({ error: 'Task not found' }, 404);
  }

  const deletedTask = tasks[id];
  delete tasks[id];

  await events.emit('task.deleted', id);

  return c.json({
    success: true,
    message: `Task '${deletedTask.title}' deleted successfully`
  });
});

/**
 * @description Health check endpoint.
 */
app.get('/admin/health-check', async (c: any) => {
  await events.emit('system.health-check', {
    timestamp: new Date(),
    status: 'ok',
    memory: process.memoryUsage(),
    taskCount: Object.keys(tasks).length
  });

  return c.json({
    status: 'ok',
    taskCount: Object.keys(tasks).length,
    uptime: process.uptime()
  });
});

/**
 * @description Task due soon check - simulates a scheduled job.
 */
app.get('/admin/check-due-tasks', async (c: any) => {
  const uncompletedTasks = Object.values(tasks).filter((task) => !task.completed);

  for (const task of uncompletedTasks) {
    await events.emit('task.due-soon', {
      taskId: task.id,
      title: task.title,
      timestamp: new Date(),
      assignedTo: task.assignedTo
    });
  }

  return c.json({
    processed: uncompletedTasks.length,
    message: 'Due-soon notifications processed'
  });
});

/**
 * @description Assign a task to someone.
 */
app.post('/admin/assign-task/:id', async (c: any) => {
  const id = c.params.id;
  const body = await c.body;

  if (!tasks[id]) {
    await events.emit('api.error', {
      type: 'not_found',
      resourceId: id,
      path: c.req.path
    });

    return c.json({ error: 'Task not found' }, 404);
  }

  if (!body.assignedTo) {
    await events.emit('api.error', {
      type: 'validation_error',
      details: 'assignedTo is required',
      path: c.req.path
    });

    return c.json({ error: 'assignedTo is required' }, 400);
  }

  const updatedTask = {
    ...tasks[id],
    assignedTo: body.assignedTo,
    updatedAt: new Date()
  };

  tasks[id] = updatedTask;

  await events.emit('task.assigned', {
    taskId: id,
    assignedTo: body.assignedTo,
    task: updatedTask
  });

  return c.json(updatedTask);
});

/**
 * @description Batch operations - demonstrates complex event handling.
 */
app.post('/admin/batch/complete-tasks', async (c: any) => {
  const body = await c.body;

  if (!body.taskIds || !Array.isArray(body.taskIds) || body.taskIds.length === 0) {
    await events.emit('api.error', {
      type: 'validation_error',
      details: 'taskIds array is required',
      path: c.req.path
    });

    return c.json({ error: 'taskIds array is required' }, 400);
  }

  const results = {
    success: [] as string[],
    notFound: [] as string[],
    alreadyCompleted: [] as string[]
  };

  for (const taskId of body.taskIds) {
    if (!tasks[taskId]) {
      results.notFound.push(taskId);
      continue;
    }

    if (tasks[taskId].completed) {
      results.alreadyCompleted.push(taskId);
      continue;
    }

    const updatedTask = {
      ...tasks[taskId],
      completed: true,
      updatedAt: new Date()
    };

    tasks[taskId] = updatedTask;
    results.success.push(taskId);

    await events.emit('task.updated', updatedTask);
    await events.emit('task.completed', updatedTask);
  }

  await events.emit('tasks.batch-completed', {
    count: results.success.length,
    taskIds: results.success,
    initiator: body.initiator || 'system',
    timestamp: new Date()
  });

  return c.json(results);
});

const eventMiddleware = async (c: any, next: any) => {
  const { req, res } = c;

  return new Promise((resolve) => {
    const middleware = events.createMiddleware();

    middleware(req, res, async (error: any) => {
      if (error) {
        return resolve({
          statusCode: 400,
          body: { error: 'Invalid event format' }
        });
      }

      const result = await next();
      resolve(result);
    });
  });
};

app.post('/webhook/events/middleware', eventMiddleware as any, async () => {
  return {
    statusCode: 200,
    body: { processed: true }
  };
});

(() => {
  const port = 3000;

  console.log(`Server is running on port ${port}`);
  console.log(`API available at http://localhost:${port}`);

  app.start();

  console.log('\nAvailable endpoints:');
  console.log('- GET  /tasks                        List all tasks');
  console.log('- GET  /tasks/:id                    Get a specific task');
  console.log('- POST /tasks                        Create a new task');
  console.log('- PUT  /tasks/:id                    Update a task');
  console.log('- DELETE /tasks/:id                  Delete a task');
  console.log('- GET  /admin/health-check           System health status');
  console.log('- GET  /admin/check-due-tasks        Check for due tasks');
  console.log('- POST /admin/assign-task/:id        Assign a task');
  console.log('- POST /admin/batch/complete-tasks   Complete multiple tasks');
  console.log('- POST /webhook/events               Webhook for incoming events');
})();
