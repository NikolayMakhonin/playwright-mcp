/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { test, expect } from './fixtures.js';

test('browser_console_messages', async ({ client, server }) => {
  server.setContent('/', `
    <!DOCTYPE html>
    <html>
      <script>
        console.log("Hello, world!");
        console.error("Error");
      </script>
    </html>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  const resource = await client.callTool({
    name: 'browser_console_messages',
  });
  expect(resource).toHaveResponse({
    result: `[LOG] Hello, world! @ ${server.PREFIX}:4
[ERROR] Error @ ${server.PREFIX}:5`,
  });
});

test('browser_console_messages (page error)', async ({ client, server }) => {
  server.setContent('/', `
    <!DOCTYPE html>
    <html>
      <script>
        throw new Error("Error in script");
      </script>
    </html>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  const resource = await client.callTool({
    name: 'browser_console_messages',
  });
  expect(resource).toHaveResponse({
    result: expect.stringContaining(`Error: Error in script`),
  });
  expect(resource).toHaveResponse({
    result: expect.stringContaining(server.PREFIX),
  });
});

test('recent console messages', async ({ client, server }) => {
  server.setContent('/', `
    <!DOCTYPE html>
    <html>
      <button onclick="console.log('Hello, world!');">Click me</button>
    </html>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  const response = await client.callTool({
    name: 'browser_click',
    arguments: {
      element: 'Click me',
      ref: 'e2',
    },
  });

  expect(response).toHaveResponse({
    consoleMessages: expect.stringContaining(`- [LOG] Hello, world! @`),
  });
});

test('browser_console_messages with type filter', async ({ client, server }) => {
  server.setContent('/', `
    <!DOCTYPE html>
    <html>
      <script>
        console.log("Log message");
        console.warn("Warning message");
        console.error("Error message");
        console.info("Info message");
      </script>
    </html>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  const errorOnly = await client.callTool({
    name: 'browser_console_messages',
    arguments: {
      include: [{ types: ['error'] }],
    },
  });
  expect(errorOnly).toHaveResponse({
    result: expect.stringContaining('[ERROR] Error message'),
  });
  expect(errorOnly).toHaveResponse({
    result: expect.not.stringContaining('[LOG] Log message'),
  });

  const warningAndError = await client.callTool({
    name: 'browser_console_messages',
    arguments: {
      include: [{ types: ['warning', 'error'] }],
    },
  });
  expect(warningAndError).toHaveResponse({
    result: expect.stringContaining('[WARNING] Warning message'),
  });
  expect(warningAndError).toHaveResponse({
    result: expect.stringContaining('[ERROR] Error message'),
  });
});

test('browser_console_messages with pattern filter', async ({ client, server }) => {
  server.setContent('/', `
    <!DOCTYPE html>
    <html>
      <script>
        console.log("Hello world");
        console.log("Goodbye world");
        console.error("API error occurred");
      </script>
    </html>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  const worldMessages = await client.callTool({
    name: 'browser_console_messages',
    arguments: {
      include: [{ pattern: 'world' }],
    },
  });
  expect(worldMessages).toHaveResponse({
    result: expect.stringContaining('[LOG] Hello world'),
  });
  expect(worldMessages).toHaveResponse({
    result: expect.stringContaining('[LOG] Goodbye world'),
  });
  expect(worldMessages).toHaveResponse({
    result: expect.not.stringContaining('API error'),
  });

  const errorPattern = await client.callTool({
    name: 'browser_console_messages',
    arguments: {
      include: [{ pattern: 'error' }],
    },
  });
  expect(errorPattern).toHaveResponse({
    result: expect.stringContaining('[ERROR] API error occurred'),
  });
});

test('browser_console_messages with exclude filter', async ({ client, server }) => {
  server.setContent('/', `
    <!DOCTYPE html>
    <html>
      <script>
        console.log("Keep this log");
        console.error("Remove this error");
        console.warn("Keep this warning");
      </script>
    </html>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  const excludeErrors = await client.callTool({
    name: 'browser_console_messages',
    arguments: {
      exclude: [{ types: ['error'] }],
    },
  });
  expect(excludeErrors).toHaveResponse({
    result: expect.stringContaining('[LOG] Keep this log'),
  });
  expect(excludeErrors).toHaveResponse({
    result: expect.stringContaining('[WARNING] Keep this warning'),
  });
  expect(excludeErrors).toHaveResponse({
    result: expect.not.stringContaining('[ERROR] Remove this error'),
  });
});

test('browser_console_messages with first/last limits', async ({ client, server }) => {
  server.setContent('/', `
    <!DOCTYPE html>
    <html>
      <script>
        for (let i = 1; i <= 5; i++) {
          console.log("Message " + i);
        }
      </script>
    </html>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  const firstTwo = await client.callTool({
    name: 'browser_console_messages',
    arguments: {
      first: 2,
    },
  });
  expect(firstTwo).toHaveResponse({
    result: expect.stringContaining('[LOG] Message 1'),
  });
  expect(firstTwo).toHaveResponse({
    result: expect.stringContaining('[LOG] Message 2'),
  });
  expect(firstTwo).toHaveResponse({
    result: expect.not.stringContaining('[LOG] Message 3'),
  });

  const lastTwo = await client.callTool({
    name: 'browser_console_messages',
    arguments: {
      last: 2,
    },
  });
  expect(lastTwo).toHaveResponse({
    result: expect.stringContaining('[LOG] Message 4'),
  });
  expect(lastTwo).toHaveResponse({
    result: expect.stringContaining('[LOG] Message 5'),
  });
  expect(lastTwo).toHaveResponse({
    result: expect.not.stringContaining('[LOG] Message 1'),
  });
});
