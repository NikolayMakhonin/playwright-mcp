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

import type * as playwright from 'playwright';

const MAX_TOTAL_TEXT_LENGTH = 2000;

const NetworkFilterSchema = z.object({
  statuses: z.array(z.tuple([z.number(), z.number()])).optional().describe('Status code ranges to match [[200, 299], [400, 499]]. If omitted, all statuses are matched.'),
  types: z.array(z.enum(['extension', 'sameHost', '3rd-party'])).optional().describe('Request types to match. If omitted, all types are matched.'),
  pattern: z.string().optional().describe('Regex pattern for request URL with flags `iu` (case-insensitive, unicode). If omitted, all requests are matched.'),
});

function getNetworkRequestType(request: playwright.Request, currentPageUrl: string): 'extension' | 'sameHost' | '3rd-party' {
  const url = request.url();

  if (url.startsWith('chrome-extension://') || url.startsWith('moz-extension://'))
    return 'extension';


  try {
    const requestDomain = new URL(url).hostname;
    const currentDomain = new URL(currentPageUrl).hostname;
    return requestDomain === currentDomain ? 'sameHost' : '3rd-party';
  } catch {
    return '3rd-party';
  }
}

function createNetworkFilter(filters: typeof NetworkFilterSchema._type[], isInclude: boolean, currentPageUrl: string) {
  return ([request, response]: [playwright.Request, playwright.Response | null]): boolean => {
    if (!filters || filters.length === 0)
      return isInclude;


    const matchesAnyFilter = filters.some(filter => {
      if (filter.statuses && filter.statuses.length > 0 && response) {
        const status = response.status();
        const matchesStatus = filter.statuses.some(([min, max]) => status >= min && status <= max);
        if (!matchesStatus)
          return false;

      }

      if (filter.types && filter.types.length > 0) {
        const requestType = getNetworkRequestType(request, currentPageUrl);
        if (!filter.types.includes(requestType))
          return false;

      }

      if (filter.pattern) {
        const regex = new RegExp(filter.pattern, 'iu');
        if (!regex.test(request.url()))
          return false;

      }

      return true;
    });

    return isInclude ? matchesAnyFilter : !matchesAnyFilter;
  };
}

const requests = defineTabTool({
  capability: 'core',

  schema: {
    name: 'browser_network_requests',
    title: 'List network requests',
    description: 'Returns network requests with optional filtering and limiting',
    inputSchema: z.object({
      include: z.array(NetworkFilterSchema).optional().describe('Include requests matching any of these filters.'),
      exclude: z.array(NetworkFilterSchema).optional().describe('Exclude requests matching any of these filters. Exclude has higher priority than include.'),
      first: z.number().positive().optional().describe('Return first N requests after filtering.'),
      last: z.number().positive().optional().describe('Return last N requests after filtering.'),
    }),
    type: 'readOnly',
  },

  handle: async (tab, params, response) => {
    const requests = tab.requests();
    let requestEntries = [...requests.entries()];
    const currentPageUrl = tab.page.url();

    if (params.include)
      requestEntries = requestEntries.filter(createNetworkFilter(params.include, true, currentPageUrl));


    if (params.exclude)
      requestEntries = requestEntries.filter(createNetworkFilter(params.exclude, false, currentPageUrl));


    const requestStrings = requestEntries.map(([req, res]) => renderRequest(req, res));
    const resultStrings = stringArrayApplyLimits(requestStrings, {
      maxTotalLength: MAX_TOTAL_TEXT_LENGTH,
      countFirst: params.first,
      countLast: params.last,
    });

    if (resultStrings.length === 0)
      response.addResult('No network requests found matching the specified filters');
    else
      resultStrings.forEach(str => response.addResult(str));

  },
});

function renderRequest(request: playwright.Request, response: playwright.Response | null) {
  const result: string[] = [];
  result.push(`[${request.method().toUpperCase()}] ${request.url()}`);
  if (response)
    result.push(`=> [${response.status()}] ${response.statusText()}`);
  return result.join(' ');
}

export default [
  requests,
];
