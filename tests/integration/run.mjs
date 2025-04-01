const API_URL = 'http://localhost:3000';
const taskIds = [];

/**
 * @description Make API calls with error handling.
 */
async function apiCall(method, endpoint, body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  };

  if (body) options.body = JSON.stringify(body);

  try {
    const response = await fetch(`${API_URL}${endpoint}`, options);
    const data = await response.json();
    return { status: response.status, data };
  } catch (error) {
    console.error(`Error calling ${endpoint}:`, error);
    return { status: 500, error };
  }
}

/**
 * @description Assert that a condition is true.
 */
function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
}

/**
 * @description Test function to run all scenarios.
 */
async function runTests() {
  console.log('🚀 Starting API Tests with MikroEvent');
  console.log('======================================\n');

  try {
    // 1. Check home endpoint
    console.log('✅ Testing home endpoint');
    const homeResult = await apiCall('GET', '/');
    console.log(`   Status: ${homeResult.status}`);
    console.log(`   Response: ${JSON.stringify(homeResult.data)}\n`);
    assert(homeResult.status === 200, 'Home endpoint should return 200 status');
    assert(
      homeResult.data && typeof homeResult.data === 'object',
      'Home endpoint should return JSON object'
    );

    // 2. Create several tasks
    console.log('✅ Creating tasks');
    const tasks = [
      {
        title: 'Train Disco-Dancing Robot Hamsters',
        description: 'They need to be ready for the talent show next month'
      },
      {
        title: 'Perfect the Recipe for Glow-in-the-Dark Pancakes',
        description: 'Breakfast parties are all the rage now'
      },
      {
        title: 'Build a Time Machine Out of Cardboard',
        description: 'We only need to go back 5 minutes, so cardboard should suffice'
      }
    ];

    for (const task of tasks) {
      const result = await apiCall('POST', '/tasks', task);
      console.log(`   Created task: ${result.data.title} (ID: ${result.data.id})`);

      assert(result.status === 201, `Task creation should return 201 status for: ${task.title}`);
      assert(result.data.id, 'Created task should have an ID');
      assert(result.data.title === task.title, 'Created task should have the correct title');
      assert(
        result.data.description === task.description,
        'Created task should have the correct description'
      );

      if (result.status === 201) {
        taskIds.push(result.data.id);
      }
    }
    console.log('');

    // 3. List all tasks
    console.log('✅ Listing all tasks');
    const listResult = await apiCall('GET', '/tasks');
    console.log(`   Found ${listResult.data.length} tasks`);
    console.log('');

    assert(listResult.status === 200, 'List tasks should return 200 status');
    assert(Array.isArray(listResult.data), 'List tasks should return an array');
    assert(
      listResult.data.length >= tasks.length,
      `List should contain at least ${tasks.length} tasks`
    );

    // Check if our created tasks are in the list
    for (const taskId of taskIds) {
      const found = listResult.data.some((task) => task.id === taskId);
      assert(found, `Task with ID ${taskId} should be found in the list`);
    }

    // 4. Get a specific task
    if (taskIds.length > 0) {
      console.log(`✅ Getting task details for ${taskIds[0]}`);
      const taskResult = await apiCall('GET', `/tasks/${taskIds[0]}`);
      console.log(`   Task: ${JSON.stringify(taskResult.data)}\n`);

      assert(taskResult.status === 200, 'Get task should return 200 status');
      assert(taskResult.data.id === taskIds[0], 'Retrieved task should have the correct ID');
      assert(taskResult.data.title, 'Retrieved task should have a title');
      assert(taskResult.data.description, 'Retrieved task should have a description');

      // 5. Update a task to completed
      console.log(`✅ Marking task ${taskIds[0]} as completed`);
      const updateResult = await apiCall('PUT', `/tasks/${taskIds[0]}`, {
        completed: true
      });
      console.log(
        `   Updated task: ${updateResult.data.title} (Completed: ${updateResult.data.completed})\n`
      );

      assert(updateResult.status === 200, 'Update task should return 200 status');
      assert(updateResult.data.id === taskIds[0], 'Updated task should have the correct ID');
      assert(updateResult.data.completed === true, 'Task should be marked as completed');

      // 6. Assign a task to someone
      if (taskIds.length > 1) {
        const assignee = 'Captain Quirkbeard';
        console.log(`✅ Assigning task ${taskIds[1]} to ${assignee}`);
        const assignResult = await apiCall('POST', `/admin/assign-task/${taskIds[1]}`, {
          assignedTo: assignee
        });
        console.log(`   Task assigned to: ${assignResult.data.assignedTo}\n`);

        assert(assignResult.status === 200, 'Assign task should return 200 status');
        assert(assignResult.data.id === taskIds[1], 'Assigned task should have the correct ID');
        assert(assignResult.data.assignedTo === assignee, `Task should be assigned to ${assignee}`);
      }
    }

    // 7. Check for due tasks
    console.log('✅ Checking for due tasks');
    const dueTasksResult = await apiCall('GET', '/admin/check-due-tasks');
    console.log(`   Result: ${JSON.stringify(dueTasksResult.data)}\n`);

    assert(dueTasksResult.status === 200, 'Due tasks check should return 200 status');
    assert(typeof dueTasksResult.data === 'object', 'Due tasks response should be an object');
    assert(
      typeof dueTasksResult.data.processed === 'number',
      "Response should contain a 'processed' count"
    );

    // 8. Batch complete tasks
    if (taskIds.length > 1) {
      // Select a subset of tasks for batch completion
      const batchTaskIds = taskIds.slice(1);
      console.log(`✅ Batch completing ${batchTaskIds.length} tasks`);
      const batchResult = await apiCall('POST', '/admin/batch/complete-tasks', {
        taskIds: batchTaskIds,
        initiator: 'test-script'
      });
      console.log(`   Batch completion results: ${JSON.stringify(batchResult.data)}\n`);

      assert(batchResult.status === 200, 'Batch complete should return 200 status');
      assert(
        batchResult.data && typeof batchResult.data === 'object',
        'Batch response should be an object'
      );
      assert(Array.isArray(batchResult.data.success), "Response should have a 'success' array");
      assert(
        batchResult.data.success.length > 0,
        'At least one task should be successfully completed'
      );

      // Verify each task that was reported as successful was actually completed
      for (const taskId of batchResult.data.success) {
        const taskCheck = await apiCall('GET', `/tasks/${taskId}`);
        assert(
          taskCheck.data.completed === true,
          `Task ${taskId} should be marked as completed after batch operation`
        );
      }
    }

    // 9. Send a custom event to the webhook
    console.log('✅ Sending a custom event to webhook');
    const webhookEvent = {
      eventName: 'custom.cosmic-anomaly-detected',
      data: {
        message: 'The office coffee machine has started brewing espresso martinis',
        severity: 'delightful',
        timestamp: new Date().toISOString()
      }
    };

    const webhookResult = await apiCall('POST', '/webhook/events', webhookEvent);
    console.log(`   Webhook response: ${JSON.stringify(webhookResult.data)}\n`);

    assert(
      webhookResult.status === 200 || webhookResult.status === 202,
      'Webhook should return 200 or 202 status'
    );
    assert(
      webhookResult.data.received === true ||
        webhookResult.data.success === true ||
        webhookResult.data.processed === true ||
        webhookResult.data.event === webhookEvent.eventName,
      'Webhook should acknowledge receipt of the event'
    );

    // 10. Delete a task
    if (taskIds.length > 0) {
      console.log(`✅ Deleting task ${taskIds[0]}`);
      const deleteResult = await apiCall('DELETE', `/tasks/${taskIds[0]}`);
      console.log(`   Delete result: ${JSON.stringify(deleteResult.data)}\n`);

      assert(
        deleteResult.status === 200 || deleteResult.status === 204,
        'Delete task should return 200 or 204 status'
      );

      // Verify the task is actually deleted
      const checkDeleted = await apiCall('GET', `/tasks/${taskIds[0]}`);
      assert(checkDeleted.status === 404, `Task ${taskIds[0]} should not exist after deletion`);
    }

    // 11. Check health endpoint
    console.log('✅ Checking system health');
    const healthResult = await apiCall('GET', '/admin/health-check');
    console.log(`   Health check: ${JSON.stringify(healthResult.data)}\n`);

    assert(healthResult.status === 200, 'Health check should return 200 status');
    assert(
      healthResult.data.status === 'ok' || healthResult.data.healthy === true,
      'System should report healthy status'
    );

    console.log('🎉 All tests completed successfully!');
  } catch (error) {
    console.error('❌ Test failed with error:', error);
    process.exit(1); // Exit with error code
  }
}

runTests();
