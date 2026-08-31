/**
 * @pdm/email — PLAN.md Part IX §9.5.
 *
 * Templates, the branded layout, and the Resend transport. Nothing here reads a
 * database or a queue: a caller renders a message with explicit branding and
 * hands it to the transport, which is what keeps the leakage rule (§6.9)
 * checkable by reading one function signature.
 */
export { renderMessage, renderLayout } from "./templates";
export type {
  EmailContext,
  EmailMessage,
  EmailTemplateName,
  DigestGroupPayload,
  RenderedEmail,
} from "./templates";
export {
  createResendTransport,
  emailCircuitState,
  resendConfigFromEnv,
} from "./client";
export type {
  EmailAddress,
  EmailTransport,
  ResendConfig,
  SendEmailInput,
  SendEmailResult,
} from "./client";
export { emailCopy, fill } from "./copy/en";
export { escapeHtml, toPlainText } from "./html";
