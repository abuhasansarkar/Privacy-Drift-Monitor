// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/sentry";

const options = sentryOptions();
if (options) {
  Sentry.init(options);
}
