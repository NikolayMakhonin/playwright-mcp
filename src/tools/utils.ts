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

// @ts-ignore
import { asLocator } from 'playwright-core/lib/utils';

import type * as playwright from 'playwright';
import type { Tab } from '../tab.js';

export async function waitForCompletion<R>(tab: Tab, callback: () => Promise<R>): Promise<R> {
  const requests = new Set<playwright.Request>();
  let frameNavigated = false;
  let waitCallback: () => void = () => {};
  const waitBarrier = new Promise<void>(f => { waitCallback = f; });

  const requestListener = (request: playwright.Request) => requests.add(request);
  const requestFinishedListener = (request: playwright.Request) => {
    requests.delete(request);
    if (!requests.size)
      waitCallback();
  };

  const frameNavigateListener = (frame: playwright.Frame) => {
    if (frame.parentFrame())
      return;
    frameNavigated = true;
    dispose();
    clearTimeout(timeout);
    void tab.waitForLoadState('load').then(waitCallback);
  };

  const onTimeout = () => {
    dispose();
    waitCallback();
  };

  tab.page.on('request', requestListener);
  tab.page.on('requestfinished', requestFinishedListener);
  tab.page.on('framenavigated', frameNavigateListener);
  const timeout = setTimeout(onTimeout, 10000);

  const dispose = () => {
    tab.page.off('request', requestListener);
    tab.page.off('requestfinished', requestFinishedListener);
    tab.page.off('framenavigated', frameNavigateListener);
    clearTimeout(timeout);
  };

  try {
    const result = await callback();
    if (!requests.size && !frameNavigated)
      waitCallback();
    await waitBarrier;
    await tab.waitForTimeout(1000);
    return result;
  } finally {
    dispose();
  }
}

export async function generateLocator(locator: playwright.Locator): Promise<string> {
  try {
    const { resolvedSelector } = await (locator as any)._resolveSelector();
    return asLocator('javascript', resolvedSelector);
  } catch (e) {
    throw new Error('Ref not found, likely because element was removed. Use browser_snapshot to see what elements are currently on the page.');
  }
}

export async function callOnPageNoTrace<T>(page: playwright.Page, callback: (page: playwright.Page) => Promise<T>): Promise<T> {
  return await (page as any)._wrapApiCall(() => callback(page), { internal: true });
}

export interface StringArrayApplyLimitsOptions {
  maxTotalLength: number;
  countFirst?: number | null;
  countLast?: number | null;
}

function stringArrayTotalLength(strings: string[]): number {
  return strings.reduce((length, str) => length + str.length, 0);
}

function stringArrayTrimToLength(strings: string[], maxLength: number, preferEnd: boolean): string[] {
  let length = 0;
  let index = 0;

  if (preferEnd) {
    for (let i = strings.length - 1; i >= 0; i--) {
      length += strings[i].length;
      if (length > maxLength)
        break;
      index = i;
    }
    return strings.slice(index);
  } else {
    for (let i = 0; i < strings.length; i++) {
      length += strings[i].length;
      if (length > maxLength)
        break;
      index = i + 1;
    }
    return strings.slice(0, index);
  }
}

export function stringArrayApplyLimits(strings: string[], options: StringArrayApplyLimitsOptions): string[] {
  const { maxTotalLength, countFirst, countLast } = options;
  let result = strings;

  if (countFirst && countLast) {
    const firstN = strings.slice(0, countFirst);
    const lastN = strings.slice(-countLast);
    const lengthFirst = stringArrayTotalLength(firstN);
    const lengthLast = stringArrayTotalLength(lastN);
    const totalLength = lengthFirst + lengthLast;

    if (totalLength > maxTotalLength) {
      const maxLengthFirst = Math.floor(maxTotalLength * (lengthFirst / totalLength));
      const maxLengthLast = maxTotalLength - maxLengthFirst;
      const trimmedFirst = stringArrayTrimToLength(firstN, maxLengthFirst, false);
      const trimmedLast = stringArrayTrimToLength(lastN, maxLengthLast, true);

      const skippedFirst = firstN.length - trimmedFirst.length;
      const skippedLast = lastN.length - trimmedLast.length;
      const totalSkipped = strings.length - countFirst - countLast + skippedFirst + skippedLast;

      result = [...trimmedFirst, `[${totalSkipped} messages skipped]`, ...trimmedLast];
    } else {
      result = [...firstN, ...lastN];
    }
  } else if (countFirst) {
    result = strings.slice(0, countFirst);
    const trimmed = stringArrayTrimToLength(result, maxTotalLength, false);
    const skipped = result.length - trimmed.length;
    result = trimmed;
    if (skipped > 0)
      result.push(`[${skipped} messages trimmed]`);
  } else if (countLast) {
    result = strings.slice(-countLast);
    const trimmed = stringArrayTrimToLength(result, maxTotalLength, true);
    const skipped = result.length - trimmed.length;
    result = trimmed;
    if (skipped > 0)
      result.unshift(`[${skipped} messages trimmed]`);
  } else {
    const trimmed = stringArrayTrimToLength(strings, maxTotalLength, true);
    const skipped = strings.length - trimmed.length;
    result = trimmed;
    if (skipped > 0)
      result.unshift(`[${skipped} messages trimmed]`);
  }

  return result;
}
