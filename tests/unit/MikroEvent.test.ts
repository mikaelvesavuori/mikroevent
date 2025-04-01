import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { EventEmitter } from 'node:stream';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { MikroEvent } from '../../src/MikroEvent.js';

let testServer: http.Server;
let testServerUrl: string;

beforeEach(() => {
  return new Promise<void>((resolve) => {
    testServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk.toString()));

      req.on('end', () => {
        try {
          const data = JSON.parse(body);

          if (req.url === '/success') {
            res.statusCode = 200;
            res.end(JSON.stringify({ status: 'ok', received: data }));
          } else if (req.url === '/error') {
            res.statusCode = 500;
            res.end(JSON.stringify({ status: 'error' }));
          } else if (req.url === '/non-existent') {
            // Simulate network failure by immediately closing the connection
            req.socket.destroy();
          } else {
            res.statusCode = 200;
            res.end(JSON.stringify({ status: 'ok', received: data }));
          }
        } catch (_error) {
          res.statusCode = 400;
          res.end(JSON.stringify({ status: 'error', message: 'Invalid JSON' }));
        }
      });
    });

    testServer.listen(0, () => {
      const address = testServer.address() as AddressInfo;
      testServerUrl = `http://localhost:${address.port}`;
      resolve();
    });
  });
});

afterEach(() => new Promise<void>((resolve) => testServer.close(() => resolve())));

