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

import { z } from 'zod';
import { defineTabTool } from './tool.js';
import { stringArrayApplyLimits } from './utils.js';
import type { ConsoleMessage } from '../tab.js';

const MAX_TOTAL_TEXT_LENGTH = 2000;

const ConsoleFilterSchema = z.object({
  types: z.array(z.enum(['error', 'warning', 'info', 'verbose'])).optional().describe('Message types to match. If omitted, all types are matched.'),
  pattern: z.string().optional().describe('Regex pattern for message text with flags `iu` (case-insensitive, unicode). If omitted, all messages are matched.'),
});

function getConsoleMessageType(message: ConsoleMessage): 'error' | 'warning' | 'info' | 'verbose' {
  switch (message.type) {
    case 'error': return 'error';
    case 'warning': return 'warning';
    case 'log':
    case 'info': return 'info';
    default: return 'verbose';
  }
}

function createConsoleFilter(filters: typeof ConsoleFilterSchema._type[], isInclude: boolean) {
  return (message: ConsoleMessage): boolean => {
    if (!filters || filters.length === 0)
      return isInclude;


    const matchesAnyFilter = filters.some(filter => {
      if (filter.types && filter.types.length > 0) {
        const messageType = getConsoleMessageType(message);
        if (!filter.types.includes(messageType))
          return false;

      }

      if (filter.pattern) {
        const regex = new RegExp(filter.pattern, 'iu');
        if (!regex.test(message.text))
          return false;

      }

      return true;
    });

    return isInclude ? matchesAnyFilter : !matchesAnyFilter;
  };
}

const console = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_console_messages',
    title: 'Get console messages',
    description: 'Returns console messages with optional filtering and limiting',
    inputSchema: z.object({
      include: z.array(ConsoleFilterSchema).optional().describe('Include messages matching any of these filters.'),
      exclude: z.array(ConsoleFilterSchema).optional().describe('Exclude messages matching any of these filters. Exclude has higher priority than include.'),
      first: z.number().positive().optional().describe('Return first N messages after filtering.'),
      last: z.number().positive().optional().describe('Return last N messages after filtering.'),
    }),
    type: 'readOnly',
  },
  handle: async (tab, params, response) => {
    let messages = tab.consoleMessages();

    if (params.include)
      messages = messages.filter(createConsoleFilter(params.include, true));


    if (params.exclude)
      messages = messages.filter(createConsoleFilter(params.exclude, false));


    const messageStrings = messages.map(msg => msg.toString());
    const resultStrings = stringArrayApplyLimits(messageStrings, {
      maxTotalLength: MAX_TOTAL_TEXT_LENGTH,
      countFirst: params.first,
      countLast: params.last,
    });

    resultStrings.forEach(str => response.addResult(str));
  },
});

export default [
  console,
];
