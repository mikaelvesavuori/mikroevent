# MikroEvent

**Ultra-lightweight, Node.js-native way to handle events, both in-process (as EventEmitter events) or across systems via HTTP(S)**.

[![npm version](https://img.shields.io/npm/v/mikroevent.svg)](https://www.npmjs.com/package/mikroevent)

[![bundle size](https://img.shields.io/bundlephobia/minzip/mikroevent)](https://bundlephobia.com/package/mikroevent)

![Build Status](https://github.com/mikaelvesavuori/mikroevent/workflows/main/badge.svg)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

- Node.js native solution to work with event-driven architecture
- Easiest possible way to work with events in, or across, Node.js-based systems
- None of the learning curve and overhead of other eventing options
- Tiny (~1.2 KB gzipped)
- Zero dependencies
- High test coverage

## Installation

```bash
npm install mikroevent -S
```

## Usage

### Quick Start

MikroEvent sends _events_ to named _targets_ using HTTP calls and/or internal, i.e. in-process events.

```typescript
// ES5 format
const { MikroEvent } = require('mikroevent');
// ES6 format
import { MikroEvent } from 'mikroevent';

const mikroEvent = new MikroEvent();

mikroEvent.addTarget({
  name: 'internal',
  events: ['user.created']
});

const handler = () => { console.log('This runs in response to the user.created event') };

mikroEvent.on('user.created', handler);
//mikroEvent.once('user.created', handler); // Run event handler only once
//mikroEvent.off('user.created', handler);  // Remove event handler

await mikroEvent.emit('user.created', { id: '123', name: 'Test User' });
```

### Updating a target

```typescript
mikroEvent.updateTarget('system_a', { url: 'https://api.mydomain.com/userCreated', events: ['user.updated'] };
```

### Add event to target

```typescript
mikroEvent.addEventToTarget('system_a', ['user.updated', 'user.deleted']);
```

### Removing a target

```typescript
mikroEvent.removeTarget('system_a');
```

### Receive events in the same system/process

Set up an event listener to react to events.

```typescript
const handler = () => console.log('Run this when user.created is emitted');
mikroEvent.on('user.created', handler);
```

### Receive events from other systems via HTTPS, transformed into an event

Handle an incoming event arriving over HTTP. Used for server integrations, when you want to manually handle the incoming event payload.

The processing will be async using `process.nextTick()` and running in a non-blocking fashion.

```typescript
await mikroEvent.handleIncomingEvent({
  eventName: 'user.created',
  data: { id: '123', name: 'Test User' }
});
```

### Receive events from other system via HTTPS

Create middleware for Express-style servers, i.e. using `req` and `res` objects. This is an approach that replaces using `handleIncomingEvent()` manually.

```typescript
const middleware = mikroEvent.createMiddleware();
await middleware(req, res, next);
```

## Configuration

You may also optionally instantiate MikroEvent with a custom error handling function.

```typescript
const errorHandler = () => console.error('Run this on errors');
const mikroEvent = new MikroEvent({ errorHandler });
```

## Bigger example

Check out the [integration tests](tests/integration/index.ts) for a bigger, practical example of how MikroEvent works.

## License

MIT. See `LICENSE` file.
