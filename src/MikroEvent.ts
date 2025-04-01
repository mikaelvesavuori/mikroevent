import { EventEmitter } from 'node:events';

import type { EmitResult, MikroEventOptions, Target, TargetUpdate } from './interfaces/index.js';

/**
 * @description MikroEvent is an ultra-lightweight, Node-native
 * way to handle events, both in-process (as EventEmitter events)
 * or across systems via HTTP(S) using Fetch.
 *
 * @example
 * const events = new MikroEvent();
 *
 * events.addTarget({ name: 'internal', events: ['user.created'] });
 * events.addTarget({ name: 'external', url: 'https://api.mydomain.com', events: ['user.created'] });
 *
 * const handler = () => { console.log('This runs in response to the user.created event') };
 * events.on('user.created', handler);
 *
 * await events.emit('user.created', { id: '123', name: 'Test User' });
 */
export class MikroEvent {
  private emitter: EventEmitter;
  private targets: Record<string, Target> = {};
  private options: MikroEventOptions;

  constructor(options?: MikroEventOptions) {
    this.emitter = new EventEmitter();

    // Handle literal zero (unlimited listeners)
    if (options?.maxListeners === 0) this.emitter.setMaxListeners(0);
    else this.emitter.setMaxListeners(options?.maxListeners || 10);

    this.options = {
      errorHandler: options?.errorHandler || ((error) => console.error(error))
    };
  }

  /**
   * @description Add one or more Targets for events.
   * @example
   * // Add single Target that is triggered on all events
   * events.addTarget({ name: 'my-internal-api', events: ['*'] });
   * // Add single Target using HTTPS fetch
   * events.addTarget({ name: 'my-external-api', url: 'https://api.mydomain.com', events: ['*'] });
   * // Add multiple Targets, responding to multiple events (single Target shown)
   * events.addTarget([{ name: 'my-interla-api', events: ['user.added', 'user.updated'] }]);
   * @returns Boolean that expresses if all Targets were successfully added.
   */
  public addTarget(target: Target | Target[]): boolean {
    const targets = Array.isArray(target) ? target : [target];

    const results = targets.map((target) => {
      if (this.targets[target.name]) {
        console.error(`Target with name '${target.name}' already exists.`);
        return false;
      }

      this.targets[target.name] = {
        name: target.name,
        url: target.url,
        headers: target.headers || {},
        events: target.events || []
      };

      return true;
    });

    return results.every((result) => result === true);
  }

  /**
   * @description Update an existing Target.
   * @example
   * events.updateTarget('system_a', { url: 'http://localhost:8000', events: ['user.updated'] };
   * @returns Boolean that expresses if the Target was successfully added.
   */
  public updateTarget(name: string, update: TargetUpdate): boolean {
    if (!this.targets[name]) {
      console.error(`Target with name '${name}' does not exist.`);
      return false;
    }

    const target = this.targets[name];

    if (update.url !== undefined) target.url = update.url;

    if (update.headers) target.headers = { ...target.headers, ...update.headers };

    if (update.events) target.events = update.events;

    return true;
  }

  /**
   * @description Remove a Target.
   * @example
   * events.removeTarget('system_a');
   * @returns Boolean that expresses if the Target was successfully removed.
   */
  public removeTarget(name: string): boolean {
    if (!this.targets[name]) {
      console.error(`Target with name '${name}' does not exist.`);
      return false;
    }

    delete this.targets[name];
    return true;
  }

  /**
   * @description Add one or more events to an existing Target.
   * @example
   * events.addEventToTarget('system_a', ['user.updated', 'user.deleted']);
   * @returns Boolean that expresses if all events were successfully added.
   */
  public addEventToTarget(name: string, events: string | string[]): boolean {
    if (!this.targets[name]) {
      console.error(`Target with name '${name}' does not exist.`);
      return false;
    }

    const eventsArray = Array.isArray(events) ? events : [events];
    const target = this.targets[name];

    eventsArray.forEach((event) => {
      if (!target.events.includes(event)) target.events.push(event);
    });

    return true;
  }

  /**
   * @description Register an event handler for internal events.
   */
  public on<T = any>(eventName: string, handler: (data: T) => void | Promise<void>): this {
    this.emitter.on(eventName, handler);
    return this;
  }

  /**
   * @description Remove an event handler.
   */
  public off<T = any>(eventName: string, handler: (data: T) => void | Promise<void>): this {
    this.emitter.off(eventName, handler);
    return this;
  }

