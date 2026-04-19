/**
 * Output contract for the Collection Parser agent. Mirrors the shape from
 * docs/agents/collection-parser.md.
 */

export interface SourceProvenance {
  sourceUrl?: string;
  domPath?: string;
  /** Optional bounding box for screenshot region — populated when vision used. */
  screenshotRegion?: { x: number; y: number; width: number; height: number };
}

export interface ExtractedEntry {
  /** Field values matching the collection's schema. */
  data: Record<string, unknown>;
  sourceProvenance: SourceProvenance;
  confidence: number;
  warnings?: string[];
}

export interface DetectedCollection {
  /** Slug from packages/collections (e.g. "blog", "testimonial"). */
  type: string;
  confidence: number;
  evidence: string[];
  entries: ExtractedEntry[];
  /** Index pages associated with this collection — used by Block Generator. */
  indexPages?: Array<{ route: string }>;
  /** Detail page patterns for this collection. */
  detailPages?: Array<{ pattern: string; exampleRoute: string }>;
}

export interface UnmappedStructured {
  description: string;
  sourceProvenance: SourceProvenance;
  suggestedNewCollection?: {
    nameGuess: string;
    fieldGuess: Array<{ name: string; type: string }>;
  };
  confidence: number;
}

export interface CollectionExtractionResult {
  detectedCollections: DetectedCollection[];
  unmappedStructured: UnmappedStructured[];
  warnings: string[];
  metrics: {
    pagesAnalyzed: number;
    totalEntriesExtracted: number;
    averageConfidence: number;
    highConfidenceCount: number;
    lowConfidenceCount: number;
  };
}
