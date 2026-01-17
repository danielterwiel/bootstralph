/**
 * PRD (Product Requirements Document) Schema for Ralph Loop
 *
 * This schema follows the conventions established by:
 * - https://github.com/snarktank/ralph
 * - https://github.com/thecgaigroup/ralph-cc-loop
 * - https://github.com/iannuttall/ralph
 *
 * PRD files are stored in .agents/tasks/ and track progress through
 * the 'passes' boolean field on each user story.
 */

/**
 * Individual user story within a PRD
 */
export interface UserStory {
  /** Unique identifier for the story (e.g., "US-001", "story-1") */
  id: string;

  /** Short title describing the story */
  title: string;

  /** Detailed description of what needs to be implemented */
  description: string;

  /** List of acceptance criteria that must be met */
  acceptanceCriteria: string[];

  /** Priority level (lower number = higher priority, e.g., 1 is highest) */
  priority: number;

  /** Whether this story has been completed */
  passes: boolean;

  /** IDs of stories that must be completed before this one */
  dependsOn?: string[];

  /** Optional notes added during implementation */
  notes?: string;

  /** Timestamp when story was started */
  startedAt?: string;

  /** Timestamp when story was completed */
  completedAt?: string;

  /** Optional GitHub issue number linked to this story */
  githubIssue?: number;
}

/**
 * Review task for validating assumptions before implementation
 */
export interface ReviewTask {
  /** Unique identifier for the review task */
  id: string;

  /** Category of the review (e.g., "compatibility", "security", "architecture") */
  category: string;

  /** Description of what needs to be reviewed */
  task: string;

  /** Specific question to answer */
  check: string;

  /** Current status of the review */
  status: "pending" | "in_progress" | "completed" | "failed" | "blocked";

  /** What was discovered during the review */
  finding?: string;

  /** Action required if the review revealed an issue */
  actionRequired?: string | null;
}

/**
 * PRD mode determines branching strategy
 */
export type PrdMode = "feature" | "backlog";

/**
 * PRD status values
 */
export type PrdStatus = "planning" | "in_progress" | "completed" | "paused" | "blocked";

/**
 * Complete PRD structure
 */
export interface Prd {
  /** Project or feature name */
  name: string;

  /** Version of the PRD */
  version: string;

  /** Brief description of the project/feature */
  description: string;

  /** Current status of the PRD */
  status: PrdStatus;

  /** Git branch name for this PRD's work */
  branchName?: string;

  /** PRD mode: "feature" creates one branch, "backlog" creates branch-per-story */
  mode?: PrdMode;

  /** GitHub repository in owner/repo format */
  githubRepo?: string;

  /** Review tasks to validate before implementation */
  reviewTasks?: ReviewTask[];

  /** User stories to implement */
  userStories: UserStory[];

  /** Recommended plugins/skills for this PRD */
  plugins?: {
    recommended?: string[];
    optional?: string[];
  };

  /** Additional metadata */
  metadata?: {
    createdAt?: string;
    updatedAt?: string;
    createdBy?: string;
    completionPromise?: string;
  };
}

/**
 * Minimal PRD for quick task creation
 */
export interface MinimalPrd {
  name: string;
  description: string;
  userStories: Pick<UserStory, "id" | "title" | "description" | "acceptanceCriteria" | "priority" | "passes">[];
}

/**
 * JSON Schema for PRD validation
 * Can be used with AJV or other JSON Schema validators
 */
export const PRD_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://bootstralph.dev/schemas/prd.json",
  title: "PRD Schema",
  description: "Product Requirements Document schema for Ralph Loop",
  type: "object",
  required: ["name", "version", "description", "status", "userStories"],
  properties: {
    name: {
      type: "string",
      description: "Project or feature name",
      minLength: 1,
    },
    version: {
      type: "string",
      description: "PRD version (semver recommended)",
      pattern: "^\\d+\\.\\d+\\.\\d+(-[a-zA-Z0-9.]+)?$",
    },
    description: {
      type: "string",
      description: "Brief description of the project/feature",
    },
    status: {
      type: "string",
      enum: ["planning", "in_progress", "completed", "paused", "blocked"],
      description: "Current status of the PRD",
    },
    branchName: {
      type: "string",
      description: "Git branch name for this PRD's work",
      pattern: "^[a-zA-Z0-9._/-]+$",
    },
    mode: {
      type: "string",
      enum: ["feature", "backlog"],
      description: "PRD mode: feature (one branch) or backlog (branch-per-story)",
    },
    githubRepo: {
      type: "string",
      description: "GitHub repository in owner/repo format",
      pattern: "^[a-zA-Z0-9._-]+/[a-zA-Z0-9._-]+$",
    },
    reviewTasks: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "category", "task", "check", "status"],
        properties: {
          id: { type: "string" },
          category: { type: "string" },
          task: { type: "string" },
          check: { type: "string" },
          status: {
            type: "string",
            enum: ["pending", "in_progress", "completed", "failed", "blocked"],
          },
          finding: { type: "string" },
          actionRequired: { type: ["string", "null"] },
        },
      },
    },
    userStories: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "title", "description", "acceptanceCriteria", "priority", "passes"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          acceptanceCriteria: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
          },
          priority: { type: "integer", minimum: 1 },
          passes: { type: "boolean" },
          dependsOn: {
            type: "array",
            items: { type: "string" },
          },
          notes: { type: "string" },
          startedAt: { type: "string", format: "date-time" },
          completedAt: { type: "string", format: "date-time" },
          githubIssue: { type: "integer" },
        },
      },
      minItems: 1,
    },
    plugins: {
      type: "object",
      properties: {
        recommended: {
          type: "array",
          items: { type: "string" },
        },
        optional: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
    metadata: {
      type: "object",
      properties: {
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
        createdBy: { type: "string" },
        completionPromise: { type: "string" },
      },
    },
  },
} as const;

/**
 * Default completion promise used by Ralph to detect when all stories pass
 */
export const DEFAULT_COMPLETION_PROMISE = "<promise>COMPLETE</promise>";

/**
 * Check if a PRD is complete (all user stories pass)
 */
export function isPrdComplete(prd: Prd): boolean {
  return prd.userStories.every((story) => story.passes);
}

/**
 * Get the next uncompleted story with highest priority
 */
export function getNextStory(prd: Prd): UserStory | undefined {
  const incomplete = prd.userStories
    .filter((story) => !story.passes)
    .filter((story) => {
      // Check if all dependencies are satisfied
      if (!story.dependsOn || story.dependsOn.length === 0) return true;
      return story.dependsOn.every((depId) => {
        const dep = prd.userStories.find((s) => s.id === depId);
        return dep?.passes === true;
      });
    })
    .sort((a, b) => a.priority - b.priority);

  return incomplete[0];
}

/**
 * Get progress statistics for a PRD
 */
export function getPrdProgress(prd: Prd): {
  total: number;
  completed: number;
  remaining: number;
  percentage: number;
} {
  const total = prd.userStories.length;
  const completed = prd.userStories.filter((s) => s.passes).length;
  const remaining = total - completed;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { total, completed, remaining, percentage };
}

/**
 * Generate a slug from PRD name for filename
 */
export function generatePrdSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

/**
 * Generate the PRD filename
 */
export function generatePrdFilename(name: string): string {
  const slug = generatePrdSlug(name);
  return `prd-${slug}.json`;
}
