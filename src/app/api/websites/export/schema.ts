import { z } from "zod";
import { enums, primitives } from "@pdm/schemas";

/**
 * Query filters accepted by the CSV export.
 *
 * ⚠️ A DELIBERATELY NARROW SUBSET of `websiteListQuerySchema`: sort, paging and
 * the health band have no meaning in an export, and accepting them would invite
 * someone to page an export. Unknown or malformed values fall back to "no
 * filter" rather than erroring — a bad link should export the portfolio, not a
 * 400.
 */
export const websiteSchemas = z
  .object({
    search: z.string().trim().max(200).optional(),
    clientId: primitives.uuid.optional(),
    groupId: primitives.uuid.optional(),
    status: enums.monitoringStatus.optional(),
  })
  .catch({});