describe('Initialization', () => {
  test('It should initialize with empty targets and custom error handler', () => {
    const errorHandler = vi.fn();
    const mikroEvent = new MikroEvent({ errorHandler });
    // @ts-ignore
    expect(mikroEvent.targets).toEqual({});
  });

  describe('MaxListeners configuration', () => {
    test('It should set default max listeners to 10 when not specified', () => {
      const mikroEvent = new MikroEvent();

      // @ts-ignore - Access private emitter to verify maxListeners
      const emitterMaxListeners = mikroEvent.emitter.getMaxListeners();

      expect(emitterMaxListeners).toBe(10);
    });

    test('It should set custom max listeners when specified in options', () => {
      const mikroEvent = new MikroEvent({ maxListeners: 50 });

      // @ts-ignore - Access private emitter to verify maxListeners
      const emitterMaxListeners = mikroEvent.emitter.getMaxListeners();

      expect(emitterMaxListeners).toBe(50);
    });

    test('It should allow more than 10 listeners without warnings when maxListeners is increased', () => {
      const mikroEvent = new MikroEvent({ maxListeners: 20 });

      mikroEvent.addTarget({
        name: 'internal',
        events: ['test.event']
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      for (let i = 0; i < 15; i++) {
        mikroEvent.on('test.event', () => {});
      }

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    test('It should respect zero maxListeners for unlimited listeners', () => {
      const mikroEvent = new MikroEvent({ maxListeners: 0 });

      // @ts-ignore
      const emitterMaxListeners = mikroEvent.emitter.getMaxListeners();

      expect(emitterMaxListeners).toBe(0);

      mikroEvent.addTarget({
        name: 'internal',
        events: ['test.event']
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      for (let i = 0; i < 100; i++) {
        mikroEvent.on('test.event', () => {});
      }

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});

describe('Target management', () => {
  test('It should add a target successfully', () => {
    const mikroEvent = new MikroEvent();

    const result = mikroEvent.addTarget({
      name: 'system_a',
      url: 'http://localhost:8000',
      headers: { Authorization: 'my-token' },
      events: ['user.created']
    });

    expect(result).toBe(true);
  });

  test('It should fail when adding a target with existing name', () => {
    const mikroEvent = new MikroEvent();

    mikroEvent.addTarget({
      name: 'system_a',
      events: ['user.created']
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = mikroEvent.addTarget({
      name: 'system_a',
      events: ['user.updated']
    });

    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Target with name 'system_a' already exists.")
    );

    consoleSpy.mockRestore();
  });

  test('It should update a target successfully', () => {
    const mikroEvent = new MikroEvent();

    mikroEvent.addTarget({
      name: 'system_a',
      url: 'http://localhost:8000',
      events: ['user.created']
    });

    const result = mikroEvent.updateTarget('system_a', {
      url: 'http://localhost:9000',
      events: ['user.updated']
    });

    expect(result).toBe(true);
  });

  test('It should fail when updating a non-existent target', () => {
    const mikroEvent = new MikroEvent();

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = mikroEvent.updateTarget('non_existent', {
      url: 'http://localhost:9000'
    });

    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Target with name 'non_existent' does not exist.")
    );

    consoleSpy.mockRestore();
  });

  test('It should add events to a target', () => {
    const mikroEvent = new MikroEvent();

    mikroEvent.addTarget({
      name: 'system_a',
      events: ['user.created']
    });

    const result = mikroEvent.addEventToTarget('system_a', ['user.updated', 'user.deleted']);

    expect(result).toBe(true);

    const handler = vi.fn();
    mikroEvent.on('user.created', handler);
    mikroEvent.on('user.updated', handler);
    mikroEvent.on('user.deleted', handler);

    mikroEvent.emit('user.created', {});
    mikroEvent.emit('user.updated', {});
    mikroEvent.emit('user.deleted', {});

    expect(handler).toHaveBeenCalledTimes(3);
  });

  test('It should not add events to a target that does not exist', () => {
    const mikroEvent = new MikroEvent();

    const result = mikroEvent.addEventToTarget('system_a', ['user.updated', 'user.deleted']);

    expect(result).toBe(false);
  });

  test('It should not add duplicate events to a target', () => {
    const mikroEvent = new MikroEvent();

    mikroEvent.addTarget({
      name: 'system_a',
      events: ['user.created']
    });

    mikroEvent.addEventToTarget('system_a', 'user.created');

    const handler = vi.fn();
    mikroEvent.on('user.created', handler);

    mikroEvent.emit('user.created', {});

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('It should remove a target successfully', () => {
    const mikroEvent = new MikroEvent();

    mikroEvent.addTarget({
      name: 'system_a',
      events: ['user.created']
    });

    const result = mikroEvent.removeTarget('system_a');

    expect(result).toBe(true);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mikroEvent.updateTarget('system_a', { url: 'http://localhost' });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  test('It should handle trying to remove a target that does not exist', () => {
    const mikroEvent = new MikroEvent();

    const result = mikroEvent.removeTarget('system_a');

    expect(result).toBe(false);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mikroEvent.updateTarget('system_a', { url: 'http://localhost' });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe('Internal event handling', () => {
  test('It should emit events to internal targets', async () => {
    const mikroEvent = new MikroEvent();

    mikroEvent.addTarget({
      name: 'internal',
      events: ['user.created']
    });

    const handler = vi.fn();
    mikroEvent.on('user.created', handler);

    await mikroEvent.emit('user.created', { id: '123', name: 'Test User' });

    expect(handler).toHaveBeenCalledWith({ id: '123', name: 'Test User' });
  });

  test('It should respect once listeners', async () => {
    const mikroEvent = new MikroEvent();

    mikroEvent.addTarget({
      name: 'internal',
      events: ['user.created']
    });

    const handler = vi.fn();
    mikroEvent.once('user.created', handler);

    await mikroEvent.emit('user.created', { id: '123' });
    await mikroEvent.emit('user.created', { id: '456' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ id: '123' });
  });

  test('It should remove listeners with off method', async () => {
    const mikroEvent = new MikroEvent();

    mikroEvent.addTarget({
      name: 'internal',
      events: ['user.created']
    });

    const handler = vi.fn();
    mikroEvent.on('user.created', handler);

    mikroEvent.off('user.created', handler);

    await mikroEvent.emit('user.created', { id: '123' });

    expect(handler).not.toHaveBeenCalled();
  });

  test('It should support wildcard event subscriptions with "*"', async () => {
    const mikroEvent = new MikroEvent();

    mikroEvent.addTarget({
      name: 'internal',
      events: ['*']
    });

    const handler = vi.fn();
    mikroEvent.on('user.created', handler);
    mikroEvent.on('user.updated', handler);

    await mikroEvent.emit('user.created', { id: '123' });
    await mikroEvent.emit('user.updated', { id: '456' });
    await mikroEvent.emit('something.else', { data: 'test' });

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledWith({ id: '123' });
    expect(handler).toHaveBeenCalledWith({ id: '456' });
  });

  test('It should handle errors from internal event emitters', async () => {
    const errorHandler = vi.fn();
    const mikroEvent = new MikroEvent({ errorHandler });

    // Mock the internal emitter to throw an error when emit is called
    vi.spyOn(EventEmitter.prototype, 'emit').mockImplementation(() => {
      throw new Error('Emitter error');
    });

    mikroEvent.addTarget({
      name: 'internal',
      events: ['test.event']
    });

    const result = await mikroEvent.emit('test.event', { data: 'test' });

    // Verify the error was handled correctly
    expect(result.success).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].target).toBe('internal');
    expect(result.errors[0].event).toBe('test.event');
    expect(result.errors[0].error.message).toBe('Emitter error');

    // Verify the error handler was called
    expect(errorHandler).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Emitter error' }),
      'test.event',
      { data: 'test' }
    );

    // Clean up mock
    vi.restoreAllMocks();
  });
});

describe('External event communication', () => {
  test('It should emit events to external HTTP targets', async () => {
    let capturedRequest: any = null;

    const requestReceived = new Promise<void>((resolve) => {
      testServer.removeAllListeners('request');
      testServer.on('request', (req, res) => {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk.toString();
        });

        req.on('end', () => {
          capturedRequest = {
            url: req.url,
            method: req.method,
            headers: req.headers,
            body: JSON.parse(body)
          };

          res.statusCode = 200;
          res.end(JSON.stringify({ status: 'ok' }));
          resolve();
        });
      });
    });

    const mikroEvent = new MikroEvent();

    mikroEvent.addTarget({
      name: 'external',
      url: `${testServerUrl}/events`,
      headers: { 'X-Custom-Header': 'test-value' },
      events: ['user.created']
    });

    const userData = { id: '123', name: 'Test User' };
    await mikroEvent.emit('user.created', userData);

    await requestReceived;

    expect(capturedRequest).not.toBeNull();
    expect(capturedRequest.url).toBe('/events');
    expect(capturedRequest.method).toBe('POST');
    expect(capturedRequest.headers['x-custom-header']).toBe('test-value');
    expect(capturedRequest.headers['content-type']).toBe('application/json');
    expect(capturedRequest.body).toEqual({
      eventName: 'user.created',
      data: userData
    });
  });

  test('It should track failed HTTP requests in result object', async () => {
    const errorHandler = vi.fn();
    const mikroEvent = new MikroEvent({ errorHandler });

    mikroEvent.addTarget({
      name: 'failing_target',
      url: `${testServerUrl}/non-existent`,
      events: ['user.created']
    });

    const userData = { id: '123', name: 'Test User' };
    const result = await mikroEvent.emit('user.created', userData);

    expect(errorHandler).toHaveBeenCalled();

    expect(result.success).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].target).toBe('failing_target');
    expect(result.errors[0].event).toBe('user.created');
    expect(result.errors[0].error).toBeInstanceOf(Error);
  });

  test('It should track failed HTTP requests with non-2xx responses', async () => {
    const errorHandler = vi.fn();
    const mikroEvent = new MikroEvent({ errorHandler });

    mikroEvent.addTarget({
      name: 'failing_target',
      url: `${testServerUrl}/error`,
      events: ['user.created']
    });

    const result = await mikroEvent.emit('user.created', { id: '123' });

    expect(errorHandler).toHaveBeenCalled();

    const unprocessedEvents = result.errors;
    expect(unprocessedEvents.length).toBe(1);
    expect(unprocessedEvents[0].target).toBe('failing_target');
  });

  test('It should return success status for successful operations', async () => {
    const mikroEvent = new MikroEvent();

    mikroEvent.addTarget({
      name: 'internal',
      events: ['user.created']
    });

    const handler = vi.fn();
    mikroEvent.on('user.created', handler);

    const result = await mikroEvent.emit('user.created', { id: '123', name: 'Test User' });

    expect(handler).toHaveBeenCalled();

    expect(result.success).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  test('It should handle multiple events and report partial failures', async () => {
    const errorHandler = vi.fn();
    const mikroEvent = new MikroEvent({ errorHandler });

    const successHandler = vi.fn();
    mikroEvent.on('test.event', successHandler);

    mikroEvent.addTarget({
      name: 'success_target',
      url: `${testServerUrl}/success`,
      events: ['test.event']
    });

    mikroEvent.addTarget({
      name: 'failing_target',
      url: `${testServerUrl}/error`,
      events: ['test.event']
    });

    mikroEvent.addTarget({
      name: 'internal_target',
      events: ['test.event']
    });

    const result = await mikroEvent.emit('test.event', { data: 'test-data' });

    expect(successHandler).toHaveBeenCalledWith({ data: 'test-data' });

    expect(errorHandler).toHaveBeenCalled();

    expect(result.success).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].target).toBe('failing_target');
  });
});

describe('Server integration', () => {
  describe('Manual event handling', () => {
    test('It should process incoming events (object format)', async () => {
      const mikroEvent = new MikroEvent();

      const handler = vi.fn();
      mikroEvent.on('user.created', handler);

      await mikroEvent.handleIncomingEvent({
        eventName: 'user.created',
        data: { id: '123', name: 'Test User' }
      });

      // Need a small delay as event processing is asynchronous (nextTick)
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(handler).toHaveBeenCalledWith({ id: '123', name: 'Test User' });
    });

    test('It should process incoming events (string/JSON format)', async () => {
      const mikroEvent = new MikroEvent();

      const handler = vi.fn();
      mikroEvent.on('user.created', handler);

      await mikroEvent.handleIncomingEvent(
        JSON.stringify({
          eventName: 'user.created',
          data: { id: '123', name: 'Test User' }
        })
      );

      // Need a small delay as event processing is asynchronous (nextTick)
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(handler).toHaveBeenCalledWith({ id: '123', name: 'Test User' });
    });

    test('It should handle errors in incoming events', async () => {
      const errorHandler = vi.fn();
      const mikroEvent = new MikroEvent({ errorHandler });

      await expect(mikroEvent.handleIncomingEvent('{ invalid json }')).rejects.toThrow();

      expect(errorHandler).toHaveBeenCalled();
    });

    test('It should handle errors thrown by event handlers during handleIncomingEvent', async () => {
      const errorHandler = vi.fn();
      const mikroEvent = new MikroEvent({ errorHandler });

      const errorThrowingHandler = () => {
        throw new Error('Handler error');
      };

      mikroEvent.on('test.event', errorThrowingHandler);

      await mikroEvent.handleIncomingEvent({
        eventName: 'test.event',
        data: { id: '123' }
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Handler error' }),
        'test.event',
        { id: '123' }
      );
    });
  });

  describe('Middleware event handling', () => {
    test('It should create middleware that processes events from request body', async () => {
      const mikroEvent = new MikroEvent();

      const handler = vi.fn();
      mikroEvent.on('user.created', handler);

      const middleware = mikroEvent.createMiddleware();

      // Mock Express-like req, res objects
      const req: any = {
        method: 'POST',
        body: { eventName: 'user.created', data: { id: '123' } },
        on: vi.fn()
      };

      const res: any = {
        statusCode: 0,
        end: vi.fn()
      };

      const next = vi.fn();

      await middleware(req, res, next);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(handler).toHaveBeenCalledWith({ id: '123' });
      expect(res.statusCode).toBe(202);
      expect(res.end).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    test('It should create middleware that handles streaming bodies', async () => {
      const mikroEvent = new MikroEvent();

      const handler = vi.fn();
      mikroEvent.on('user.created', handler);

      const middleware = mikroEvent.createMiddleware();

      // Create a mock req with streaming body capabilities
      const req: any = {
        method: 'POST',
        on: vi.fn()
      };

      const res: any = {
        statusCode: 0,
        end: vi.fn()
      };

      let dataHandler: (chunk: string) => void;
      let endHandler: () => void;

      req.on.mockImplementation((event: string, handler: any) => {
        if (event === 'data') dataHandler = handler;
        if (event === 'end') endHandler = handler;
        return req;
      });

      await middleware(req, res);

      const eventData = JSON.stringify({
        eventName: 'user.created',
        data: { id: '123' }
      });

      expect(req.on).toHaveBeenCalledWith('data', expect.any(Function));
      expect(req.on).toHaveBeenCalledWith('end', expect.any(Function));

      // @ts-ignore
      dataHandler(eventData);
      // @ts-ignore
      endHandler();

      // Need a small delay as event processing is asynchronous (nextTick)
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(handler).toHaveBeenCalledWith({ id: '123' });
      expect(res.statusCode).toBe(202);
      expect(res.end).toHaveBeenCalled();
    });

    test('It should handle middleware errors gracefully', async () => {
      const mikroEvent = new MikroEvent();

      const middleware = mikroEvent.createMiddleware();

      // Mock req with non-JSON data
      const req: any = {
        method: 'POST',
        on: vi.fn()
      };

      const res: any = {
        statusCode: 0,
        end: vi.fn()
      };

      const next = vi.fn();

      let dataHandler: (chunk: string) => void;
      let endHandler: () => void;

      req.on.mockImplementation((event: string, handler: any) => {
        if (event === 'data') dataHandler = handler;
        if (event === 'end') endHandler = handler;
        return req;
      });

      await middleware(req, res, next);

      // @ts-ignore
      dataHandler('{ invalid: json }');
      // @ts-ignore
      endHandler();

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(res.statusCode).toBe(400);
      expect(res.end).toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    test('It should ignore non-POST requests in middleware', async () => {
      const mikroEvent = new MikroEvent();

      const middleware = mikroEvent.createMiddleware();

      const req: any = {
        method: 'GET',
        on: vi.fn()
      };

      const res: any = {
        statusCode: 0,
        end: vi.fn()
      };

      const next = vi.fn();

      await middleware(req, res, next);

      // Verify next was called and no processing occurred
      expect(next).toHaveBeenCalled();
      expect(req.on).not.toHaveBeenCalled();
    });

    test('It should handle errors in middleware when handleIncomingEvent fails', async () => {
      const mikroEvent = new MikroEvent();

      vi.spyOn(mikroEvent, 'handleIncomingEvent').mockImplementation(() => {
        throw new Error('Invalid event format');
      });

      const middleware = mikroEvent.createMiddleware();

      // Mock Express-like request and response
      const req = {
        method: 'POST',
        body: { bad: 'data' }
      };

      const res = {
        statusCode: 0,
        end: vi.fn()
      };

      const next = vi.fn();

      await middleware(req, res, next);

      expect(res.statusCode).toBe(400);
      expect(res.end).toHaveBeenCalledWith(JSON.stringify({ error: 'Invalid event format' }));
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Invalid event format' })
      );

      vi.restoreAllMocks();
    });
  });
});
