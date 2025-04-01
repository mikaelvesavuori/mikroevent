/**
 * @description Options to configure MikroEvent.
 */
export interface MikroEventOptions {
  /**
   * The number of max listeners that MikroEvent will allow.
   * The default value follows what Node.js sets as its default.
   * @default 10
   */
  maxListeners?: number;
  /**
   * Custom error handler to trigger on any errors.
   */
  errorHandler?: (error: Error | string, eventName?: string, data?: any) => void;
}

/**
 * @description Describes the identity and location
 * of a target to communicate with after one or more
 * events have happened.
 */
export interface Target {
  /**
   * The name to identify the Target by.
   */
  name: string;
  /**
   * URL to the Target. Not needed for (internal) events.
   */
  url?: string;
  /**
   * Any headers to pass with HTTP calls to this Target.
   */
  headers?: Record<string, string>;
  /**
   * Which events (event names) trigger communication with the Target.
   */
  events: string[];
}

/**
 * @description Updates a target with new settings.
 */
export interface TargetUpdate {
  url?: string;
  headers?: Record<string, string>;
  events?: string[];
}

/**
 * @description Describes the result after emitting an event
 * which may be as an actual event or via HTTP.
 */
export interface EmitResult {
  success: boolean;
  errors: EmitError[];
}

/**
 * Error after emitting an event or calling with HTTP.
 */
type EmitError = {
  target: string;
  event: string;
  error: Error;
};
