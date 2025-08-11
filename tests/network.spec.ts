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

test('browser_network_requests', async ({ client, server }) => {
  server.setContent('/', `
    <button onclick="fetch('/json')">Click me</button>
  `, 'text/html');

  server.setContent('/json', JSON.stringify({ name: 'John Doe' }), 'application/json');

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  await client.callTool({
    name: 'browser_click',
    arguments: {
      element: 'Click me button',
      ref: 'e2',
    },
  });

  await expect.poll(() => client.callTool({
    name: 'browser_network_requests',
  })).toHaveResponse({
    result: expect.stringContaining(`[GET] ${`${server.PREFIX}`} => [200] OK
[GET] ${`${server.PREFIX}json`} => [200] OK`),
  });
});

test('browser_network_requests with status filter', async ({ client, server }) => {
  server.setContent('/', `
    <button onclick="Promise.all([fetch('/success'), fetch('/notfound')])">Click me</button>
  `, 'text/html');

  server.setContent('/success', 'OK', 'text/plain');
  // /notfound will return 404

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  await client.callTool({
    name: 'browser_click',
    arguments: {
      element: 'Click me button',
      ref: 'e2',
    },
  });

  const successOnly = await client.callTool({
    name: 'browser_network_requests',
    arguments: {
      include: [{ statuses: [[200, 299]] }],
    },
  });
  expect(successOnly).toHaveResponse({
    result: expect.stringContaining('=> [200] OK'),
  });
  expect(successOnly).toHaveResponse({
    result: expect.not.stringContaining('=> [404]'),
  });

  const errorsOnly = await client.callTool({
    name: 'browser_network_requests',
    arguments: {
      include: [{ statuses: [[400, 499]] }],
    },
  });
  expect(errorsOnly).toHaveResponse({
    result: expect.stringContaining('=> [404]'),
  });
  expect(errorsOnly).toHaveResponse({
    result: expect.not.stringContaining('=> [200] OK'),
  });
});

test('browser_network_requests with type filter', async ({ client, server }) => {
  server.setContent('/', `
    <script>
      fetch('/api');
      fetch('https://example.com/external');
    </script>
  `, 'text/html');

  server.setContent('/api', 'API response', 'text/plain');

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  await new Promise(resolve => setTimeout(resolve, 100));

  const sameHostOnly = await client.callTool({
    name: 'browser_network_requests',
    arguments: {
      include: [{ types: ['sameHost'] }],
    },
  });
  expect(sameHostOnly).toHaveResponse({
    result: expect.stringContaining(`${server.PREFIX}`),
  });
  expect(sameHostOnly).toHaveResponse({
    result: expect.not.stringContaining('example.com'),
  });

  const thirdPartyOnly = await client.callTool({
    name: 'browser_network_requests',
    arguments: {
      include: [{ types: ['3rd-party'] }],
    },
  });
  expect(thirdPartyOnly).toHaveResponse({
    result: expect.stringContaining('example.com'),
  });
});

test('browser_network_requests with pattern filter', async ({ client, server }) => {
  server.setContent('/', `
    <script>
      fetch('/api/users');
      fetch('/api/posts'); 
      fetch('/static/image.png');
    </script>
  `, 'text/html');

  server.setContent('/api/users', '[]', 'application/json');
  server.setContent('/api/posts', '[]', 'application/json');
  server.setContent('/static/image.png', '', 'image/png');

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  await new Promise(resolve => setTimeout(resolve, 100));

  const apiOnly = await client.callTool({
    name: 'browser_network_requests',
    arguments: {
      include: [{ pattern: '/api/' }],
    },
  });
  expect(apiOnly).toHaveResponse({
    result: expect.stringContaining('/api/users'),
  });
  expect(apiOnly).toHaveResponse({
    result: expect.stringContaining('/api/posts'),
  });
  expect(apiOnly).toHaveResponse({
    result: expect.not.stringContaining('/static/'),
  });

  const imageOnly = await client.callTool({
    name: 'browser_network_requests',
    arguments: {
      include: [{ pattern: '\\.png$' }],
    },
  });
  expect(imageOnly).toHaveResponse({
    result: expect.stringContaining('image.png'),
  });
  expect(imageOnly).toHaveResponse({
    result: expect.not.stringContaining('/api/'),
  });
});

test('browser_network_requests with exclude filter', async ({ client, server }) => {
  server.setContent('/', `
    <script>
      fetch('/api/data');
      fetch('/tracking/analytics');
    </script>
  `, 'text/html');

  server.setContent('/api/data', 'data', 'text/plain');
  server.setContent('/tracking/analytics', 'analytics', 'text/plain');

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  await new Promise(resolve => setTimeout(resolve, 100));

  const excludeTracking = await client.callTool({
    name: 'browser_network_requests',
    arguments: {
      exclude: [{ pattern: 'tracking' }],
    },
  });
  expect(excludeTracking).toHaveResponse({
    result: expect.stringContaining('/api/data'),
  });
  expect(excludeTracking).toHaveResponse({
    result: expect.not.stringContaining('/tracking/'),
  });
});

test('browser_network_requests with first/last limits', async ({ client, server }) => {
  server.setContent('/', `
    <script>
      for (let i = 1; i <= 5; i++) {
        fetch('/request' + i);
      }
    </script>
  `, 'text/html');

  for (let i = 1; i <= 5; i++)
    server.setContent(`/request${i}`, `Response ${i}`, 'text/plain');


  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  await new Promise(resolve => setTimeout(resolve, 200));

  const firstTwo = await client.callTool({
    name: 'browser_network_requests',
    arguments: {
      first: 2,
    },
  });
  expect(firstTwo).toHaveResponse({
    result: expect.stringContaining(`${server.PREFIX}`),
  });

  const lastTwo = await client.callTool({
    name: 'browser_network_requests',
    arguments: {
      last: 2,
    },
  });
  expect(lastTwo).toHaveResponse({
    result: expect.stringContaining('request'),
  });
});
