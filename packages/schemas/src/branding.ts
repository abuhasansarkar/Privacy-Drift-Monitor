import { z } from "zod";
import { email, hexColor, httpUrl } from "./primitives";

/**
 * BRANDING INPUT — §6.9.
 *
 * ⚠️ CONTRAST IS NOT VALIDATED HERE. Zod validates SHAPE; the WCAG check lives
 * in `@pdm/shared/branding` and runs in the save action, because its failure
 * message has to name the ratio and the surface ("2.1:1 against white, needs
 * 3:1") — which is a computed sentence, not a schema message.
 */
export const brandingSchema = z.object({
  companyName: z.string().trim().min(1).max(80).nullable().default(null),
  logoLightUrl: httpUrl.nullable().default(null),
  logoDarkUrl: httpUrl.nullable().default(null),
  primaryColor: hexColor,
  accentColor: hexColor,
  contactEmail: email.nullable().default(null),
  contactPhone: z.string().trim().max(40).nullable().default(null),
  reportFooterText: z.string().trim().max(200).nullable().default(null),
  /**
   * ⚠️ APPENDED to our base disclaimer, never a replacement (§6.8). The field
   * name says "custom", the renderer concatenates, and there is deliberately no
   * input that could replace `BASE_DISCLAIMER`.
   */
  customDisclaimer: z.string().trim().max(600).nullable().default(null),
  portalWelcomeText: z.string().trim().max(400).nullable().default(null),
});

export type BrandingInput = z.infer<typeof brandingSchema>;