  /**
   * @description Register a one-time event handler.
   */
  public once<T = any>(eventName: string, handler: (data: T) => void | Promise<void>): this {
    this.emitter.once(eventName, handler);
    return this;
  }

  /**
   * @description Emit an event locally and to its bound Targets.
   * @example
   * await events.emit('user.added', { id: 'abc123', name: 'Sam Person' });
   * @return Returns a result object with success status and any errors.
   */
  public async emit<T = any>(eventName: string, data: T): Promise<EmitResult> {
    const result: EmitResult = {
      success: true,
      errors: []
    };

    const makeError = (targetName: string, eventName: string, error: Error) => ({
      target: targetName,
      event: eventName,
      error
    });

    const targets = Object.values(this.targets).filter(
      (target) => target.events.includes(eventName) || target.events.includes('*')
    );

    // Emit all internal events first
    targets
      .filter((target) => !target.url)
      .forEach((target) => {
        try {
          this.emitter.emit(eventName, data);
        } catch (error) {
          const actualError = error instanceof Error ? error : new Error(String(error));

          result.errors.push({
            target: target.name,
            event: eventName,
            error: actualError
          });

          // @ts-ignore
          this.options.errorHandler(actualError, eventName, data);

          result.success = false;
        }
      });

    // Proceed with external Targets
    const externalTargets = targets.filter((target) => target.url);

    if (externalTargets.length > 0) {
      const promises = externalTargets.map(async (target) => {
        try {
          // @ts-ignore
          const response = await fetch(target.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...target.headers
            },
            body: JSON.stringify({
              eventName,
              data
            })
          });

          if (!response.ok) {
            const errorMessage = `HTTP error! Status: ${response.status}: ${response.statusText}`;
            const httpError = new Error(errorMessage);

            result.errors.push(makeError(target.name, eventName, httpError));

            // @ts-ignore
            this.options.errorHandler(httpError, eventName, data);

            result.success = false;
          }
        } catch (error) {
          const actualError = error instanceof Error ? error : new Error(String(error));

          result.errors.push(makeError(target.name, eventName, actualError));

          // @ts-ignore
          this.options.errorHandler(actualError, eventName, data);

          result.success = false;
        }
      });

      await Promise.allSettled(promises);
    }

    return result;
  }

  /**
   * @description Handle an incoming event arriving over HTTP.
   * Used for server integrations, when you want to manually handle
   * the incoming event payload.
   *
   * The processing will be async using `process.nextTick()`
   * and running in a non-blocking fashion.
   * @example
   * await mikroEvent.handleIncomingEvent({
   *   eventName: 'user.created',
   *   data: { id: '123', name: 'Test User' }
   * });
   */
  public async handleIncomingEvent(body: string | object): Promise<void> {
    try {
      const { eventName, data } =
        typeof body === 'string' ? JSON.parse(body) : (body as { eventName: string; data: any });

      process.nextTick(() => {
        try {
          this.emitter.emit(eventName, data);
        } catch (error) {
          // @ts-ignore
          this.options.errorHandler(
            error instanceof Error ? error : new Error(String(error)),
            eventName,
            data
          );
        }
      });
    } catch (error) {
      // @ts-ignore
      this.options.errorHandler(
        error instanceof Error ? error : new Error(String(error)),
        'parse_event'
      );
      throw error;
    }
  }

  /**
   * @description Create middleware for Express-style servers, i.e.
   * using `req` and `res` objects. This is an approach that replaces
   * using `handleIncomingEvent()` manually.
   * @example
   * const middleware = mikroEvent.createMiddleware();
   * await middleware(req, res, next);
   */
  public createMiddleware() {
    return async (req: any, res: any, next?: Function) => {
      if (req.method !== 'POST') {
        if (next) next();
        return;
      }

      if (req.body) {
        try {
          await this.handleIncomingEvent(req.body);
          res.statusCode = 202;
          res.end();
        } catch (error) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Invalid event format' }));
          if (next) next(error);
        }
      } else {
        let body = '';
        req.on('data', (chunk: Buffer) => (body += chunk.toString()));

        req.on('end', async () => {
          try {
            await this.handleIncomingEvent(body);
            res.statusCode = 202;
            res.end();
          } catch (error) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Invalid event format' }));
            if (next) next(error);
          }
        });
      }
    };
  }
}
