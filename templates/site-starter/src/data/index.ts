/**
 * Tenant data loader.
 *
 * `tenant-data.ts` is always present — the generator overwrites it per
 * tenant. Pristine template: it re-exports MOCK_DATA so the site still
 * builds without a generation step (mock-data parity).
 */

import { TENANT_DATA } from './tenant-data.js';
import type { TenantData } from './types.js';

export const DATA: TenantData = TENANT_DATA;
export type { TenantData };
export * from './types.js';
