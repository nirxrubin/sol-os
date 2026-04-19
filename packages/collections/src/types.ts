/**
 * Field-type primitives shared across all collection schemas.
 * Framework-agnostic — these map to Payload field types at the persistence
 * boundary and to admin-fields renderers in apps/admin.
 */

export type FieldType =
  | "text"
  | "textarea"
  | "richtext"
  | "url"
  | "slug"
  | "media"
  | "datetime"
  | "number"
  | "boolean"
  | "select"
  | "color"
  | "tags"
  | "relation"
  | "repeater";

export interface FieldDef<T extends FieldType = FieldType> {
  name: string;
  label: string;
  type: T;
  required?: boolean;
  description?: string;

  // type-specific options
  options?: ReadonlyArray<{ value: string; label: string }>; // for select
  relation?: string; // collection slug for relation
  fields?: ReadonlyArray<FieldDef>;  // for repeater
  multiple?: boolean; // for media / relation
}

export interface CollectionSchema {
  /** Stable identifier used in code + Payload */
  slug: string;
  /** Human-readable name shown in admin */
  label: string;
  /** Plural label */
  labelPlural: string;
  /** One-line purpose */
  description: string;
  /** Whether this collection is enabled by default for every tenant */
  enabledByDefault: boolean;
  /** Whether this is a Payload "global" (singleton, not a list) */
  isGlobal?: boolean;
  /** Field set */
  fields: ReadonlyArray<FieldDef>;
  /** Fields that uniquely identify a record (for dedupe by Collection Parser) */
  uniqueKey: ReadonlyArray<string>;
  /** Detection signals used by Collection Parser; not load-bearing for runtime */
  detection?: {
    routePatterns?: string[];
    jsonLdTypes?: string[];
    ogTypes?: string[];
    notes?: string;
  };
}

/** A populated record for any collection. `data` shape is determined by the
 *  collection's `fields`. */
export interface CollectionRecord {
  collectionSlug: string;
  tenantId: string;
  id: string;
  data: Record<string, unknown>;
  meta: {
    createdAt: string;
    updatedAt: string;
    published: boolean;
  };
}
